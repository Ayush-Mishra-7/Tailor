export type LLMRole = "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMGenerateOptions {
  systemPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  name: string;
  generate(messages: LLMMessage[], options: LLMGenerateOptions): Promise<string>;
}
