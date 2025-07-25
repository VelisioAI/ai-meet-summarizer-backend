const express = require('express');
const { verifyToken } = require('../utils/middleware');
const { processTranscript } = require('../controllers/transcript.controller');

const router = express.Router();

router.use(verifyToken);
router.post('/', processTranscript);

module.exports = router;