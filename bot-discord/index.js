const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// URL FIXA DA API
const API_URL = 'https://minecraft-payment-api.onrender.com';

// ========== BANCO DE DADOS LOCAL ==========
const guildSettings = new Map();

// ========== COMANDOS ==========
const commands = [
  {
    name: 'comprar',
    description: 'Compre itens para o servidor Minecraft',
    options: [
      {
        name: 'produto',
        description: 'Produto que deseja comprar',
        type: 3,
        required: true,
        choices: [
          { name: '🧱 1 Terra (TESTE - R$0,01)', value: 'dirt' },
          { name: '🌟 Rank VIP', value: 'vip' },
          { name: '💎 64 Diamantes', value: 'diamonds' },
          { name: '🪙 32 Ouros', value: 'gold' }
        ]
      },
      {
        name: 'username',
        description: 'Seu nickname no Minecraft',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'set-loja',
    description: 'Define o canal onde os pedidos serão enviados (APENAS ADM)',
    options: [
      {
        name: 'canal',
        description: 'Canal onde os pedidos serão enviados',
        type: 7,
        required: true
      }
    ],
    default_member_permissions: String(PermissionsBitField.Flags.Administrator)
  }
];

// ========== EVENTO: Bot pronto ==========
client.once('ready', async () => {
  console.log(`🤖 Bot ${client.user?.tag} está online!`);
  console.log(`📡 API URL: ${API_URL}`);
  await client.application?.commands.set(commands);
  console.log('✅ Comandos registrados!');
});

// ========== EVENTO: Interações ==========
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  // ===== COMANDO: /set-loja =====
  if (interaction.commandName === 'set-loja') {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este comando!',
          ephemeral: true
        });
      }

      const channel = interaction.options.get('canal').channel;
      guildSettings.set(interaction.guildId, channel.id);
      
      await interaction.reply({
        content: `✅ Canal de loja definido como: <#${channel.id}>`,
        ephemeral: true
      });
      
      console.log(`📌 Canal de loja definido: ${channel.id}`);
    } catch (error) {
      console.error('❌ Erro no /set-loja:', error);
      await interaction.reply({
        content: '❌ Erro ao definir o canal.',
        ephemeral: true
      });
    }
  }

  // ===== COMANDO: /comprar =====
  if (interaction.commandName === 'comprar') {
    try {
      await interaction.deferReply({ ephemeral: true });

      const productId = interaction.options.get('produto')?.value;
      const username = interaction.options.get('username')?.value;

      console.log(`📝 Pedido: ${productId} para ${username} por ${interaction.user.tag}`);
      console.log(`📡 Chamando API: ${API_URL}/api/payment/create`);

      // Chamar a API para criar pagamento
      const response = await axios.post(`${API_URL}/api/payment/create`, {
        userId: interaction.user.id,
        username,
        productId
      });

      console.log('✅ Resposta da API:', response.data);

      const { qrCode, ticketUrl, amount, product, paymentId } = response.data;

      // ========== CORREÇÃO DO QR CODE ==========
      // Gerar URL da imagem do QR Code usando Google Charts
      const qrCodeImageUrl = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(qrCode)}`;
      console.log(`📱 QR Code URL: ${qrCodeImageUrl}`);

      // Embed do pagamento
      const embed = new EmbedBuilder()
        .setTitle('🛒 Pagamento PIX')
        .setDescription(`**Produto:** ${product}\n**Preço:** R$ ${amount.toFixed(2)}\n**Jogador:** ${username}`)
        .setColor('#00ff88')
        .setImage(qrCodeImageUrl) // Agora com URL válida!
        .setFooter({ text: `ID: ${paymentId}` })
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setURL(ticketUrl)
            .setLabel('📱 Copiar PIX')
            .setStyle(ButtonStyle.Link)
        )
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`check_${paymentId}`)
            .setLabel('✅ Verificar Pagamento')
            .setStyle(ButtonStyle.Success)
        );

      await interaction.editReply({
        content: '📲 Escaneie o QR Code para pagar:',
        embeds: [embed],
        components: [row]
      });

      // ===== ENVIAR PEDIDO PARA O CANAL DA LOJA =====
      const channelId = guildSettings.get(interaction.guildId);
      if (channelId) {
        try {
          const storeChannel = await interaction.guild.channels.fetch(channelId);
          if (storeChannel) {
            const orderEmbed = new EmbedBuilder()
              .setTitle('🛒 NOVO PEDIDO')
              .setDescription(`**Produto:** ${product}\n**Preço:** R$ ${amount.toFixed(2)}\n**Jogador:** ${username}\n**Status:** ⏳ Aguardando pagamento`)
              .setColor('#ffaa00')
              .setFooter({ text: `ID: ${paymentId} | Comprador: ${interaction.user.tag}` })
              .setTimestamp();

            await storeChannel.send({
              content: `🔔 Novo pedido de <@${interaction.user.id}>!`,
              embeds: [orderEmbed]
            });
          }
        } catch (error) {
          console.error('❌ Erro ao enviar para o canal:', error);
        }
      }

      // ===== COLLECTOR: Verificar pagamento =====
      const collector = interaction.channel?.createMessageComponentCollector({
        filter: (i) => i.customId === `check_${paymentId}` && i.user.id === interaction.user.id,
        time: 300000 // 5 minutos
      });

      collector?.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferReply({ ephemeral: true });
        
        try {
          const statusResponse = await axios.get(`${API_URL}/api/payment/${paymentId}`);
          const { status } = statusResponse.data;

          if (status === 'delivered') {
            await buttonInteraction.editReply({
              content: '✅ **Pagamento confirmado!** O item foi entregue no Minecraft!'
            });
            await interaction.editReply({ components: [] });

            // Atualizar pedido no canal da loja
            if (channelId) {
              try {
                const storeChannel = await interaction.guild.channels.fetch(channelId);
                if (storeChannel) {
                  const updatedEmbed = new EmbedBuilder()
                    .setTitle('🛒 PEDIDO ENTREGUE')
                    .setDescription(`**Produto:** ${product}\n**Preço:** R$ ${amount.toFixed(2)}\n**Jogador:** ${username}\n**Status:** ✅ Entregue!`)
                    .setColor('#00ff88')
                    .setFooter({ text: `ID: ${paymentId} | Comprador: ${interaction.user.tag}` })
                    .setTimestamp();

                  await storeChannel.send({
                    content: `✅ Pedido de <@${interaction.user.id}> foi entregue!`,
                    embeds: [updatedEmbed]
                  });
                }
              } catch (error) {
                console.error('❌ Erro ao atualizar pedido:', error);
              }
            }
          } else if (status === 'pending') {
            await buttonInteraction.editReply({
              content: '⏳ Pagamento ainda não confirmado. Aguarde alguns instantes...'
            });
          } else {
            await buttonInteraction.editReply({
              content: '❌ Ocorreu um erro. Entre em contato com a administração.'
            });
          }
        } catch (error) {
          console.error('❌ Erro ao verificar status:', error);
          await buttonInteraction.editReply({
            content: '❌ Erro ao verificar pagamento. Tente novamente.'
          });
        }
      });

    } catch (error) {
      console.error('❌ Erro no comando comprar:', error);
      
      if (error.code === 'ECONNREFUSED') {
        await interaction.editReply({
          content: `❌ Não foi possível conectar à API.\nURL: ${API_URL}`
        });
      } else if (error.response) {
        await interaction.editReply({
          content: `❌ Erro da API: ${error.response.data?.error || 'Erro desconhecido'}`
        });
      } else {
        await interaction.editReply({
          content: '❌ Erro ao processar seu pedido. Tente novamente.'
        });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
