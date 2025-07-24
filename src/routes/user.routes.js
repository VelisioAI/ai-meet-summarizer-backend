const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { getUserProfile, getUserHistory, syncUser } = require('../controllers/user.controller');

const router = express.Router();

router.get('/', verifyToken, getUserProfile);
router.get('/history', verifyToken, getUserHistory);
router.post('/sync', syncUser); // Public route for user synchronization

module.exports = router;