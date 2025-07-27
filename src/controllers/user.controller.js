const { query } = require('../utils/config');

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

const syncUser = async (req, res) => {
  try {
    const { id: supabase_id, email, name } = req.body;

    if (!supabase_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'Supabase ID and email are required'
      });
    }

    const queryText = `
      INSERT INTO users (supabase_id, email, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (supabase_id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name
      RETURNING *
    `;

    const result = await query(queryText, [supabase_id, email, name || '']);

    res.status(200).json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing user',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

module.exports = {
  getUserProfile,
  getUserHistory,
  syncUser
};