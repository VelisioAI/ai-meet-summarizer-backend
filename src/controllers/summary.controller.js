const { getClient, query } = require('../utils/config');
const { getCreditBalance } = require('./credit.controller');
const { generateSummary } = require('../services/openai.service');

const createSummary = async (req, res) => {
  const client = await getClient();

  try {
    const userId = req.user.id;
    const { title, transcript_id, custom_prompt } = req.body;

    // Validate input
    if (!transcript_id) {
      return res.status(400).json({
        success: false,
        message: 'Transcript ID is required'
      });
    }

    await client.query('BEGIN');

    // Get transcript
    const transcriptQuery = `
      SELECT transcript_text, transcript_json 
      FROM summaries 
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `;
    const transcriptResult = await client.query(transcriptQuery, [transcript_id, userId]);
    
    if (transcriptResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Transcript not found'
      });
    }

    const transcript = transcriptResult.rows[0];
    const cost = 1; // 1 credit per summary (simplified)

    // Check user credits
    const currentCredits = await getCreditBalance(userId);
    if (currentCredits < cost) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: 'Insufficient credits',
        requiredCredits: cost,
        currentCredits
      });
    }

    // Insert the new summary with pending status
    const insertSummaryQuery = `
      INSERT INTO summaries (
        user_id, 
        title, 
        transcript_text, 
        transcript_json, 
        summary_status
      )
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, title, created_at
    `;

    const summaryResult = await client.query(insertSummaryQuery, [
      userId,
      title || `Summary for ${transcript_id}`,
      transcript.transcript_text,
      transcript.transcript_json
    ]);

    const summaryId = summaryResult.rows[0].id;

    // Deduct credits
    await client.query(
      'UPDATE users SET credits = credits - $1 WHERE id = $2',
      [cost, userId]
    );

    // Log credit deduction
    await client.query(
      `INSERT INTO credit_logs (user_id, change, reason)
       VALUES ($1, $2, $3)`,
      [userId, -cost, `AI summary generation for transcript ${transcript_id}`]
    );

    await client.query('COMMIT');

    // Generate summary asynchronously
    generateSummary(summaryId, transcript.transcript_text, custom_prompt)
      .then(summaryText => {
        query(
          `UPDATE summaries 
           SET summary_text = $1, summary_status = 'completed'
           WHERE id = $2`,
          [summaryText, summaryId]
        );
      })
      .catch(error => {
        console.error('Summary generation failed:', error);
        query(
          `UPDATE summaries SET summary_status = 'failed' WHERE id = $1`,
          [summaryId]
        );
      });

    res.status(201).json({
      success: true,
      data: {
        summaryId,
        creditsDeducted: cost,
        remainingCredits: currentCredits - cost,
        status: 'processing'
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

const getSummary = async (req, res) => {
  try {
    const summaryId = req.params.id;
    const userId = req.user.id;

    const queryText = `
      SELECT 
        id, title, summary_text, transcript_text, 
        transcript_json, meeting_metadata, summary_status,
        created_at
      FROM summaries
      WHERE id = $1 AND user_id = $2
    `;

    const result = await query(queryText, [summaryId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Summary not found'
      });
    }

    const summary = result.rows[0];
    
    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching summary',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

module.exports = {
  createSummary,
  getSummary
};