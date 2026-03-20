import { LLMConfigurationError, LLMProviderRequestError, LLMProviderResponseError } from "../errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "../types";

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model = DEFAULT_MODEL,
  ) {
    if (!apiKey) {
      throw new LLMConfigurationError(
        "OpenAI is selected, but OPENAI_API_KEY is missing. Add it to .env or choose a different LLM_PROVIDER.",
      );
    }
  }

  async generate(messages: LLMMessage[], options: LLMGenerateOptions): Promise<string> {
    try {
      const response = await fetch(OPENAI_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature,
          messages: [
            { role: "system", content: options.systemPrompt },
            ...messages,
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const providerMessage = data?.error?.message;
        throw new LLMProviderResponseError(
          providerMessage
            ? `OpenAI returned an error: ${providerMessage}`
            : `OpenAI returned HTTP ${response.status}.`,
        );
      }

      const content = data?.choices?.[0]?.message?.content;
      const text = typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content
              .map((part) => part?.text)
              .filter((part): part is string => typeof part === "string")
              .join("\n")
              .trim()
          : "";

      if (!text) {
        throw new LLMProviderResponseError("OpenAI returned an empty response.");
      }

      return text;
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMProviderResponseError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new LLMProviderRequestError(`OpenAI request failed: ${error.message}`, error);
      }

      throw new LLMProviderRequestError("OpenAI request failed.", error);
    }
  }
}
