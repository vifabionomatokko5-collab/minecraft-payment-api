const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const seedProducts = require('./seed');
const { query } = require('./src/config/database');
const authMiddleware = require('./src/middleware/auth');

// Importar rotas
const siteRoutes = require('./src/routes/site');
const paymentRoutes = require('./src/routes/payments');
const webhookRoutes = require('./src/routes/webhook');
const couponRoutes = require('./src/routes/coupons');
const pluginRoutes = require('./src/routes/plugin');
const linkRoutes = require('./src/routes/link');
const guildRoutes = require('./src/routes/guild');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÃO DO SITE ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views/pages'));
app.use(express.static(path.join(__dirname, 'public')));

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());

// ========== INICIALIZAR BANCO DE DADOS ==========
(async () => {
  try {
    // Tabela de pagamentos
    await query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP
      )
    `);
    
    // Tabela de produtos
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE,
        price REAL,
        command TEXT,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela de configurações do servidor
    await query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        message_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela de códigos de link
    await query(`
      CREATE TABLE IF NOT EXISTS link_codes (
        code TEXT PRIMARY KEY,
        discord_id TEXT,
        minecraft_username TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
      )
    `);

    // Tabela de contas linkadas
    await query(`
      CREATE TABLE IF NOT EXISTS linked_accounts (
        discord_id TEXT PRIMARY KEY,
        minecraft_username TEXT UNIQUE,
        linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela de cupons
    await query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE,
        discount_type TEXT CHECK(discount_type IN ('percentage', 'fixed')),
        discount_value REAL,
        min_purchase REAL DEFAULT 0,
        max_uses INTEGER DEFAULT 1,
        used_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('📦 Banco de dados inicializado com sucesso!');
    
    // Auto-seed
    await seedProducts();
    
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  }
})();

// ========== ROTAS ==========
app.use('/', siteRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/plugin', pluginRoutes);
app.use('/api/link', linkRoutes);
app.use('/api/guild', guildRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'PostgreSQL', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'offline' });
  }
});

// Produtos (precisa de autenticação)
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// ========== ROTAS DE COMPATIBILIDADE (para plugin antigo) ==========
app.get('/api/purchases/pending', authMiddleware, async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ error: 'Username não informado' });
    }

    const result = await query(
      `SELECT * FROM payments 
       WHERE minecraft_username = $1 
       AND status = 'pending' 
       ORDER BY created_at DESC`,
      [username]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao buscar compras pendentes:', error);
    res.status(500).json({ error: 'Erro ao buscar compras' });
  }
});

app.post('/api/purchases/deliver', authMiddleware, async (req, res) => {
  try {
    const { purchaseId } = req.body;
    
    if (!purchaseId) {
      return res.status(400).json({ error: 'ID da compra não informado' });
    }

    await query(
      `UPDATE payments 
       SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND status = 'pending'`,
      [purchaseId]
    );

    res.json({ success: true, message: 'Compra marcada como entregue' });
  } catch (error) {
    console.error('❌ Erro ao marcar compra:', error);
    res.status(500).json({ error: 'Erro ao marcar compra' });
  }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 API + Site rodando em http://0.0.0.0:${PORT}`);
  console.log(`📦 Banco: PostgreSQL (${process.env.DATABASE_URL ? 'Conectado' : 'Desconectado'})`);
  console.log(`🌐 Site disponível em: https://minecraft-payment-api.onrender.com`);
});
