import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import { createSummary } from '../controllers/summary.controller.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(verifyToken);

// POST /api/summary - Create a new meeting summary
router.post('/', createSummary);

export default router;
