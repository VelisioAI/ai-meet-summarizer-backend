const express = require('express')
const logger = require('./utils/logger')
const middleware = require('./utils/middleware')
const creditsRouter = require('./routes/credit.routes')
const summaryRouter = require('./routes/summary.routes')
const usersRouter = require('./routes/user.routes')
// const paymentRouter = require('./routes/payment.routes')
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

// Configure CORS with credentials support
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://your-production-domain.com',
      'https://meet.google.com'
    ];
    
    // Allow any chrome-extension origin
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));
app.use(express.static('dist'))
app.use(express.json({ limit: '10mb' })) // Increase payload size for transcripts
app.use(middleware.requestLogger)

app.use('/api/user', usersRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/credits', creditsRouter);  
// app.use('/api/payment', paymentRouter);
app.use('/api/transcript', transcriptRouter);

app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

module.exports = app