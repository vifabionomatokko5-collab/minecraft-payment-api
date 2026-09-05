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

(async () => {
  try {
    // Tabela de pagamentos
    await run(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        mercadopago_id TEXT UNIQUE,
        discord_user_id TEXT,
        minecraft_username TEXT,
        product_id TEXT,
        product_name TEXT,
        amount REAL,
        status TEXT,
        command TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME
      )
    `);
    
    // Tabela de produtos
    await run(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        price REAL,
        command TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela de configurações do servidor
    await run(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        message_id TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('📦 Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  }
})();

// ========== MERCADO PAGO ==========
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
});
const payment = new Payment(client);

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization'];
  const expectedToken = process.env.API_SECRET_TOKEN || 'M1n3P4yM3nt-S3cr3t-T0k3n-2026!';
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
  
  if (cleanToken !== expectedToken) {
    return res.status(403).json({ error: 'Token inválido' });
  }
  
  next();
};

// ========== ROTAS PÚBLICAS ==========

// ROTA: Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ROTA: Verificar status
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

// ========== ROTAS PROTEGIDAS ==========

// ROTA: Listar produtos
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const products = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// ROTA: Adicionar produto
app.post('/api/products', authMiddleware, async (req, res) => {
  try {
    const { name, price, command } = req.body;
    
    if (!name || !price || !command) {
      return res.status(400).json({ error: 'Nome, preço e comando são obrigatórios' });
    }
    
    const id = uuidv4();
    await run(
      'INSERT INTO products (id, name, price, command) VALUES (?, ?, ?, ?)',
      [id, name, price, command]
    );
    
    res.json({ success: true, id, name, price, command });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar produto' });
  }
});

// ROTA: Remover produto
app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await run('UPDATE products SET active = 0 WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

// ROTA: Criar Pagamento
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  try {
    const { userId, username, productId } = req.body;
    
    const products = await query('SELECT * FROM products WHERE id = ? AND active = 1', [productId]);
    
    if (!products || products.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    const product = products[0];
    const paymentId = uuidv4();
    const externalReference = `payment_${paymentId}`;

    const result = await payment.create({
      body: {
        transaction_amount: product.price,
        description: product.name,
        payment_method_id: 'pix',
        payer: { email: 'comprador@email.com' },
        external_reference: externalReference,
        notification_url: 'https://minecraft-payment-api.onrender.com/api/webhook/mercadopago'
      }
    });

    await run(
      `INSERT INTO payments (id, mercadopago_id, discord_user_id, minecraft_username, product_id, product_name, amount, status, command)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, result.id, userId, username, product.id, product.name, product.price, 'pending', product.command]
    );

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

// ROTA: Webhook
app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    console.log('📨 Webhook recebido!');
    const { data } = req.body;
    const mercadopagoId = data?.id;

    if (!mercadopagoId) {
      return res.status(400).json({ error: 'ID não encontrado' });
    }

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
          `UPDATE payments SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?`,
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

// ========== ROTAS DO PLUGIN ==========

// ROTA: Buscar compras pendentes
app.get('/api/purchases/pending', authMiddleware, async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username não informado' });
    }

    const payments = await query(
      `SELECT * FROM payments 
       WHERE minecraft_username = ? 
       AND status = 'pending' 
       ORDER BY created_at DESC`,
      [username]
    );

    res.json(payments);
  } catch (error) {
    console.error('❌ Erro ao buscar compras pendentes:', error);
    res.status(500).json({ error: 'Erro ao buscar compras' });
  }
});

// ROTA: Marcar compra como entregue
app.post('/api/purchases/deliver', authMiddleware, async (req, res) => {
  try {
    const { purchaseId } = req.body;
    
    if (!purchaseId) {
      return res.status(400).json({ error: 'ID da compra não informado' });
    }

    await run(
      `UPDATE payments 
       SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND status = 'pending'`,
      [purchaseId]
    );

    res.json({ success: true, message: 'Compra marcada como entregue' });
  } catch (error) {
    console.error('❌ Erro ao marcar compra como entregue:', error);
    res.status(500).json({ error: 'Erro ao marcar compra' });
  }
});

// ========== ROTAS DE CONFIGURAÇÃO DO SERVIDOR ==========

// ROTA: Salvar configuração do servidor
app.post('/api/guild/settings', authMiddleware, async (req, res) => {
  try {
    const { guildId, channelId, messageId } = req.body;
    
    if (!guildId || !channelId) {
      return res.status(400).json({ error: 'guildId e channelId são obrigatórios' });
    }

    await run(
      `INSERT OR REPLACE INTO guild_settings (guild_id, channel_id, message_id, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [guildId, channelId, messageId || '']
    );
    
    res.json({ success: true, message: 'Configuração salva com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// ROTA: Buscar configuração do servidor
app.get('/api/guild/settings/:guildId', authMiddleware, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    const settings = await query(
      'SELECT * FROM guild_settings WHERE guild_id = ?',
      [guildId]
    );
    
    if (settings && settings.length > 0) {
      res.json(settings[0]);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('❌ Erro ao buscar configuração:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração' });
  }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API rodando em http://0.0.0.0:${PORT}`);
  console.log(`📦 Banco: database.sqlite`);
  console.log(`🔒 Rotas protegidas com token`);
  console.log(`📌 Rotas de configuração: /api/guild/settings`);
});
