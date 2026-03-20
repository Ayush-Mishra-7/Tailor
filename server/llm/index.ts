import { GeminiProvider } from "./providers/gemini";
import { AnthropicProvider } from "./providers/anthropic";
import { OllamaProvider } from "./providers/ollama";
import { PerplexityProvider } from "./providers/perplexity";
import { OpenAIProvider } from "./providers/openai";
import { LLMConfigurationError } from "./errors";
import type { LLMGenerateOptions, LLMMessage, LLMProvider } from "./types";

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export type SupportedProvider = "anthropic" | "openai" | "ollama" | "gemini" | "perplexity";

export interface LLMSelectionInput {
  provider?: string | null;
  model?: string | null;
}

export interface ResolvedLLMSelection {
  provider: SupportedProvider;
  model: string;
}

export interface LLMModelOption {
  id: string;
  label: string;
}

export interface LLMProviderOption {
  id: SupportedProvider;
  label: string;
  defaultModel: string;
  models: LLMModelOption[];
  allowsCustomModel: boolean;
  modelSource: "curated" | "ollama";
}

export interface LLMOptionsResponse {
  providers: LLMProviderOption[];
  defaultProvider: SupportedProvider | null;
  defaultModel: string | null;
}

const DEFAULT_MODELS: Record<SupportedProvider, string> = {
  anthropic: "claude-3-5-sonnet-latest",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
  gemini: "gemini-1.5-flash",
  perplexity: "sonar",
};

const PROVIDER_LABELS: Record<SupportedProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

const MODEL_OPTIONS: Record<Exclude<SupportedProvider, "ollama">, LLMModelOption[]> = {
  anthropic: [
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  gemini: [
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  perplexity: [
    { id: "sonar", label: "Sonar" },
    { id: "sonar-pro", label: "Sonar Pro" },
    { id: "sonar-reasoning", label: "Sonar Reasoning" },
  ],
};

function getSelectedProvider(providerOverride?: string | null): SupportedProvider {
  const provider = (providerOverride ?? process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase();

  if (provider === "anthropic" || provider === "openai" || provider === "ollama" || provider === "gemini" || provider === "perplexity") {
    return provider;
  }

  throw new LLMConfigurationError(
    `Unsupported LLM_PROVIDER \"${provider}\". Supported values are anthropic, openai, ollama, gemini, perplexity.`,
  );
}

function getModel(provider: SupportedProvider, modelOverride?: string | null): string {
  const configuredModel = modelOverride?.trim() || process.env.LLM_MODEL?.trim();
  return configuredModel || DEFAULT_MODELS[provider];
}

function hasCloudProviderKey(provider: Exclude<SupportedProvider, "ollama">): boolean {
  switch (provider) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
    case "gemini":
      return Boolean(process.env.GOOGLE_API_KEY?.trim());
    case "perplexity":
      return Boolean(process.env.PERPLEXITY_API_KEY?.trim());
  }
}

async function getOllamaProviderOption(): Promise<LLMProviderOption | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(2_000),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return null;
    }

    const discoveredModels = Array.isArray(data?.models)
      ? (data.models as Array<{ name?: unknown }>)
          .map((model: { name?: unknown }) => ({
            id: typeof model?.name === "string" ? model.name : "",
            label: typeof model?.name === "string" ? model.name : "",
          }))
          .filter((model: LLMModelOption): model is LLMModelOption => Boolean(model.id))
      : [];

    return {
      id: "ollama",
      label: PROVIDER_LABELS.ollama,
      defaultModel: discoveredModels[0]?.id || DEFAULT_MODELS.ollama,
      models: discoveredModels.length > 0 ? discoveredModels : [{ id: DEFAULT_MODELS.ollama, label: DEFAULT_MODELS.ollama }],
      allowsCustomModel: true,
      modelSource: "ollama",
    };
  } catch {
    return null;
  }
}

export function resolveLLMSelection(selection: LLMSelectionInput = {}): ResolvedLLMSelection {
  const provider = getSelectedProvider(selection.provider);
  const model = getModel(provider, selection.model);

  return { provider, model };
}

export function getLLMProvider(selection: LLMSelectionInput = {}): LLMProvider {
  const { provider, model } = resolveLLMSelection(selection);

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, model);
    case "openai":
      return new OpenAIProvider(process.env.OPENAI_API_KEY, model);
    case "ollama":
      return new OllamaProvider(process.env.OLLAMA_BASE_URL, model);
    case "gemini":
      return new GeminiProvider(process.env.GOOGLE_API_KEY, model);
    case "perplexity":
      return new PerplexityProvider(process.env.PERPLEXITY_API_KEY, model);
    default:
      throw new LLMConfigurationError(`Unsupported LLM provider: ${provider}`);
  }
}

export async function getAvailableLLMOptions(): Promise<LLMOptionsResponse> {
  const providers: LLMProviderOption[] = [];

  if (hasCloudProviderKey("anthropic")) {
    providers.push({
      id: "anthropic",
      label: PROVIDER_LABELS.anthropic,
      defaultModel: DEFAULT_MODELS.anthropic,
      models: MODEL_OPTIONS.anthropic,
      allowsCustomModel: true,
      modelSource: "curated",
    });
  }

  if (hasCloudProviderKey("openai")) {
    providers.push({
      id: "openai",
      label: PROVIDER_LABELS.openai,
      defaultModel: DEFAULT_MODELS.openai,
      models: MODEL_OPTIONS.openai,
      allowsCustomModel: true,
      modelSource: "curated",
    });
  }

  if (hasCloudProviderKey("perplexity")) {
    providers.push({
      id: "perplexity",
      label: PROVIDER_LABELS.perplexity,
      defaultModel: DEFAULT_MODELS.perplexity,
      models: MODEL_OPTIONS.perplexity,
      allowsCustomModel: true,
      modelSource: "curated",
    });
  }

  if (hasCloudProviderKey("gemini")) {
    providers.push({
      id: "gemini",
      label: PROVIDER_LABELS.gemini,
      defaultModel: DEFAULT_MODELS.gemini,
      models: MODEL_OPTIONS.gemini,
      allowsCustomModel: true,
      modelSource: "curated",
    });
  }

  const ollamaProvider = await getOllamaProviderOption();
  if (ollamaProvider) {
    providers.push(ollamaProvider);
  }

  const envProvider = process.env.LLM_PROVIDER?.trim();
  const defaultProvider = providers.some((provider) => provider.id === envProvider)
    ? getSelectedProvider(envProvider)
    : providers[0]?.id ?? null;
  const defaultModel = defaultProvider
    ? providers.find((provider) => provider.id === defaultProvider)?.defaultModel ?? DEFAULT_MODELS[defaultProvider]
    : null;

  return {
    providers,
    defaultProvider,
    defaultModel,
  };
}

export async function generateLLMResponse(
  messages: LLMMessage[],
  options: LLMGenerateOptions,
  selection: LLMSelectionInput = {},
): Promise<string> {
  const provider = getLLMProvider(selection);
  return provider.generate(messages, options);
}

export type { LLMGenerateOptions, LLMMessage, LLMProvider } from "./types";
export { LLMConfigurationError, LLMError, LLMProviderRequestError, LLMProviderResponseError } from "./errors";
