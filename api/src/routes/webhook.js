const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { MercadoPagoConfig, Payment } = require('mercadopago');

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
        
        console.log(`✅ Pagamento aprovado para ${p.minecraft_username}`);
        console.log(`📦 Produto: ${p.product_name}`);
        console.log(`⏳ Aguardando jogador resgatar com /mcompras`);
        console.log(`📝 Comando: ${p.command}`);
        
        // NÃO marcar como entregue - jogador resgata manualmente
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Erro no webhook' });
  }
});

module.exports = router;
