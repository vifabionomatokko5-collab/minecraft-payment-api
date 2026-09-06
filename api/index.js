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
    
    // Adicionar coluna category se não existir
    const checkColumn = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='products' AND column_name='category'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('🔄 Adicionando coluna category...');
      await query('ALTER TABLE products ADD COLUMN category TEXT');
      console.log('✅ Coluna category adicionada!');
    }
    
    // Tabela de configurações do servidor (COM LOGS_CHANNEL_ID)
    await query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        message_id TEXT,
        logs_channel_id TEXT,
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
        command TEXT,
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

// ========== DELETAR TODOS OS PRODUTOS ==========
app.delete('/api/products/clear', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM products');
    console.log('✅ Todos os produtos foram deletados');
    res.json({ success: true, message: 'Todos os produtos foram deletados' });
  } catch (error) {
    console.error('❌ Erro ao deletar produtos:', error);
    res.status(500).json({ error: 'Erro ao deletar produtos' });
  }
});

// ========== CHECKOUT ==========
app.get('/checkout', (req, res) => {
  res.render('checkout');
});

// ========== BUSCAR PRODUTO POR ID ==========
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM products WHERE id = $1 AND active = 1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

// ========== ROTAS DE CUPONS ==========

// Criar cupom
app.post('/api/coupons', authMiddleware, async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_purchase, max_uses, expires_at, command } = req.body;
    
    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ error: 'Código, tipo e valor são obrigatórios' });
    }
    
    const id = uuidv4();
    await query(
      `INSERT INTO coupons (id, code, discount_type, discount_value, min_purchase, max_uses, expires_at, command)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, code.toUpperCase(), discount_type, discount_value, min_purchase || 0, max_uses || 1, expires_at || null, command || null]
    );
    
    res.json({ success: true, id, code: code.toUpperCase(), command });
  } catch (error) {
    console.error('❌ Erro ao criar cupom:', error);
    res.status(500).json({ error: 'Erro ao criar cupom' });
  }
});

// Listar cupons
app.get('/api/coupons', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar cupons:', error);
    res.status(500).json({ error: 'Erro ao listar cupons' });
  }
});

// Validar cupom
app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { code, amount } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Código do cupom é obrigatório' });
    }
    
    const result = await query(
      `SELECT * FROM coupons 
       WHERE code = $1 
       AND active = 1 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR max_uses = 0 OR used_count < max_uses)`,
      [code.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cupom inválido ou expirado' });
    }
    
    const coupon = result.rows[0];
    
    if (amount < coupon.min_purchase) {
      return res.status(400).json({ 
        error: `Compra mínima de R$ ${coupon.min_purchase.toFixed(2)}`,
        min_purchase: coupon.min_purchase
      });
    }
    
    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (amount * coupon.discount_value) / 100;
    } else {
      discount = coupon.discount_value;
    }
    
    res.json({
      valid: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_amount: discount,
      final_amount: amount - discount,
      min_purchase: coupon.min_purchase,
      command: coupon.command,
      is_permanent: coupon.max_uses === null || coupon.max_uses === 0
    });
  } catch (error) {
    console.error('❌ Erro ao validar cupom:', error);
    res.status(500).json({ error: 'Erro ao validar cupom' });
  }
});

// Usar cupom
app.post('/api/coupons/use', authMiddleware, async (req, res) => {
  try {
    const { code, username } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Código do cupom é obrigatório' });
    }
    
    const result = await query(
      `SELECT * FROM coupons 
       WHERE code = $1 
       AND active = 1 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR max_uses = 0 OR used_count < max_uses)`,
      [code.toUpperCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cupom inválido ou expirado' });
    }
    
    const coupon = result.rows[0];
    
    if (coupon.max_uses !== null && coupon.max_uses > 0) {
      await query(
        `UPDATE coupons SET used_count = used_count + 1 WHERE code = $1`,
        [code.toUpperCase()]
      );
    }
    
    let commandExecuted = false;
    if (coupon.command) {
      try {
        const command = coupon.command.replace(/{username}/g, username);
        
        try {
          const axios = require('axios');
          await axios.post('http://localhost:8080/execute', {
            username: username,
            command: command,
            token: process.env.API_SECRET_TOKEN || 'M1n3P4yM3nt-S3cr3t-T0k3n-2026!'
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          });
          console.log(`✅ Comando do cupom executado: ${command}`);
          commandExecuted = true;
        } catch (pluginError) {
          console.error('❌ Plugin HTTP falhou:', pluginError.message);
          
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
            console.log(`✅ Comando via RCON: ${command}`);
            commandExecuted = true;
          } catch (rconError) {
            console.error('❌ RCON falhou:', rconError.message);
          }
        }
      } catch (error) {
        console.error('❌ Erro ao executar comando do cupom:', error);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Cupom usado com sucesso',
      commandExecuted,
      command: coupon.command,
      remaining_uses: coupon.max_uses !== null && coupon.max_uses > 0 ? coupon.max_uses - (coupon.used_count + 1) : '∞'
    });
  } catch (error) {
    console.error('❌ Erro ao usar cupom:', error);
    res.status(500).json({ error: 'Erro ao usar cupom' });
  }
});

// ========== ROTAS DE ESTATÍSTICAS ==========

// ROTA: Estatísticas gerais
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const totalOrders = await query('SELECT COUNT(*) FROM payments');
    const deliveredOrders = await query('SELECT COUNT(*) FROM payments WHERE status = $1', ['delivered']);
    const pendingOrders = await query('SELECT COUNT(*) FROM payments WHERE status = $1', ['pending']);
    const revenue = await query('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = $1', ['delivered']);
    const recentOrders = await query(
      'SELECT * FROM payments ORDER BY created_at DESC LIMIT 10'
    );
    
    res.json({
      total_orders: parseInt(totalOrders.rows[0].count) || 0,
      delivered_orders: parseInt(deliveredOrders.rows[0].count) || 0,
      pending_orders: parseInt(pendingOrders.rows[0].count) || 0,
      total_revenue: parseFloat(revenue.rows[0].coalesce) || 0,
      recent_orders: recentOrders.rows
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// ROTA: Logs de compras
app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await query(
      `SELECT * FROM payments 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const total = await query('SELECT COUNT(*) FROM payments');
    
    res.json({
      logs: result.rows,
      total: parseInt(total.rows[0].count) || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('❌ Erro ao buscar logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// ROTA: Log de uma compra específica
app.get('/api/logs/:paymentId', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Erro ao buscar log:', error);
    res.status(500).json({ error: 'Erro ao buscar log' });
  }
});

// ========== ROTAS DE LOGS DO GUILD ==========

// Salvar canal de logs
app.post('/api/guild/logs', authMiddleware, async (req, res) => {
  try {
    const { guildId, channelId } = req.body;
    
    if (!guildId || !channelId) {
      return res.status(400).json({ error: 'guildId e channelId são obrigatórios' });
    }

    await query(
      `INSERT INTO guild_settings (guild_id, logs_channel_id, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (guild_id) DO UPDATE SET logs_channel_id = $2, updated_at = CURRENT_TIMESTAMP`,
      [guildId, channelId]
    );
    
    res.json({ success: true, message: 'Canal de logs salvo com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao salvar canal de logs:', error);
    res.status(500).json({ error: 'Erro ao salvar canal de logs' });
  }
});

// Buscar canal de logs
app.get('/api/guild/logs/:guildId', authMiddleware, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    const result = await query(
      'SELECT logs_channel_id FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('❌ Erro ao buscar canal de logs:', error);
    res.status(500).json({ error: 'Erro ao buscar canal de logs' });
  }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 API + Site rodando em http://0.0.0.0:${PORT}`);
  console.log(`📦 Banco: PostgreSQL (${process.env.DATABASE_URL ? 'Conectado' : 'Desconectado'})`);
  console.log(`🌐 Site disponível em: https://minecraft-payment-api.onrender.com`);
});
