const OpenAI = require('openai');
const logger = require('../utils/logger');

let openai;

// Initialize OpenAI client only when needed
function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

const generateSummary = async (summaryId, transcript, customPrompt = null) => {
  const openai = getOpenAIClient();
  try {
    logger.info(`Generating summary for ${summaryId}...`);

    // Prepare prompt
    let prompt;
    if (customPrompt) {
      prompt = `Custom summary request: ${customPrompt}\n\nMeeting transcript:\n${transcript.substring(0, 15000)}`;
    } else {
      prompt = `Create a concise meeting summary from the following transcript. 
Include key decisions, action items, and important discussion points. 
Format the summary with clear sections using markdown.

Transcript:
${transcript.substring(0, 15000)}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert meeting assistant that creates clear, structured summaries."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const summary = response.choices[0].message.content;
    logger.info(`Summary generated for ${summaryId}`);
    return summary;

  } catch (error) {
    logger.error('OpenAI API error:', error);
    throw new Error('Failed to generate summary: ' + error.message);
  }
};

module.exports = { generateSummary };
