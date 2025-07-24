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

module.exports = {
  logCreditTransaction,
  getCreditBalance
};