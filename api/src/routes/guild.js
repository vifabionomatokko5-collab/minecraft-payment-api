const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Salvar configuração do servidor
router.post('/settings', authMiddleware, async (req, res) => {
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

// Buscar configuração do servidor
router.get('/settings/:guildId', authMiddleware, async (req, res) => {
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

module.exports = router;
