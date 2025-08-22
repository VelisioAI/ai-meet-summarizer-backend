const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query, getClient } = require('../utils/config');

const createPaymentIntent = async (req, res) => {
  try {
    const { product_id } = req.body;
    const userId = req.user.id;

    console.log('Creating payment intent for:', { product_id, userId });

    // Retrieve the product
    const productQuery = 'SELECT * FROM products WHERE id = $1 AND active = true';
    const productResult = await query(productQuery, [product_id]);
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found or inactive' 
      });
    }

    const product = productResult.rows[0];

    // Create a PaymentIntent with CAD currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: product.price,
      currency: 'cad',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId,
        productId: product.id,
        credits: product.credits.toString(),
        productName: product.name
      }
    });

    console.log('PaymentIntent created:', paymentIntent.id);

    // Create an order record
    const insertOrderQuery = `
      INSERT INTO orders (user_id, product_id, amount, stripe_payment_intent_id, payment_status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id
    `;
    const orderResult = await query(insertOrderQuery, [
      userId,
      product.id,
      product.price,
      paymentIntent.id
    ]);

    console.log('Order created:', orderResult.rows[0].id);

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount: product.price,
        currency: 'cad',
        credits: product.credits,
        productName: product.name
      }
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

const getProducts = async (req, res) => {
  try {
    const productsQuery = 'SELECT * FROM products WHERE active = true ORDER BY price ASC';
    const result = await query(productsQuery);
    
    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
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
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Webhook event received:', event.type);

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const client = await getClient();

    try {
      await client.query('BEGIN');

      console.log('Processing successful payment:', paymentIntent.id);

      // Update order status
      const updateOrderQuery = `
        UPDATE orders 
        SET payment_status = 'succeeded'
        WHERE stripe_payment_intent_id = $1
        RETURNING user_id, product_id, id
      `;
      const orderResult = await client.query(updateOrderQuery, [paymentIntent.id]);
      
      if (orderResult.rows.length === 0) {
        throw new Error(`Order not found for payment intent: ${paymentIntent.id}`);
      }

      const order = orderResult.rows[0];
      console.log('Order found:', order);

      // Get product credits
      const productQuery = 'SELECT credits, name FROM products WHERE id = $1';
      const productResult = await client.query(productQuery, [order.product_id]);
      
      if (productResult.rows.length === 0) {
        throw new Error(`Product not found: ${order.product_id}`);
      }
      
      const product = productResult.rows[0];
      const credits = product.credits;

      console.log('Adding credits:', { userId: order.user_id, credits });

      // Update user's credits
      const updateUserQuery = `
        UPDATE users 
        SET credits = credits + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING credits
      `;
      const userResult = await client.query(updateUserQuery, [credits, order.user_id]);
      
      if (userResult.rows.length === 0) {
        throw new Error(`User not found: ${order.user_id}`);
      }

      console.log('User credits updated:', userResult.rows[0]);

      // Log credit addition
      const logQuery = `
        INSERT INTO credit_logs (user_id, change, reason)
        VALUES ($1, $2, $3)
      `;
      await client.query(logQuery, [
        order.user_id, 
        credits, 
        `Credit purchase: ${product.name} (${credits} credits)`
      ]);

      await client.query('COMMIT');
      console.log('Transaction completed successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing webhook:', error);
      // Don't throw here - we still want to acknowledge the webhook
    } finally {
      client.release();
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    console.log('Payment failed for:', event.data.object.id);
    
    // Update order status to failed
    try {
      const updateOrderQuery = `
        UPDATE orders 
        SET payment_status = 'failed'
        WHERE stripe_payment_intent_id = $1
      `;
      await query(updateOrderQuery, [event.data.object.id]);
    } catch (error) {
      console.error('Error updating failed payment:', error);
    }
  }

  res.json({ received: true });
};

module.exports = {
  createPaymentIntent,
  getProducts,
  handleWebhook
};