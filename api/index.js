const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3');
const { promisify } = require('util');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ========== BANCO DE DADOS ==========
const db = new sqlite3.Database('./database.sqlite');
const run = promisify(db.run.bind(db));
const query = promisify(db.all.bind(db));

// Criar tabelas
(async () => {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        mercadopago_id TEXT UNIQUE,
        discord_user_id TEXT,
        minecraft_username TEXT,
        product TEXT,
        amount REAL,
        status TEXT,
        command TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('📦 Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
  }
})();

// ========== MERCADO PAGO (CORRIGIDO) ==========
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
});
const payment = new Payment(client);

// ========== PRODUTOS ==========
const PRODUCTS = {
  'vip': { 
    name: '🌟 Rank VIP', 
    price: 10, 
    command: 'lp user {username} parent add vip' 
  },
  'diamonds': { 
    name: '💎 64 Diamantes', 
    price: 5, 
    command: 'give {username} diamond 64' 
  },
  'gold': { 
    name: '🪙 32 Ouros', 
    price: 3, 
    command: 'give {username} gold_ingot 32' 
  }
};

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());

// ========== ROTA: Criar Pagamento ==========
app.post('/api/payment/create', async (req, res) => {
  try {
    const { userId, username, productId } = req.body;
    const product = PRODUCTS[productId];

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const paymentId = uuidv4();
    const externalReference = `payment_${paymentId}`;

    // Criar pagamento no Mercado Pago (CORRIGIDO)
    const result = await payment.create({
      body: {
        transaction_amount: product.price,
        description: product.name,
        payment_method_id: 'pix',
        payer: { email: `${userId}@discord.user` },
        external_reference: externalReference,
        notification_url: `${process.env.API_URL}/api/webhook/mercadopago`
      }
    });

    // Salvar no banco
    await run(
      `INSERT INTO payments (id, mercadopago_id, discord_user_id, minecraft_username, product, amount, status, command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, result.id, userId, username, product.name, product.price, 'pending', product.command]
    );

    // Buscar QR Code (CORRIGIDO)
    const qrResponse = await payment.get({ id: result.id });
    const qrCode = qrResponse.point_of_interaction?.transaction_data?.qr_code;
    const ticketUrl = qrResponse.point_of_interaction?.transaction_data?.ticket_url;

    res.json({
      success: true,
      paymentId,
      qrCode,
      ticketUrl,
      amount: product.price,
      product: product.name
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

// ========== ROTA: Webhook ==========
app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    console.log('📨 Webhook recebido!');
    const { data } = req.body;
    const mercadopagoId = data?.id;

    if (!mercadopagoId) {
      return res.status(400).json({ error: 'ID não encontrado' });
    }

    // Verificar status (CORRIGIDO)
    const mpResponse = await payment.get({ id: mercadopagoId });
    const status = mpResponse.status;

    if (status === 'approved') {
      const payments = await query(
        'SELECT * FROM payments WHERE mercadopago_id = ? AND status = ?',
        [mercadopagoId, 'pending']
      );

      if (payments && payments.length > 0) {
        const p = payments[0];
        const command = p.command.replace(/{username}/g, p.minecraft_username);

        // ENVIAR PRO MINECRAFT VIA RCON
        try {
          const Rcon = require('rcon-client').Rcon;
          const rcon = new Rcon({
            host: process.env.MINECRAFT_HOST || 'localhost',
            port: parseInt(process.env.RCON_PORT || '25575'),
            password: process.env.RCON_PASSWORD || 'senha123'
          });

          await rcon.connect();
          await rcon.send(command);
          await rcon.end();
          console.log(`✅ Comando executado: ${command}`);
        } catch (rconError) {
          console.error('❌ Erro no RCON:', rconError);
        }

        await run(
          `UPDATE payments SET status = 'delivered' WHERE id = ?`,
          [p.id]
        );
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Erro no webhook' });
  }
});

// ========== ROTA: Verificar Status ==========
app.get('/api/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payments = await query('SELECT * FROM payments WHERE id = ?', [paymentId]);
    
    if (!payments || payments.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    res.json({ success: true, status: payments[0].status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar status' });
  }
});

// ========== ROTA: Listar Produtos ==========
app.get('/api/products', (req, res) => {
  res.json({
    products: Object.entries(PRODUCTS).map(([id, product]) => ({
      id,
      name: product.name,
      price: product.price
    }))
  });
});

// ========== ROTA: Health Check ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API rodando em http://0.0.0.0:${PORT}`);
  console.log(`📦 Banco: database.sqlite`);
  console.log(`📦 Produtos disponíveis: ${Object.keys(PRODUCTS).join(', ')}`);
});
