const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query, getClient } = require('../utils/config');

const createPaymentIntent = async (req, res) => {
  try {
    const { product_id } = req.body;
    const userId = req.user.id;

    // Retrieve the product
    const productQuery = 'SELECT * FROM products WHERE id = $1';
    const productResult = await query(productQuery, [product_id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = productResult.rows[0];

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.price,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId,
        productId: product.id,
        credits: product.credits
      }
    });

    // Create an order record
    const insertOrderQuery = `
      INSERT INTO orders (user_id, product_id, amount, stripe_payment_intent_id, payment_status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id
    `;
    await query(insertOrderQuery, [
      userId,
      product.id,
      product.price,
      paymentIntent.id
    ]);

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Update order status
      const updateOrderQuery = `
        UPDATE orders 
        SET payment_status = 'succeeded'
        WHERE stripe_payment_intent_id = $1
        RETURNING user_id, product_id
      `;
      const orderResult = await client.query(updateOrderQuery, [paymentIntent.id]);
      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];
      const userId = order.user_id;

      // Get product credits
      const productQuery = 'SELECT credits FROM products WHERE id = $1';
      const productResult = await client.query(productQuery, [order.product_id]);
      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }
      const credits = productResult.rows[0].credits;

      // Update user's credits
      const updateUserQuery = `
        UPDATE users 
        SET credits = credits + $1
        WHERE id = $2
      `;
      await client.query(updateUserQuery, [credits, userId]);

      // Log credit addition
      const logQuery = `
        INSERT INTO credit_logs (user_id, change, reason)
        VALUES ($1, $2, $3)
      `;
      await client.query(logQuery, [
        userId, 
        credits, 
        `Purchase of product: ${order.product_id}`
      ]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing webhook:', error);
    } finally {
      client.release();
    }
  }

  res.json({ received: true });
};

module.exports = {
  createPaymentIntent,
  handleWebhook
};