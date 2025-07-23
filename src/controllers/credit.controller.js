const { query, getClient } = require('../utils/config');

const logCreditTransaction = async (req, res) => {
  const client = await getClient();

  try {
    const userId = req.user.id;
    const { credits, description, type = 'other' } = req.body;

    // Validate input
    if (credits === undefined || !description) {
      return res.status(400).json({
        success: false,
        message: 'Credits and description are required'
      });
    }

    const creditsValue = parseFloat(credits);
    if (isNaN(creditsValue)) {
      return res.status(400).json({
        success: false,
        message: 'Credits must be a valid number'
      });
    }

    await client.query('BEGIN');

    // Get current balance
    const balanceQuery = `
      SELECT COALESCE(SUM(credits), 0) as balance 
      FROM credit_transactions 
      WHERE user_id = $1
    `;

    const balanceResult = await client.query(balanceQuery, [userId]);
    const currentBalance = parseFloat(balanceResult.rows[0].balance) || 0;
    const newBalance = currentBalance + creditsValue;

    // Prevent negative balance unless it's an admin operation
    if (newBalance < 0 && type !== 'admin_adjustment') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Insufficient credits',
        currentBalance,
        requiredCredits: Math.abs(creditsValue)
      });
    }

    // Log the transaction
    const logTransactionQuery = `
      INSERT INTO credit_transactions 
        (user_id, credits, description, type, balance_after)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at, credits, description, type, balance_after
    `;

    const result = await client.query(logTransactionQuery, [
      userId,
      creditsValue,
      description,
      type,
      newBalance
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        transaction: result.rows[0],
        newBalance
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
    const queryText = `
      SELECT COALESCE(SUM(credits), 0) as balance 
      FROM credit_transactions 
      WHERE user_id = $1
    `;
    const result = await query(queryText, [userId]);
    return parseFloat(result.rows[0].balance) || 0;
  } catch (error) {
    console.error('Error getting credit balance:', error);
    throw error;
  }
};

module.exports = {
  logCreditTransaction,
  getCreditBalance
};