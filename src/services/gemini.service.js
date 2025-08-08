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

/**
 * Cleans Google Meet transcript JSON:
 * - Merges repeated identical lines
 * - Removes filler/noise phrases
 * - Keeps meaningful dialogue
 */
function cleanTranscript(json) {
  if (!json || !json.entries) return '';

  const seen = new Set();
  const fillers = [
    /^okay(,|\s|$)/i,
    /^how are you\??$/i,
    /^i'?m fine/i,
    /^nothing much/i,
    /^sure go ahead/i,
    /^yes(\.|,|$)/i
  ];

  return json.entries
    .map(e => `${e.speaker}: ${e.text.trim()}`)
    .filter(line => {
      const lower = line.toLowerCase();
      if (seen.has(lower)) return false; // Remove exact duplicates
      if (fillers.some(f => f.test(line))) return false; // Remove filler
      seen.add(lower);
      return true;
    })
    .join('\n');
}

const generateSummary = async (summaryId, transcriptJsonString, customPrompt = null) => {
  try {
    logger.info(`Generating AI summary for ${summaryId} using Gemini...`);

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Parse and clean transcript
    let cleanedTranscript;
    try {
      const parsed = JSON.parse(transcriptJsonString);
      cleanedTranscript = cleanTranscript(parsed);
    } catch (err) {
      logger.info("Transcript not in JSON format, using raw string");
      cleanedTranscript = transcriptJsonString;
    }

    if (!cleanedTranscript.trim()) {
      logger.info(`Transcript for ${summaryId} is empty after cleaning.`);
      return "The meeting contained no substantive discussion to summarise.";
    }

    // Prompt building
    let prompt;
    if (customPrompt) {
      prompt = `${customPrompt}

Please analyze this cleaned meeting transcript and provide a summary based on your custom requirements:

${cleanedTranscript.substring(0, 32000)}`;
    } else {
      prompt = `You are an expert meeting summarizer.
The following transcript may contain repetitions, casual chatter, or filler.
Your job:
- Ignore irrelevant, repeated, or meaningless lines.
- Focus ONLY on exchanges with concrete information, questions, or answers.
- If the meeting had little substance, still summarise what actually happened in 1–2 sentences.

Format:
## 📋 Meeting Overview
Brief 2–3 sentence summary.

## 🎯 Key Points Discussed
- Bullet points of important topics, decisions, or clarifications.

## ✅ Action Items (if any)
- [Task] - [Owner] - [Due Date]

## 🔄 Next Steps (if any)
- Upcoming plans or follow-ups.

Transcript:
${cleanedTranscript.substring(0, 32000)}`;
    }

    // Send to Gemini
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
