const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

// ========== CRIAR CUPOM ==========
router.post('/', authMiddleware, async (req, res) => {
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

// ========== LISTAR CUPONS ==========
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar cupons:', error);
    res.status(500).json({ error: 'Erro ao listar cupons' });
  }
});

// ========== VALIDAR CUPOM ==========
router.post('/validate', async (req, res) => {
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
      min_purchase: coupon.min_purchase,
      command: coupon.command
    });
  } catch (error) {
    console.error('❌ Erro ao validar cupom:', error);
    res.status(500).json({ error: 'Erro ao validar cupom' });
  }
});

// ========== USAR CUPOM ==========
router.post('/use', authMiddleware, async (req, res) => {
  try {
    const { code, username } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Código do cupom é obrigatório' });
    }
    
    // Buscar cupom
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
    
    // Incrementar uso
    await query(
      `UPDATE coupons SET used_count = used_count + 1 WHERE code = $1`,
      [code.toUpperCase()]
    );
    
    // Executar comando se tiver
    let commandExecuted = false;
    if (coupon.command) {
      try {
        const command = coupon.command.replace(/{username}/g, username);
        
        // Tentar via plugin HTTP
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
          
          // Fallback via RCON
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
      command: coupon.command
    });
  } catch (error) {
    console.error('❌ Erro ao usar cupom:', error);
    res.status(500).json({ error: 'Erro ao usar cupom' });
  }
});

module.exports = router;
