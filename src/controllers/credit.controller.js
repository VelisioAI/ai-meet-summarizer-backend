const { query, getClient } = require('../utils/config');

const logCreditTransaction = async (req, res) => {
  const client = await getClient();

  try {
    const userId = req.user.id;
    const { change, reason, type = 'other' } = req.body;

    // Validate input
    if (change === undefined || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Change and reason are required'
      });
    }

    const changeValue = parseInt(change, 10);
    if (isNaN(changeValue)) {
      return res.status(400).json({
        success: false,
        message: 'Change must be a valid integer'
      });
    }

    await client.query('BEGIN');

    // Get current balance
    const userQuery = 'SELECT credits FROM users WHERE id = $1 FOR UPDATE';
    const userResult = await client.query(userQuery, [userId]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const currentCredits = userResult.rows[0].credits;
    const newCredits = currentCredits + changeValue;

    // Prevent negative balance unless it's an admin operation
    if (newCredits < 0 && type !== 'admin_adjustment') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Insufficient credits',
        currentCredits,
        requiredChange: -changeValue
      });
    }

    // Update user's credits
    const updateUserQuery = 'UPDATE users SET credits = $1 WHERE id = $2';
    await client.query(updateUserQuery, [newCredits, userId]);

    // Log the transaction
    const logQuery = `
      INSERT INTO credit_logs (user_id, change, reason)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const logResult = await client.query(logQuery, [userId, changeValue, reason]);
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        log: logResult.rows[0],
        newCredits
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error logging credit transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing credit transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  } finally {
    client.release();
  }
};

const getCreditBalance = async (userId) => {
  try {
    const queryText = 'SELECT credits FROM users WHERE id = $1';
    const result = await query(queryText, [userId]);
    return result.rows[0].credits || 0;
  } catch (error) {
    console.error('Error getting credit balance:', error);
    throw error;
  }
};

/**
 * Get paginated credit transaction history and statistics for a user
 * @param {string} userId - User ID
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Paginated transaction history with credit statistics
 */
const getCreditHistory = async (userId, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  
  const client = await getClient();
  
  try {
    // Get user's current credit balance
    const userResult = await client.query(
      'SELECT credits FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const currentCredits = userResult.rows[0].credits;

    // Get credit statistics
    const statsResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN change > 0 THEN change ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN change < 0 THEN -change ELSE 0 END), 0) as total_used,
        COUNT(*) as total_transactions
      FROM credit_logs 
      WHERE user_id = $1
    `, [userId]);

    const stats = statsResult.rows[0];
    
    // Debug log the values being used in the calculation
    console.log('Credit Stats Debug:', {
      currentCredits,
      total_used: stats.total_used,
      total_earned: stats.total_earned,
      calculation: {
        numerator: stats.total_used,
        denominator: currentCredits + parseFloat(stats.total_used),
        rawPercentage: (stats.total_used / (currentCredits + parseFloat(stats.total_used))) * 100
      }
    });

    // Get paginated transactions
    const result = await client.query(
      `SELECT 
         id,
         change,
         reason,
         timestamp
       FROM credit_logs 
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await client.query(
      'SELECT COUNT(*) FROM credit_logs WHERE user_id = $1',
      [userId]
    );

    const total = parseInt(countResult.rows[0].count, 10);
    
    return {
      stats: {
        currentBalance: currentCredits,
        totalEarned: parseFloat(stats.total_earned) || 0,
        totalUsed: parseFloat(stats.total_used) || 0,
        totalTransactions: parseInt(stats.total_transactions, 10) || 0,
        // Calculate percentage used as (totalUsed / (currentBalance + totalUsed)) * 100, capped at 100%
        usagePercentage: (currentCredits + stats.total_used) > 0 ?
          Math.min(Math.round((stats.total_used / (currentCredits + stats.total_used)) * 100), 100) : 0
      },
      transactions: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } finally {
    client.release();
  }
};

/**
 * Get credit history endpoint handler
 */
const getCreditHistoryHandler = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters'
      });
    }

    const history = await getCreditHistory(userId, page, limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching credit history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit history'
    });
  }
};

module.exports = {
  logCreditTransaction,
  getCreditBalance,
  getCreditHistory: getCreditHistoryHandler
};