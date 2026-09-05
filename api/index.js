const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ========== CONFIGURAÇÃO DO BANCO DE DADOS (POSTGRESQL) ==========
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

// ========== ROTAS DO SITE ==========

// Página inicial
app.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.render('index', { products: result.rows });
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error);
    res.status(500).send('Erro ao carregar produtos');
  }
});

// Página de compra
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

// ROTA: Health Check
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'PostgreSQL', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'offline' });
  }
});

// ROTA: Verificar status
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

// ROTA: Listar produtos
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.json(result.rows);
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
    await query(
      'INSERT INTO products (id, name, price, command) VALUES ($1, $2, $3, $4)',
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
    await query('UPDATE products SET active = 0 WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

// ========== MERCADO PAGO ==========
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
});
const payment = new Payment(client);

// ROTA: Criar Pagamento
app.post('/api/payment/create', authMiddleware, async (req, res) => {
  try {
    const { userId, username, productId } = req.body;
    
    const result = await query('SELECT * FROM products WHERE id = $1 AND active = 1', [productId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    const product = result.rows[0];
    const paymentId = uuidv4();
    const externalReference = `payment_${paymentId}`;

    const mpResult = await payment.create({
      body: {
        transaction_amount: product.price,
        description: product.name,
        payment_method_id: 'pix',
        payer: { email: 'comprador@email.com' },
        external_reference: externalReference,
        notification_url: 'https://minecraft-payment-api.onrender.com/api/webhook/mercadopago'
      }
    });

    await query(
      `INSERT INTO payments (id, mercadopago_id, discord_user_id, minecraft_username, product_id, product_name, amount, status, command)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [paymentId, mpResult.id, userId, username, product.id, product.name, product.price, 'pending', product.command]
    );

    const qrResponse = await payment.get({ id: mpResult.id });
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
      const result = await query(
        'SELECT * FROM payments WHERE mercadopago_id = $1 AND status = $2',
        [mercadopagoId, 'pending']
      );

      if (result.rows.length > 0) {
        const p = result.rows[0];
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

// ROTA: Buscar compras pendentes
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

// ROTA: Marcar compra como entregue
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

// ========== ROTAS DE CONFIGURAÇÃO DO SERVIDOR ==========

// ROTA: Salvar configuração
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

// ROTA: Buscar configuração
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

// ROTA: Gerar código
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

// ROTA: Buscar código
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

// ROTA: Verificar código
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

// ROTA: Verificar link
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
