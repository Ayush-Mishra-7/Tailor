import Anthropic from "@anthropic-ai/sdk";
import { LLMConfigurationError, LLMProviderRequestError, LLMProviderResponseError } from "../errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "../types";

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string | undefined, model = DEFAULT_MODEL) {
    if (!apiKey) {
      throw new LLMConfigurationError(
        "Anthropic is selected, but ANTHROPIC_API_KEY is missing. Add it to .env or choose a different LLM_PROVIDER.",
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(messages: LLMMessage[], options: LLMGenerateOptions): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        system: options.systemPrompt,
        messages,
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!text) {
        throw new LLMProviderResponseError("Anthropic returned an empty response.");
      }

      return text;
    } catch (error) {
      if (error instanceof LLMConfigurationError || error instanceof LLMProviderResponseError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new LLMProviderRequestError(`Anthropic request failed: ${error.message}`, error);
      }

      throw new LLMProviderRequestError("Anthropic request failed.", error);
    }
  }
}
