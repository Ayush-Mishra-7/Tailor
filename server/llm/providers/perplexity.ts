import { LLMConfigurationError, LLMProviderRequestError, LLMProviderResponseError } from "../errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "../types";

const DEFAULT_MODEL = "sonar";
const PERPLEXITY_BASE_URL = "https://api.perplexity.ai/chat/completions";

export class PerplexityProvider implements LLMProvider {
  readonly name = "perplexity";

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model = DEFAULT_MODEL,
  ) {
    if (!apiKey) {
      throw new LLMConfigurationError(
        "Perplexity is selected, but PERPLEXITY_API_KEY is missing. Add it to .env or choose a different LLM_PROVIDER.",
      );
    }
  }

  async generate(messages: LLMMessage[], options: LLMGenerateOptions): Promise<string> {
    try {
      const response = await fetch(PERPLEXITY_BASE_URL, {
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
            ? `Perplexity returned an error: ${providerMessage}`
            : `Perplexity returned HTTP ${response.status}.`,
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
        throw new LLMProviderResponseError("Perplexity returned an empty response.");
      }

      return text;
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMProviderResponseError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new LLMProviderRequestError(`Perplexity request failed: ${error.message}`, error);
      }

      throw new LLMProviderRequestError("Perplexity request failed.", error);
    }
  }
}