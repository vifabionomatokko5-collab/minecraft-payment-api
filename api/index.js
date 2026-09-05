const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const seedProducts = require('./seed');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÃO DO BANCO DE DADOS ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const query = (text, params) => pool.query(text, params);

// ========== CONFIGURAÇÃO DO SITE ==========
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views/pages'));
app.use(express.static(path.join(__dirname, 'public')));

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

// ========== INICIALIZAR BANCO DE DADOS ==========
(async () => {
  try {
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
    
    await query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        message_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
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

    await query(`
      CREATE TABLE IF NOT EXISTS linked_accounts (
        discord_id TEXT PRIMARY KEY,
        minecraft_username TEXT UNIQUE,
        linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
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
    
    await seedProducts();
    
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  }
})();

// ========== MERCADO PAGO ==========
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
});
const payment = new Payment(client);

// ========== ROTAS DO SITE ==========

app.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.render('index', { products: result.rows });
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error);
    res.status(500).send('Erro ao carregar produtos');
  }
});

app.get('/comprar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM products WHERE id = $1 AND active = 1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send('Produto não encontrado');
    }
    
    res.render('comprar', { product: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao carregar produto:', error);
    res.status(500).send('Erro ao carregar produto');
  }
});

// ========== ROTAS PÚBLICAS DA API ==========

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'PostgreSQL', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'offline' });
  }
});

app.get('/api/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const result = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    res.json({ success: true, status: result.rows[0].status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar status' });
  }
});

// ========== ROTAS PROTEGIDAS DA API ==========

app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

app.post('/api/products', authMiddleware, async (req, res) => {
  try {
    const { name, price, command } = req.body;
    
    if (!name || !price || !command) {
      return res.status(400).json({ error: 'Nome, preço e comando são obrigatórios' });
    }
    
    const id = uuidv4();
    await query(
      'INSERT INTO products (id, name, price, command) VALUES ($1, $2, $3, $4)',
      [id, name, price, command]
    );
    
    res.json({ success: true, id, name, price, command });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao adicionar produto' });
  }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await query('UPDATE products SET active = 0 WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

// ========== ROTAS DE CUPONS ==========

app.post('/api/coupons', authMiddleware, async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_purchase, max_uses, expires_at } = req.body;
    
    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ error: 'Código, tipo e valor são obrigatórios' });
    }
    
    const id = uuidv4();
    await query(
      `INSERT INTO coupons (id, code, discount_type, discount_value, min_purchase, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, code.toUpperCase(), discount_type, discount_value, min_purchase || 0, max_uses || 1, expires_at || null]
    );
    
    res.json({ success: true, id, code: code.toUpperCase() });
  } catch (error) {
    console.error('❌ Erro ao criar cupom:', error);
    res.status(500).json({ error: 'Erro ao criar cupom' });
  }
});

app.get('/api/coupons', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar cupons:', error);
    res.status(500).json({ error: 'Erro ao listar cupons' });
  }
});

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
       AND (max_uses IS NULL OR used_count < max_uses)`,
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
      min_purchase: coupon.min_purchase
    });
  } catch (error) {
    console.error('❌ Erro ao validar cupom:', error);
    res.status(500).json({ error: 'Erro ao validar cupom' });
  }
});

app.post('/api/coupons/use', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Código do cupom é obrigatório' });
    }
    
    await query(
      `UPDATE coupons SET used_count = used_count + 1 WHERE code = $1`,
      [code.toUpperCase()]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao usar cupom:', error);
    res.status(500).json({ error: 'Erro ao usar cupom' });
  }
});

// ========== MERCADO PAGO - CRIAÇÃO DE PAGAMENTO ==========

app.post('/api/payment/create', async (req, res) => {
  try {
    const { userId, username, productId, couponCode } = req.body;
    
    const result = await query('SELECT * FROM products WHERE id = $1 AND active = 1', [productId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    const product = result.rows[0];
    let finalAmount = product.price;
    let discountInfo = null;
    
    if (couponCode) {
      const couponResult = await query(
        `SELECT * FROM coupons 
         WHERE code = $1 
         AND active = 1 
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)`,
        [couponCode.toUpperCase()]
      );
      
      if (couponResult.rows.length > 0) {
        const coupon = couponResult.rows[0];
        
        if (product.price >= coupon.min_purchase) {
          let discount = 0;
          if (coupon.discount_type === 'percentage') {
            discount = (product.price * coupon.discount_value) / 100;
          } else {
            discount = coupon.discount_value;
          }
          finalAmount = Math.max(0, product.price - discount);
          discountInfo = {
            code: coupon.code,
            type: coupon.discount_type,
            value: coupon.discount_value,
            discount_amount: discount
          };
        }
      }
    }
    
    const paymentId = uuidv4();
    const externalReference = `payment_${paymentId}`;

    const mpResult = await payment.create({
      body: {
        transaction_amount: finalAmount,
        description: product.name + (discountInfo ? ` (Cupom: ${discountInfo.code})` : ''),
        payment_method_id: 'pix',
        payer: { email: 'comprador@email.com' },
        external_reference: externalReference,
        notification_url: 'https://minecraft-payment-api.onrender.com/api/webhook/mercadopago'
      }
    });

    await query(
      `INSERT INTO payments (id, mercadopago_id, discord_user_id, minecraft_username, product_id, product_name, amount, status, command)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [paymentId, mpResult.id, userId, username, product.id, product.name, finalAmount, 'pending', product.command]
    );

    const qrResponse = await payment.get({ id: mpResult.id });
    const qrCode = qrResponse.point_of_interaction?.transaction_data?.qr_code;
    const ticketUrl = qrResponse.point_of_interaction?.transaction_data?.ticket_url;

    res.json({
      success: true,
      paymentId,
      qrCode,
      ticketUrl,
      amount: finalAmount,
      product: product.name,
      original_amount: product.price,
      discount: discountInfo
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

// ========== ROTA: Webhook (CORRIGIDA - SEM RCON) ==========

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
      const result = await query(
        'SELECT * FROM payments WHERE mercadopago_id = $1 AND status = $2',
        [mercadopagoId, 'pending']
      );

      if (result.rows.length > 0) {
        const p = result.rows[0];
        const command = p.command.replace(/{username}/g, p.minecraft_username);

        try {
          // ===== ENVIAR PARA O PLUGIN VIA HTTP =====
          const pluginResponse = await axios.post('http://localhost:8080/execute', {
            username: p.minecraft_username,
            command: command,
            token: process.env.API_SECRET_TOKEN || 'M1n3P4yM3nt-S3cr3t-T0k3n-2026!'
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          });
          
          console.log(`✅ Comando entregue ao plugin: ${command}`);
          console.log(`📦 Resposta do plugin:`, pluginResponse.data);
          
        } catch (pluginError) {
          console.error('❌ Erro ao enviar para o plugin:', pluginError.message);
          
          // Fallback: Tentar via RCON
          try {
            console.log('🔄 Tentando fallback via RCON...');
            const Rcon = require('rcon-client').Rcon;
            const rcon = new Rcon({
              host: process.env.MINECRAFT_HOST || 'localhost',
              port: parseInt(process.env.RCON_PORT || '25575'),
              password: process.env.RCON_PASSWORD || 'senha123'
            });

            await rcon.connect();
            await rcon.send(command);
            await rcon.end();
            console.log(`✅ Comando executado via RCON (fallback): ${command}`);
          } catch (rconError) {
            console.error('❌ RCON fallback também falhou:', rconError.message);
          }
        }

        // Marcar como entregue
        await query(
          `UPDATE payments SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = $1`,
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
    console.error('❌ Erro ao marcar compra como entregue:', error);
    res.status(500).json({ error: 'Erro ao marcar compra' });
  }
});

// ========== ROTAS DE CONFIGURAÇÃO ==========

app.post('/api/guild/settings', authMiddleware, async (req, res) => {
  try {
    const { guildId, channelId, messageId } = req.body;
    
    if (!guildId || !channelId) {
      return res.status(400).json({ error: 'guildId e channelId são obrigatórios' });
    }

    await query(
      `INSERT INTO guild_settings (guild_id, channel_id, message_id, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (guild_id) DO UPDATE SET channel_id = $2, message_id = $3, updated_at = CURRENT_TIMESTAMP`,
      [guildId, channelId, messageId || '']
    );
    
    res.json({ success: true, message: 'Configuração salva com sucesso' });
  } catch (error) {
    console.error('❌ Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

app.get('/api/guild/settings/:guildId', authMiddleware, async (req, res) => {
  try {
    const { guildId } = req.params;
    
    const result = await query(
      'SELECT * FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('❌ Erro ao buscar configuração:', error);
    res.status(500).json({ error: 'Erro ao buscar configuração' });
  }
});

// ========== SISTEMA DE LINK ==========

app.post('/api/link/generate', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    
    const existing = await query('SELECT * FROM linked_accounts WHERE minecraft_username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Conta já linkada!' });
    }
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
      if (i === 2) code += '-';
    }
    
    await query(
      'INSERT INTO link_codes (code, minecraft_username) VALUES ($1, $2)',
      [code, username]
    );
    
    res.json({ success: true, code });
  } catch (error) {
    console.error('❌ Erro ao gerar código:', error);
    res.status(500).json({ error: 'Erro ao gerar código' });
  }
});

app.get('/api/link/code/:code', authMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    const result = await query(
      'SELECT * FROM link_codes WHERE code = $1 AND status = $2 AND expires_at > NOW()',
      [code, 'pending']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código inválido ou expirado' });
    }
    
    res.json({ minecraft_username: result.rows[0].minecraft_username });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar código' });
  }
});

app.post('/api/link/verify', authMiddleware, async (req, res) => {
  try {
    const { code, discordId, username } = req.body;
    
    const result = await query(
      'SELECT * FROM link_codes WHERE code = $1 AND status = $2 AND expires_at > NOW()',
      [code, 'pending']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código inválido ou expirado' });
    }
    
    if (result.rows[0].minecraft_username !== username) {
      return res.status(400).json({ error: 'Username não confere' });
    }
    
    await query('UPDATE link_codes SET status = $1, discord_id = $2 WHERE code = $3', ['used', discordId, code]);
    await query(
      'INSERT INTO linked_accounts (discord_id, minecraft_username) VALUES ($1, $2) ON CONFLICT (discord_id) DO UPDATE SET minecraft_username = $2',
      [discordId, username]
    );
    
    res.json({ success: true, username });
  } catch (error) {
    console.error('❌ Erro ao verificar código:', error);
    res.status(500).json({ error: 'Erro ao verificar código' });
  }
});

app.get('/api/link/check/:discordId', authMiddleware, async (req, res) => {
  try {
    const { discordId } = req.params;
    const result = await query('SELECT * FROM linked_accounts WHERE discord_id = $1', [discordId]);
    res.json({ 
      linked: result.rows.length > 0, 
      username: result.rows[0]?.minecraft_username,
      linked_at: result.rows[0]?.linked_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar link' });
  }
});

// ========== INICIAR SERVIDOR ==========
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 API + Site rodando em http://0.0.0.0:${PORT}`);
  console.log(`📦 Banco: PostgreSQL (${process.env.DATABASE_URL ? 'Conectado' : 'Desconectado'})`);
  console.log(`🔒 Rotas protegidas com token`);
  console.log(`🌐 Site disponível em: https://minecraft-payment-api.onrender.com`);
});