// app.js
const express = require('express');
const logger = require('./utils/logger');
const middleware = require('./utils/middleware');

const creditsRouter = require('./routes/credit.routes');
const summaryRouter = require('./routes/summary.routes');
const usersRouter = require('./routes/user.routes');
const paymentRouter = require('./routes/payment.routes');
const transcriptRouter = require('./routes/transcript.routes');

const { connectDB } = require('./utils/config.js');
const cors = require('cors');

const app = express();

/**
 * DB startup check (optional). Do not crash the process on failure.
 */
(async () => {
  try {
    await connectDB();
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Database connection check failed:', error);
  }
})();

/**
 * CORS
 * - Remove trailing slashes from allowed origins
 * - Allow Vercel preview subdomains
 * - Allow Chrome extensions
 * - Return 204 for preflight
 */
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // SSR/curl/server-to-server

    const exact = new Set([
      'http://localhost:3000',
      'https://summarifyai.vercel.app',
      'https://meet.google.com'
    ]);

    const patterns = [
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i // Vercel preview deployments
    ];

    if (
      origin.startsWith('chrome-extension://') ||
      exact.has(origin) ||
      patterns.some(rx => rx.test(origin))
    ) {
      return callback(null, true);
    }

    console.warn('[CORS] Rejected Origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

// CORS must come before any routes/middleware that need it
app.use(cors(corsOptions));
// Explicitly handle all preflight with the same options
app.options('*', cors(corsOptions), (req, res) => res.sendStatus(204));

/**
 * Static assets (optional)
 */
app.use(express.static('dist'));

/**
 * Stripe webhook must receive raw body.
 * Place BEFORE express.json for that path only.
 */
app.use(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    req.rawBody = req.body;
    next();
  }
);

/**
 * JSON body parser for the rest
 */
app.use(express.json({ limit: '10mb' }));

/**
 * App middleware & routes
 */
app.use(middleware.requestLogger);

app.use('/api/user', usersRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/transcript', transcriptRouter);

app.use(middleware.unknownEndpoint);
app.use(middleware.errorHandler);

module.exports = app;
