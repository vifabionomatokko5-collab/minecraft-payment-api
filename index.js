const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mercadopago = require('mercadopago');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

// Banco de dados em memória (simples)
const payments = new Map();
const products = {
  'vip': { name: 'Rank VIP', price: 10.00, command: 'lp user {username} parent add vip' },
  'diamonds': { name: '64 Diamantes', price: 5.00, command: 'give {username} diamond 64' }
};

// ROTA 1: Criar pagamento
app.post('/api/payment/create', async (req, res) => {
  try {
    const { userId, username, productId } = req.body;
    const product = products[productId];
    
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const paymentId = Date.now().toString();
    const externalRef = `payment_${paymentId}`;

    // Criar pagamento no Mercado Pago
    const payment = await mercadopago.payment.create({
      transaction_amount: product.price,
      description: product.name,
      payment_method_id: 'pix',
      payer: { email: 'comprador@email.com' },
      external_reference: externalRef,
      notification_url: `${process.env.API_URL}/api/webhook/mercadopago`
    });

    // Salvar no "banco"
    payments.set(paymentId, {
      id: paymentId,
      mercadopagoId: payment.body.id,
      userId,
      username,
      product: product.name,
      price: product.price,
      command: product.command,
      status: 'pending'
    });

    // Buscar QR Code
    const qrResponse = await mercadopago.payment.get(payment.body.id);
    const qrCode = qrResponse.body.point_of_interaction?.transaction_data?.qr_code;
    const ticketUrl = qrResponse.body.point_of_interaction?.transaction_data?.ticket_url;

    res.json({
      success: true,
      paymentId,
      qrCode,
      ticketUrl,
      amount: product.price,
      product: product.name
    });
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

// ROTA 2: Webhook do Mercado Pago
app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    const { data } = req.body;
    const mercadopagoId = data?.id;

    if (!mercadopagoId) {
      return res.status(400).json({ error: 'ID não encontrado' });
    }

    // Buscar pagamento no Mercado Pago
    const mpResponse = await mercadopago.payment.get(mercadopagoId);
    const status = mpResponse.body.status;

    if (status === 'approved') {
      // Encontrar o pagamento no nosso banco
      for (const [key, payment] of payments) {
        if (payment.mercadopagoId === mercadopagoId && payment.status === 'pending') {
          // Entregar no Minecraft
          try {
            const command = payment.command.replace(/{username}/g, payment.username);
            
            // Enviar comando pro Minecraft (via HTTP)
            await axios.post(process.env.MINECRAFT_API_URL, {
              username: payment.username,
              command: command,
              token: process.env.MINECRAFT_API_TOKEN
            });

            payment.status = 'delivered';
            console.log(`✅ Entregue ${payment.product} para ${payment.username}`);
          } catch (error) {
            console.error('❌ Erro ao entregar:', error);
          }
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Erro no webhook' });
  }
});

// ROTA 3: Verificar status
app.get('/api/payment/:paymentId', (req, res) => {
  const { paymentId } = req.params;
  const payment = payments.get(paymentId);
  
  if (!payment) {
    return res.status(404).json({ error: 'Pagamento não encontrado' });
  }

  res.json({
    success: true,
    status: payment.status
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
  console.log(`📦 Produtos disponíveis: ${Object.keys(products).join(', ')}`);
});
