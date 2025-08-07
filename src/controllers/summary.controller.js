const { getClient, query } = require('../utils/config');
const { getCreditBalance } = require('./credit.controller');
const { generateSummary } = require('../services/gemini.service');

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

    // Get transcript from the summaries table (transcript data)
    const transcriptQuery = `
      SELECT transcript_text, transcript_json, title as transcript_title
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
    const cost = 1; // Fixed 1 credit per AI summary

    // Check user credits
    const currentCredits = await getCreditBalance(userId);
    if (currentCredits < cost) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: 'Insufficient credits for AI summary generation',
        requiredCredits: cost,
        currentCredits,
        hint: 'AI summaries cost 1 credit each'
      });
    }

    // Check if transcript already has a completed summary
    const existingSummaryQuery = `
      SELECT id, summary_status 
      FROM summaries 
      WHERE id = $1 AND user_id = $2 AND summary_text IS NOT NULL AND summary_status = 'completed'
    `;
    const existingSummary = await client.query(existingSummaryQuery, [transcript_id, userId]);
    
    if (existingSummary.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'AI summary already exists for this transcript',
        summaryId: transcript_id
      });
    }

    // Update the existing transcript record to add AI summary
    const updateQuery = `
      UPDATE summaries 
      SET 
        summary_status = 'pending',
        title = COALESCE($1, title, 'AI Summary - ' || TO_CHAR(NOW(), 'Mon DD, YYYY HH24:MI')),
        updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, title, created_at
    `;

    const summaryResult = await client.query(updateQuery, [
      title,
      transcript_id,
      userId
    ]);

    const summaryId = summaryResult.rows[0].id;

    // Deduct credits
    await client.query(
      'UPDATE users SET credits = credits - $1, updated_at = NOW() WHERE id = $2',
      [cost, userId]
    );

    // Log credit transaction
    await client.query(
      `INSERT INTO credit_logs (user_id, change, reason)
       VALUES ($1, $2, $3)`,
      [userId, -cost, `AI summary generation for meeting "${transcript.transcript_title || 'Untitled'}"`]
    );

    await client.query('COMMIT');

    // Generate AI summary asynchronously
    setImmediate(async () => {
      try {
        const summaryText = await generateSummary(summaryId, transcript.transcript_text, custom_prompt);
        
        await query(
          `UPDATE summaries 
           SET summary_text = $1, summary_status = 'completed', updated_at = NOW()
           WHERE id = $2`,
          [summaryText, summaryId]
        );
        
        console.log(`✅ AI summary successfully generated for meeting ${summaryId}`);
      } catch (error) {
        console.error(`❌ AI summary generation failed for meeting ${summaryId}:`, error);
        
        await query(
          `UPDATE summaries 
           SET summary_status = 'failed', updated_at = NOW() 
           WHERE id = $1`,
          [summaryId]
        );
      }
    });

    res.status(201).json({
      success: true,
      message: 'AI summary generation started successfully',
      data: {
        summaryId,
        status: 'processing',
        estimatedTime: '30-60 seconds',
        creditsDeducted: cost,
        remainingCredits: currentCredits - cost
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating AI summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting AI summary generation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        id, 
        title, 
        summary_text, 
        transcript_text, 
        transcript_json, 
        meeting_metadata, 
        summary_status,
        created_at,
        updated_at,
        meeting_duration_minutes
      FROM summaries
      WHERE id = $1 AND user_id = $2
    `;

    const result = await query(queryText, [summaryId, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Meeting summary not found'
      });
    }

    const summary = result.rows[0];
    
    let statusInfo = {};
    switch (summary.summary_status) {
      case 'pending':
        statusInfo = {
          message: 'AI summary is being generated...',
          estimatedTimeRemaining: '30-60 seconds'
        };
        break;
      case 'completed':
        statusInfo = {
          message: 'AI summary completed successfully'
        };
        break;
      case 'failed':
        statusInfo = {
          message: 'AI summary generation failed',
          canRetry: true
        };
        break;
      case 'not_requested':
      default:
        statusInfo = {
          message: 'No AI summary requested for this meeting'
        };
        break;
    }
    
    res.status(200).json({
      success: true,
      data: {
        ...summary,
        statusInfo
      }
    });

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching meeting summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createSummary,
  getSummary
};
