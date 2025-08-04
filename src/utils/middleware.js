const jwt = require('jsonwebtoken');
const logger = require('./logger');
const { query } = require('../utils/config');

const requestLogger = (req, res, next) => {
  logger.info('Method:', req.method);
  logger.info('Path:  ', req.path);
  logger.info('Body:  ', req.body);
  logger.info('---');
  next();
};

const unknownEndpoint = (req, res) => {
  res.status(404).send({ error: 'unknown endpoint' });
};

const errorHandler = (error, req, res, next) => {
  if (error.name === 'CastError') {
    return res.status(400).send({ error: 'malformatted id' });
  } else if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  } else if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'token invalid' });
  } else if (error.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'token expired' });
  }

  next(error);
};

/**
 * Middleware to verify JWT token and attach user to request
 * Expects token in Authorization header as: Bearer <token>
 */
const verifyToken = async (req, res, next) => {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided. Please authenticate.'
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // Verify the token using our JWT secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // The token should have userId and email (as set in handleAuth)
    if (!decoded.userId || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token structure'
      });
    }
    
    // Find user by ID from our database
    const userQuery = 'SELECT * FROM users WHERE id = $1';
    const result = await query(userQuery, [decoded.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found in database'
      });
    }

    // Attach user to request object
    const user = result.rows[0];
    req.user = user;
    // For backward compatibility, also attach userId directly
    req.user.userId = user.id;
    
    // Log for debugging
    console.log('User attached to request:', { 
      userId: user.id,
      email: user.email,
      hasUserId: !!req.user.userId 
    });
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.'
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: 'Server error during authentication',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

module.exports = {
  requestLogger,
  unknownEndpoint,
  errorHandler,
  verifyToken
};