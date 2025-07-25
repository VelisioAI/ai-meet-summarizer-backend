const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { logCreditTransaction } = require('../controllers/credit.controller');

const router = express.Router();

router.use(verifyToken);
router.post('/', logCreditTransaction);

module.exports = router;