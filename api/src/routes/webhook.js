const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const axios = require('axios');

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
});
const payment = new Payment(client);

router.post('/mercadopago', async (req, res) => {
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
          // Enviar para o plugin via HTTP
          const pluginResponse = await axios.post('http://localhost:8080/execute', {
            username: p.minecraft_username,
            command: command,
            token: process.env.API_SECRET_TOKEN || 'M1n3P4yM3nt-S3cr3t-T0k3n-2026!'
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          });
          
          console.log(`✅ Comando entregue ao plugin: ${command}`);
          
        } catch (pluginError) {
          console.error('❌ Erro no plugin:', pluginError.message);
          
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
          } catch (rconError) {
            console.error('❌ RCON falhou:', rconError.message);
          }
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

module.exports = router;
