import { LLMConfigurationError, LLMProviderRequestError, LLMProviderResponseError } from "../errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "../types";

const DEFAULT_MODEL = "llama3.1";
const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl = DEFAULT_BASE_URL,
    private readonly model = DEFAULT_MODEL,
  ) {
    if (!baseUrl) {
      throw new LLMConfigurationError(
        "Ollama is selected, but OLLAMA_BASE_URL is missing. Add it to .env or choose a different LLM_PROVIDER.",
      );
    }
  }

  async generate(messages: LLMMessage[], options: LLMGenerateOptions): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: "system", content: options.systemPrompt },
            ...messages,
          ],
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens ?? 4096,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const providerMessage = data?.error;
        throw new LLMProviderResponseError(
          providerMessage
            ? `Ollama returned an error: ${providerMessage}`
            : `Ollama returned HTTP ${response.status}.`,
        );
      }

      const text = data?.message?.content?.trim();
      if (!text) {
        throw new LLMProviderResponseError("Ollama returned an empty response.");
      }

      return text;
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMProviderResponseError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new LLMProviderRequestError(`Ollama request failed: ${error.message}`, error);
      }

      throw new LLMProviderRequestError("Ollama request failed.", error);
    }
  }
}
