import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import { getUserProfile, getUserHistory } from '../controllers/user.controller.js';

const router = express.Router();

// Protected routes (require authentication)
router.use(verifyToken);

// GET /api/user - Get user profile
router.get('/', getUserProfile);

// GET /api/user/history - Get user's summary history
router.get('/history', getUserHistory);

export default router;
