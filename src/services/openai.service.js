const { Configuration, OpenAIApi } = require("openai");
const logger = require('../utils/logger');

// Initialize OpenAI client
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const generateSummary = async (summaryId, transcript, customPrompt = null) => {
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
${transcript.substring(0, 15000)}`; // Limit to 15k chars
    }

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-16k",
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

    const summary = response.data.choices[0].message.content;
    logger.info(`Summary generated for ${summaryId}`);
    return summary;
  } catch (error) {
    logger.error('OpenAI API error:', error.response ? error.response.data : error.message);
    throw new Error('Failed to generate summary: ' + (error.response?.data?.error?.message || error.message));
  }
};

module.exports = {
  generateSummary
};