const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { getUserProfile, getUserHistory } = require('../controllers/user.controller');

const usersRouter = express.Router();

// Protected routes (require authentication)
usersRouter.use(verifyToken);

// GET /api/user - Get user profile
usersRouter.get('/', getUserProfile);

// GET /api/user/history - Get user's summary history
usersRouter.get('/history', getUserHistory);

module.exports = usersRouter;