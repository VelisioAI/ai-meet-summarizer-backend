import { query } from '../utils/db.js';

export const createSummary = async (req, res) => {
  const client = await getClient();
  
  try {
    const userId = req.user.id;
    const { title, transcript, summary } = req.body;

    if (!title || !transcript || !summary) {
      return res.status(400).json({
        success: false,
        message: 'Title, transcript, and summary are required'
      });
    }

    await client.query('BEGIN');

    // Check if user has enough credits
    const creditCheckQuery = `
      SELECT COALESCE(SUM(credits), 0) as balance 
      FROM credit_transactions 
      WHERE user_id = $1
    `;
    
    const creditResult = await client.query(creditCheckQuery, [userId]);
    const currentCredits = parseFloat(creditResult.rows[0].balance) || 0;
    
    // Calculate cost (example: 1 credit per summary)
    const cost = 1;
    
    if (currentCredits < cost) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: 'Insufficient credits',
        requiredCredits: cost,
        currentCredits
      });
    }

    // Insert the new summary
    const insertSummaryQuery = `
      INSERT INTO meeting_summaries (user_id, title, transcript, summary)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, summary, transcript, created_at
    `;
    
    const summaryResult = await client.query(
      insertSummaryQuery,
      [userId, title, transcript, summary]
    );
    
    // Deduct credits
    const deductCreditsQuery = `
      INSERT INTO credit_transactions (user_id, credits, description, type)
      VALUES ($1, $2, $3, 'summary_creation')
    `;
    
    await client.query(deductCreditsQuery, [
      userId, 
      -cost,
      `Deduction for creating summary: ${title.substring(0, 50)}...`
    ]);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        creditsDeducted: cost,
        remainingCredits: currentCredits - cost
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating meeting summary',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  } finally {
    client.release();
  }
};
