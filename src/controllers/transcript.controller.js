const { getClient } = require('../utils/config');
const { getCreditBalance } = require('./credit.controller');
const { generateSummary } = require('../services/gemini.service');
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
      meeting_duration_minutes, // Used for credit calculation
      should_summarize = false // Additional cost for AI summarization
    } = req.body;

    // Validate input
    if (!transcript_json || !transcript_text) {
      return res.status(400).json({
        success: false,
        message: 'Transcript data is required'
      });
    }

    // Calculate credits needed based on duration (1 credit per 30 minutes, rounded up)
    const durationMinutes = meeting_duration_minutes || 0;
    const transcriptCredits = Math.ceil(durationMinutes / 30); // Round up to nearest 30 minutes
    
    // Additional cost for AI summarization
    const summaryCredits = should_summarize ? 1 : 0;
    
    // Total cost
    const totalCost = transcriptCredits + summaryCredits;

    await client.query('BEGIN');

    let remainingCredits = await getCreditBalance(userId);

    // Check user credits for both transcript storage and optional summarization
    if (remainingCredits < totalCost) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: `Insufficient credits. Need ${totalCost} credits (${transcriptCredits} for ${durationMinutes}min transcript${should_summarize ? ` + ${summaryCredits} for AI summary` : ''})`,
        requiredCredits: totalCost,
        currentCredits: remainingCredits,
        breakdown: {
          transcriptCredits,
          summaryCredits,
          durationMinutes,
          totalCost
        }
      });
    }

    // Insert transcript
    const insertQuery = `
      INSERT INTO summaries (
        user_id, 
        title, 
        transcript_text, 
        transcript_json, 
        meeting_metadata,
        meeting_duration_minutes,
        summary_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;

    const result = await client.query(insertQuery, [
      userId,
      title || `Meeting on ${new Date().toLocaleDateString()}`,
      transcript_text,
      transcript_json,
      meeting_metadata || null,
      meeting_duration_minutes || null,
      should_summarize ? 'pending' : 'not_requested'
    ]);

    const summaryId = result.rows[0].id;

    // Deduct credits for transcript storage
    if (transcriptCredits > 0) {
      const transcriptDeductQuery = `
        INSERT INTO credit_logs (user_id, change, reason)
        VALUES ($1, $2, $3)
      `;
      await client.query(transcriptDeductQuery, [
        userId,
        -transcriptCredits,
        `Transcript storage (${durationMinutes} minutes): ${title || summaryId}`
      ]);
    }

    // Deduct additional credits for AI summarization if requested
    if (should_summarize && summaryCredits > 0) {
      const summaryDeductQuery = `
        INSERT INTO credit_logs (user_id, change, reason)
        VALUES ($1, $2, $3)
      `;
      await client.query(summaryDeductQuery, [
        userId,
        -summaryCredits,
        `AI summary generation for meeting: ${title || summaryId}`
      ]);
    }

    // Update user credits (total deduction)
    if (totalCost > 0) {
      await client.query(
        'UPDATE users SET credits = credits - $1 WHERE id = $2',
        [totalCost, userId]
      );
      remainingCredits -= totalCost;
    }

    await client.query('COMMIT');

    // Generate summary asynchronously if requested
    if (should_summarize) {
      generateSummary(summaryId, transcript_text)
        .then(summaryText => {
          // Update summary in database
          return client.query(
            `UPDATE summaries 
             SET summary_text = $1, summary_status = 'completed'
             WHERE id = $2`,
            [summaryText, summaryId]
          );
        })
        .then(() => {
          logger.info(`Summary generated for transcript ${summaryId}`);
        })
        .catch(error => {
          logger.error(`Failed to generate summary for ${summaryId}:`, error);
          // Update status to failed
          client.query(
            `UPDATE summaries SET summary_status = 'failed' WHERE id = $1`,
            [summaryId]
          ).catch(updateError => {
            logger.error(`Failed to update status for ${summaryId}:`, updateError);
          });
        });
    }

    res.status(201).json({
      success: true,
      data: {
        summaryId,
        creditsDeducted: totalCost,
        remainingCredits,
        summaryRequested: should_summarize,
        status: should_summarize ? 'processing' : 'transcript_saved',
        message: should_summarize ? 
          `Transcript saved (${transcriptCredits} credits) and AI summary is being generated (+${summaryCredits} credit)` : 
          `Transcript saved successfully! Used ${transcriptCredits} credits for ${durationMinutes} minutes of recording.`,
        costBreakdown: {
          transcriptCredits,
          summaryCredits,
          durationMinutes,
          totalCost
        }
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