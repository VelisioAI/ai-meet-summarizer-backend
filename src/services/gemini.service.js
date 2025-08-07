const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let genAI;

// Initialize Gemini client only when needed
function getGeminiClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const generateSummary = async (summaryId, transcript, customPrompt = null) => {
  try {
    logger.info(`Generating AI summary for ${summaryId} using Gemini...`);

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Most cost-effective

    // Enhanced prompt for better structured output
    let prompt;
    if (customPrompt) {
      prompt = `${customPrompt}

Please analyze this meeting transcript and provide a summary based on your custom requirements:

${transcript.substring(0, 32000)}`; // Gemini has higher context limit
    } else {
      prompt = `You are an expert AI meeting assistant. Please analyze the following meeting transcript and create a comprehensive, well-structured summary.

**Instructions:**
- Provide a clear, professional summary with distinct sections
- Focus on actionable insights and key outcomes
- Use markdown formatting for better readability
- Be concise but thorough

**Required Structure:**
## 📋 Meeting Overview
Brief 2-3 sentence summary of the meeting's purpose and main outcomes.

## 🎯 Key Decisions Made
- List major decisions reached during the meeting
- Include any voting outcomes or consensus reached

## ✅ Action Items
- Clearly list all tasks assigned with responsible parties (if mentioned)
- Include deadlines or timelines where specified
- Format: [Task] - [Owner] - [Due Date]

## 💡 Important Discussion Points
- Highlight significant topics discussed
- Include any concerns, objections, or alternative viewpoints raised
- Note any unresolved issues that need follow-up

## 📊 Data & Metrics Discussed
- Any numbers, statistics, or KPIs mentioned
- Performance metrics or targets discussed

## 🔄 Next Steps
- Upcoming meetings or follow-up sessions planned
- Dependencies or prerequisites for action items
- Timeline for next review or check-in

**Meeting Transcript:**
${transcript.substring(0, 32000)}`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    if (!summary) {
      throw new Error('Empty response from Gemini API');
    }

    logger.info(`AI summary successfully generated for ${summaryId}`);
    return summary;

  } catch (error) {
    logger.error('Gemini API error:', error);
    
    // More specific error handling
    if (error.message?.includes('API_KEY')) {
      throw new Error('Invalid Gemini API key configuration');
    } else if (error.message?.includes('QUOTA_EXCEEDED')) {
      throw new Error('Gemini API quota exceeded. Please try again later.');
    } else if (error.message?.includes('CONTENT_FILTER')) {
      throw new Error('Content filtered by Gemini safety filters');
    } else {
      throw new Error('Failed to generate AI summary: ' + (error.message || 'Unknown error'));
    }
  }
};

module.exports = { generateSummary };