const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Página inicial
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
    res.render('index', { products: result.rows });
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error);
    res.status(500).send('Erro ao carregar produtos');
  }
});

// Página de compra
router.get('/comprar/:id', async (req, res) => {
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

module.exports = router;
