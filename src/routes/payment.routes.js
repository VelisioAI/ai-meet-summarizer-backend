const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { createPaymentIntent, getProducts, handleWebhook } = require('../controllers/payment.controller');

const router = express.Router();

router.get('/products', getProducts);
router.post('/create-payment-intent', verifyToken, createPaymentIntent);
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;