export class LLMError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(message: string, options?: { code?: string; statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.code = options?.code ?? "LLM_ERROR";
    this.statusCode = options?.statusCode ?? 500;
    this.cause = options?.cause;
  }
}

export class LLMConfigurationError extends LLMError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "LLM_CONFIGURATION_ERROR",
      statusCode: 400,
      cause,
    });
  }
}

export class LLMProviderResponseError extends LLMError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "LLM_PROVIDER_RESPONSE_ERROR",
      statusCode: 502,
      cause,
    });
  }
}

export class LLMProviderRequestError extends LLMError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: "LLM_PROVIDER_REQUEST_ERROR",
      statusCode: 504,
      cause,
    });
  }
}
