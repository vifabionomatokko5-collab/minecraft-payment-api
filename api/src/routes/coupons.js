const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

router.post('/', authMiddleware, async (req, res) => {
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

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar cupons:', error);
    res.status(500).json({ error: 'Erro ao listar cupons' });
  }
});

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
      min_purchase: coupon.min_purchase
    });
  } catch (error) {
    console.error('❌ Erro ao validar cupom:', error);
    res.status(500).json({ error: 'Erro ao validar cupom' });
  }
});

router.post('/use', authMiddleware, async (req, res) => {
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

module.exports = router;
