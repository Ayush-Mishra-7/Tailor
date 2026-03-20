import { LLMConfigurationError, LLMProviderRequestError, LLMProviderResponseError } from "../errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "../types";

const DEFAULT_MODEL = "gemini-1.5-flash";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model = DEFAULT_MODEL,
  ) {
    if (!apiKey) {
      throw new LLMConfigurationError(
        "Gemini is selected, but GOOGLE_API_KEY is missing. Add it to .env or choose a different LLM_PROVIDER.",
      );
    }
  }

  async generate(messages: LLMMessage[], options: LLMGenerateOptions): Promise<string> {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: options.systemPrompt }],
          },
          generationConfig: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens ?? 4096,
          },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const providerMessage = data?.error?.message;
        throw new LLMProviderResponseError(
          providerMessage
            ? `Gemini returned an error: ${providerMessage}`
            : `Gemini returned HTTP ${response.status}.`,
        );
      }

      const parts = data?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts
            .map((part) => part?.text)
            .filter((part): part is string => typeof part === "string")
            .join("\n")
            .trim()
        : "";

      if (!text) {
        throw new LLMProviderResponseError("Gemini returned an empty response.");
      }

      return text;
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMProviderResponseError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new LLMProviderRequestError(`Gemini request failed: ${error.message}`, error);
      }

      throw new LLMProviderRequestError("Gemini request failed.", error);
    }
  }
}
