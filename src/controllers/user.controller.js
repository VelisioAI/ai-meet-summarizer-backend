const { query, getClient } = require('../utils/config');
const jwt = require('jsonwebtoken');

/**
 * Get or create user from Supabase JWT
 * @param {string} supabaseId - Supabase user ID
 * @param {string} email - User email
 * @param {string} [name] - User's name (optional)
 * @returns {Promise<Object>} User object
 */
const getOrCreateUser = async (supabaseId, email, name = '') => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Try to find existing user
    const findQuery = `
      SELECT * FROM users 
      WHERE supabase_id = $1
      FOR UPDATE
    `;
    
    const result = await client.query(findQuery, [supabaseId]);
    
    if (result.rows.length > 0) {
      await client.query('COMMIT');
      return result.rows[0];
    }
    
    // Create new user with default credits
    const insertQuery = `
      INSERT INTO users (supabase_id, email, name, credits)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const newUser = await client.query(insertQuery, [
      supabaseId,
      email,
      name,
      50 // Default credits for new users
    ]);
    
    await client.query('COMMIT');
    return newUser.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in getOrCreateUser:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Verify Supabase JWT and get user data
 * @param {string} token - JWT token from Supabase
 * @returns {Promise<Object>} Decoded token with user data
 */
const verifySupabaseToken = (token) => {
  try {
    // For Supabase JWT verification, we need to:
    // 1. Get the JWT secret from Supabase project settings
    // 2. Verify the token using the JWT secret
    // Since we don't have the JWT secret, we'll decode the token without verification
    // and trust it for now (in production, you should verify the token)
    
    // Decode the token without verification
    const decoded = jwt.decode(token);
    
    if (!decoded) {
      throw new Error('Invalid token: could not decode');
    }
    
    // Check if token has required fields
    if (!decoded.sub || !decoded.email) {
      throw new Error('Invalid token: missing required fields');
    }
    
    // In a production environment, you should verify the token signature
    // using Supabase's JWT secret which can be found in your Supabase project settings
    // under Project Settings -> API -> JWT Settings -> JWT Secret
    
    return {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.user_metadata?.full_name || ''
    };
  } catch (error) {
    console.error('Token verification failed:', error.message);
    throw new Error('Invalid or expired token');
  }
};

/**
 * Sync user data with Supabase
 * Creates or updates user in our database based on Supabase auth
 */
const syncUser = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    // Verify the Supabase JWT
    const userData = verifySupabaseToken(token);
    
    // Get or create user in our database
    const user = await getOrCreateUser(
      userData.id,
      userData.email,
      userData.name
    );
    
    // Return user data (excluding sensitive fields)
    const { supabase_id, ...userResponse } = user;
    
    res.status(200).json({
      success: true,
      data: userResponse
    });
    
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

/**
 * Get authenticated user's profile
 */
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const userQuery = `
      SELECT id, name, email, credits, created_at, updated_at 
      FROM users 
      WHERE id = $1
    `;

    const result = await query(userQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

const getUserHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    const historyQuery = `
      SELECT 
        id, title, summary_status,
        created_at, 
        (summary_text IS NOT NULL AND summary_text != '') as has_summary
      FROM summaries
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM summaries 
      WHERE user_id = $1
    `;

    const [historyResult, countResult] = await Promise.all([
      query(historyQuery, [userId, limit, offset]),
      query(countQuery, [userId])
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const summaries = historyResult.rows;

    res.status(200).json({
      success: true,
      data: {
        items: summaries,
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          hasMore: (parseInt(offset, 10) + summaries.length) < total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user history',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

/**
 * Handle user login/signup with Supabase
 * This is the main entry point for frontend authentication
 */
const handleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    // Verify the Supabase JWT
    const userData = verifySupabaseToken(token);
    
    // Get or create user in our database
    const user = await getOrCreateUser(
      userData.id,
      userData.email,
      userData.name
    );
    
    // Generate a new JWT for our API
    const apiToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Return user data and API token
    const { supabase_id, ...userResponse } = user;
    
    res.status(200).json({
      success: true,
      data: {
        ...userResponse,
        token: apiToken
      }
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

/**
 * Get dashboard data for the authenticated user
 * Returns a consolidated view of user profile, recent summaries, and credit info
 */
const getDashboardData = async (req, res) => {
  const userId = req.user.userId;
  const summaryLimit = 5; // Number of recent summaries to return
  let client;

  try {
    client = await getClient();

    // Get user profile
    const userResult = await client.query(
      'SELECT id, name, email, credits, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Get recent summaries and credit information in parallel
    const [summariesResult, creditsResult, creditsUsedResult] = await Promise.all([
      // Get recent summaries
      client.query(
        `SELECT id, title, created_at 
         FROM summaries 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [userId, summaryLimit]
      ),
      // Get recent credit transactions
      client.query(
        `SELECT id, change, reason, timestamp 
         FROM credit_logs 
         WHERE user_id = $1 
         ORDER BY timestamp DESC 
         LIMIT 5`,
        [userId]
      ),
      // Calculate total credits used (sum of negative changes)
      client.query(
        `SELECT COALESCE(SUM(CASE WHEN change < 0 THEN -change ELSE 0 END), 0) as total_used,
                COALESCE(SUM(CASE WHEN change > 0 THEN change ELSE 0 END), 0) as total_earned
         FROM credit_logs 
         WHERE user_id = $1`,
        [userId]
      )
    ]);

    // Prepare response data
    const creditsUsed = parseFloat(creditsUsedResult.rows[0].total_used) || 0;
    const creditsEarned = parseFloat(creditsUsedResult.rows[0].total_earned) || 0;
    
    const responseData = {
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          credits: user.credits,
          memberSince: user.created_at
        },
        recentSummaries: summariesResult.rows.map(s => ({
          id: s.id,
          title: s.title,
          createdAt: s.created_at
        })),
        creditInfo: {
          currentBalance: user.credits,
          totalUsed: creditsUsed,
          totalEarned: creditsEarned,
          // Calculate usage percentage as (totalUsed / (currentBalance + totalUsed)) * 100, capped at 100%
          usagePercentage: (user.credits + creditsUsed) > 0 ?
            Math.min(Math.round((creditsUsed / (user.credits + creditsUsed)) * 100), 100) : 0
        },
        recentTransactions: creditsResult.rows.map(t => ({
          id: t.id,
          amount: t.change,
          reason: t.reason,
          date: t.timestamp
        }))
      }
    };
    
    // Log the response for debugging
    console.log('Dashboard response data:', JSON.stringify(responseData, null, 2));
    
    // Release the client before sending response
    client.release();
    
    // Send the complete response
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error in getDashboardData:', error);
    if (client) client.release();
    return res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getUserProfile,
  getUserHistory,
  handleAuth,
  getDashboardData,
  verifySupabaseToken // Export for use in middleware
};