const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { logCreditTransaction, getCreditHistory } = require('../controllers/credit.controller');

const router = express.Router();

// Apply token verification to all routes
router.use(verifyToken);

// Log a new credit transaction
router.post('/', logCreditTransaction);

// Get credit transaction history with pagination
// Query params: ?page=1&limit=10
router.get('/history', getCreditHistory);

module.exports = router;