import { GeminiProvider } from "./providers/gemini";
import { AnthropicProvider } from "./providers/anthropic";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { LLMConfigurationError } from "./errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "./types";

const DEFAULT_PROVIDER = "anthropic";

type SupportedProvider = "anthropic" | "openai" | "ollama" | "gemini";

const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
  gemini: "gemini-1.5-flash",
};

function getSelectedProvider(): SupportedProvider {
  const provider = (process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase();

  if (provider === "anthropic" || provider === "openai" || provider === "ollama" || provider === "gemini") {
    return provider;
  }

  throw new LLMConfigurationError(
    `Unsupported LLM_PROVIDER \"${provider}\". Supported values are anthropic, openai, ollama, gemini.`,
  );
}

function getModel(provider: SupportedProvider): string {
  const configuredModel = process.env.LLM_MODEL?.trim();
  return configuredModel || DEFAULT_MODELS[provider];
}

export function getLLMProvider(): LLMProvider {
  const provider = getSelectedProvider();
  const model = getModel(provider);

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, model);
    case "openai":
      return new OpenAIProvider(process.env.OPENAI_API_KEY, model);
    case "ollama":
      return new OllamaProvider(process.env.OLLAMA_BASE_URL, model);
    case "gemini":
      return new GeminiProvider(process.env.GOOGLE_API_KEY, model);
    default:
      throw new LLMConfigurationError(`Unsupported LLM provider: ${provider}`);
  }
}

export async function generateLLMResponse(
  messages: LLMMessage[],
  options: LLMGenerateOptions,
): Promise<string> {
  const provider = getLLMProvider();
  return provider.generate(messages, options);
}

export type { LLMGenerateOptions, LLMMessage, LLMProvider } from "./types";
export { LLMConfigurationError, LLMError, LLMProviderRequestError, LLMProviderResponseError } from "./errors";
