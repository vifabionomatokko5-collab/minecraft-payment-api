const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const API_URL = process.env.API_URL || 'http://localhost:3000';

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
  }
];

client.once('ready', async () => {
  console.log(`🤖 Bot ${client.user?.tag} está online!`);
  await client.application?.commands.set(commands);
  console.log('✅ Comandos registrados!');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName !== 'comprar') return;

  await interaction.deferReply({ ephemeral: true });

  const productId = interaction.options.get('produto')?.value;
  const username = interaction.options.get('username')?.value;

  try {
    const response = await axios.post(`${API_URL}/api/payment/create`, {
      userId: interaction.user.id,
      username,
      productId
    });

    const { qrCode, ticketUrl, amount, product, paymentId } = response.data;

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

    const collector = interaction.channel?.createMessageComponentCollector({
      filter: (i) => i.customId === `check_${paymentId}` && i.user.id === interaction.user.id,
      time: 300000
    });

    collector?.on('collect', async (buttonInteraction) => {
      await buttonInteraction.deferReply({ ephemeral: true });
      const statusResponse = await axios.get(`${API_URL}/api/payment/${paymentId}`);
      const { status } = statusResponse.data;

      if (status === 'delivered') {
        await buttonInteraction.editReply({
          content: '✅ **Pagamento confirmado!** O item foi entregue no Minecraft!'
        });
        await interaction.editReply({ components: [] });
      } else if (status === 'pending') {
        await buttonInteraction.editReply({
          content: '⏳ Pagamento ainda não confirmado. Aguarde alguns instantes...'
        });
      } else {
        await buttonInteraction.editReply({
          content: '❌ Ocorreu um erro. Entre em contato com a administração.'
        });
      }
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    await interaction.editReply('❌ Erro ao processar seu pedido.');
  }
});

client.login(process.env.DISCORD_TOKEN);
