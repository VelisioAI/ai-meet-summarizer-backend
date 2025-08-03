const express = require('express')
const logger = require('./utils/logger')
const middleware = require('./utils/middleware')
const creditsRouter = require('./routes/credit.routes')
const summaryRouter = require('./routes/summary.routes')
const usersRouter = require('./routes/user.routes')
const paymentRouter = require('./routes/payment.routes')
const transcriptRouter = require('./routes/transcript.routes')
const { connectDB } = require('./utils/config.js')
const cors = require('cors');

const app = express()

try {
    connectDB();
    logger.info('Database connection established successfully');
} catch (error) {
    logger.error('Database connection failed:', error);
}

app.use(cors());
app.use(express.static('dist'))
app.use(express.json({ limit: '10mb' })) // Increase payload size for transcripts
app.use(middleware.requestLogger)

app.use('/api/user', usersRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/credit-log', creditsRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/transcript', transcriptRouter);

app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

module.exports = app