import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import { logCreditTransaction } from '../controllers/credit.controller.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(verifyToken);

// POST /api/credit-log - Log a credit transaction
router.post('/', logCreditTransaction);

export default router;
