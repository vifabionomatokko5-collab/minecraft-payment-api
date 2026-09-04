const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const API_URL = process.env.API_URL || 'http://localhost:3000';

// ========== BANCO DE DADOS LOCAL (para salvar o canal) ==========
const guildSettings = new Map();

// ========== COMANDOS ==========
const commands = [
  // Comando de compra (público)
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
  // Comando de admin (apenas para ADMINS)
  {
    name: 'set-loja',
    description: 'Define o canal onde os pedidos serão enviados (APENAS ADM)',
    options: [
      {
        name: 'canal',
        description: 'Canal onde os pedidos serão enviados',
        type: 7, // CHANNEL
        required: true
      }
    ],
    default_member_permissions: String(PermissionsBitField.Flags.Administrator)
  }
];

// ========== EVENTO: Bot pronto ==========
client.once('ready', async () => {
  console.log(`🤖 Bot ${client.user?.tag} está online!`);
  await client.application?.commands.set(commands);
  console.log('✅ Comandos registrados!');
});

// ========== EVENTO: Interações ==========
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  // ===== COMANDO: /set-loja =====
  if (interaction.commandName === 'set-loja') {
    try {
      // Verificar se é ADMIN
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '❌ Você não tem permissão para usar este comando!',
          ephemeral: true
        });
      }

      const channel = interaction.options.get('canal').channel;
      
      // Salvar no "banco"
      guildSettings.set(interaction.guildId, channel.id);
      
      await interaction.reply({
        content: `✅ Canal de loja definido como: <#${channel.id}>`,
        ephemeral: true
      });
      
      console.log(`📌 Canal de loja definido: ${channel.id} no servidor ${interaction.guildId}`);
    } catch (error) {
      console.error('❌ Erro no /set-loja:', error);
      await interaction.reply({
        content: '❌ Erro ao definir o canal. Tente novamente.',
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

      // Chamar a API para criar pagamento
      const response = await axios.post(`${API_URL}/api/payment/create`, {
        userId: interaction.user.id,
        username,
        productId
      });

      console.log('✅ Resposta da API:', response.data);

      const { qrCode, ticketUrl, amount, product, paymentId } = response.data;

      // Embed do pagamento
      const embed = new EmbedBuilder()
        .setTitle('🛒 Pagamento PIX')
        .setDescription(`**Produto:** ${product}\n**Preço:** R$ ${amount.toFixed(2)}\n**Jogador:** ${username}`)
        .setColor('#00ff88')
        .setImage(qrCode)
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
      console.log(`📌 Canal salvo: ${channelId}`);
      
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
            console.log('✅ Pedido enviado para o canal da loja');
          }
        } catch (error) {
          console.error('❌ Erro ao enviar para o canal da loja:', error);
        }
      } else {
        console.log('⚠️ Nenhum canal de loja configurado para este servidor');
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
      
      // Verificar se é erro de conexão com a API
      if (error.code === 'ECONNREFUSED') {
        await interaction.editReply({
          content: '❌ Não foi possível conectar à API. Verifique se a API está rodando no Render.\n\nURL da API: ' + API_URL
        });
      } else if (error.response) {
        // Erro da API
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

// ========== LOGIN ==========
client.login(process.env.DISCORD_TOKEN);
