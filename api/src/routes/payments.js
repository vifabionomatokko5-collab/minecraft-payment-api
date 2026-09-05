const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || ''
});
const payment = new Payment(client);

// Criar pagamento (público)
router.post('/create', async (req, res) => {
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

// Verificar status do pagamento
router.get('/:paymentId', async (req, res) => {
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

module.exports = router;
