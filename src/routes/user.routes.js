const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { 
  getUserProfile, 
  getUserHistory, 
  handleAuth,
  getDashboardData 
} = require('../controllers/user.controller');

const router = express.Router();

// Public routes
router.post('/auth', handleAuth); // Handle login/signup with Supabase token

// Protected routes (require valid JWT)
router.get('/', verifyToken, getUserProfile);
router.get('/history', verifyToken, getUserHistory);
router.get('/dashboard', verifyToken, getDashboardData); // Get dashboard data

module.exports = router;