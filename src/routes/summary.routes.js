const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { createSummary } = require('../controllers/summary.controller');

const summaryRouter = express.Router();

// Protected routes (require authentication)
summaryRouter.use(verifyToken);

// POST /api/summary - Create a new meeting summary
summaryRouter.post('/', createSummary);

module.exports = summaryRouter;