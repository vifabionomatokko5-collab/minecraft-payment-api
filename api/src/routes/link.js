const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');

router.post('/generate', authMiddleware, async (req, res) => {
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

router.get('/code/:code', authMiddleware, async (req, res) => {
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

router.post('/verify', authMiddleware, async (req, res) => {
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

router.get('/check/:discordId', authMiddleware, async (req, res) => {
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

module.exports = router;
