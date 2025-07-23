import express from 'express';
import { verifyToken } from '../utils/middleware.js';
import { logCreditTransaction } from '../controllers/credit.controller.js';

const creditsRouter = express.Router();

// Protected routes (require authentication)
creditsRouter.use(verifyToken);

// POST /api/credit-log - Log a credit transaction
creditsRouter.post('/', logCreditTransaction);

module.exports = creditsRouter;
