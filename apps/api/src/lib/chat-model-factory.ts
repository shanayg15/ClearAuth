import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

interface ChatModelParams {
  temperature?: number;
  maxTokens?: number;
  modelName?: string;
}

export function createChatModel(params?: ChatModelParams) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (geminiApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: geminiApiKey,
      model: params?.modelName?.includes("gemini") ? params.modelName : "gemini-1.5-pro",
      temperature: params?.temperature,
      maxOutputTokens: params?.maxTokens,
    });
  }

  if (anthropicApiKey) {
    return new ChatAnthropic({
      apiKey: anthropicApiKey,
      model: params?.modelName?.includes("claude") ? params.modelName : "claude-sonnet-4-20250514",
      temperature: params?.temperature,
      maxTokens: params?.maxTokens,
    });
  }

  // No API key — return null so callers fall back to rule-based logic
  return null;
}
