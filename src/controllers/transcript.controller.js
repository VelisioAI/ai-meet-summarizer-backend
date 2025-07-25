const { getClient } = require('../utils/config');
const { getCreditBalance } = require('./credit.controller');
const { generateSummary } = require('../services/openai.service');
const logger = require('../utils/logger');

const processTranscript = async (req, res) => {
  const client = await getClient();
  
  try {
    const userId = req.user.id;
    const { 
      title, 
      transcript_text, 
      transcript_json, 
      meeting_metadata,
      should_summarize = true
    } = req.body;

    // Validate input
    if (!transcript_json || !transcript_text) {
      return res.status(400).json({
        success: false,
        message: 'Transcript data is required'
      });
    }

    await client.query('BEGIN');

    // Calculate cost based on transcript length
    const transcriptLength = transcript_text.length;
    const cost = Math.max(1, Math.ceil(transcriptLength / 5000)); // 1 credit per 5000 characters

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

    // Insert transcript with pending summary status
    const insertQuery = `
      INSERT INTO summaries (
        user_id, 
        title, 
        transcript_text, 
        transcript_json, 
        meeting_metadata,
        summary_status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `;

    const result = await client.query(insertQuery, [
      userId,
      title || `Meeting on ${new Date().toLocaleDateString()}`,
      transcript_text,
      transcript_json,
      meeting_metadata || null,
      should_summarize ? 'pending' : 'not_requested'
    ]);

    const summaryId = result.rows[0].id;

    // Deduct credits
    const deductQuery = `
      INSERT INTO credit_logs (user_id, change, reason)
      VALUES ($1, $2, $3)
    `;
    await client.query(deductQuery, [
      userId,
      -cost,
      `Transcript processing: ${cost} credits for ${transcriptLength} chars`
    ]);

    // Update user credits
    await client.query(
      'UPDATE users SET credits = credits - $1 WHERE id = $2',
      [cost, userId]
    );

    await client.query('COMMIT');

    // Generate summary asynchronously if requested
    if (should_summarize) {
      generateSummary(summaryId, transcript_text)
        .then(summaryText => {
          // Update summary in database
          query(
            `UPDATE summaries 
             SET summary_text = $1, summary_status = 'completed'
             WHERE id = $2`,
            [summaryText, summaryId]
          );
          logger.info(`Summary generated for transcript ${summaryId}`);
        })
        .catch(error => {
          logger.error(`Failed to generate summary for ${summaryId}:`, error);
          // Update status to failed
          query(
            `UPDATE summaries SET summary_status = 'failed' WHERE id = $1`,
            [summaryId]
          );
        });
    }

    res.status(201).json({
      success: true,
      data: {
        summaryId,
        creditsDeducted: cost,
        remainingCredits: currentCredits - cost,
        summaryRequested: should_summarize,
        status: should_summarize ? 'processing' : 'not_requested'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing transcript:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing meeting transcript',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  } finally {
    client.release();
  }
};

module.exports = {
  processTranscript
};