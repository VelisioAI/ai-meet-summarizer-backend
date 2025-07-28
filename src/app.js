require('dotenv').config({ path: '.env.local' });
const express = require('express')
const logger = require('./utils/logger')
const middleware = require('./utils/middleware')
const creditsRouter = require('./routes/credit.routes')
const summaryRouter = require('./routes/summary.routes')
const usersRouter = require('./routes/user.routes')
// Temporarily disabled integrations
// const paymentRouter = require('./routes/payment.routes')
const transcriptRouter = require('./routes/transcript.routes')
const { connectDB } = require('./utils/config')
const cors = require('cors');

const app = express()

try {
    connectDB();
    logger.info('Database connection established successfully');
} catch (error) {
    logger.error('Database connection failed:', error);
}

// Configure CORS with options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // List of allowed origins (add your frontend URLs here)
    const allowedOrigins = [
      'http://localhost:3000', // Local development
      'http://localhost:5173', // Common Vite dev server port
      'https://your-production-domain.com' // Your production domain
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// Apply CORS with options
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));
app.use(express.static('dist'))
app.use(express.json({ limit: '10mb' })) // Increase payload size for transcripts
app.use(middleware.requestLogger)

app.use('/api/user', usersRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/credit-log', creditsRouter);
// app.use('/api/payment', paymentRouter);
app.use('/api/transcript', transcriptRouter);

app.use(middleware.unknownEndpoint)
app.use(middleware.errorHandler)

module.exports = app