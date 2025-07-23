const { query } = require('../utils/config');

const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user profile from database
    const userQuery = `
      SELECT id, email, full_name, created_at, updated_at 
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

    const user = result.rows[0];

    // Get user's credit balance
    const creditQuery = `
      SELECT COALESCE(SUM(credits), 0) as balance 
      FROM credit_transactions 
      WHERE user_id = $1
    `;

    const creditResult = await query(creditQuery, [userId]);
    const credits = parseFloat(creditResult.rows[0].balance) || 0;

    res.status(200).json({
      success: true,
      data: {
        ...user,
        credits
      }
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

    // Get user's summary history with pagination
    const historyQuery = `
      SELECT id, title, summary, transcript, created_at, updated_at
      FROM meeting_summaries
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM meeting_summaries 
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

module.exports = {
  getUserProfile,
  getUserHistory
};