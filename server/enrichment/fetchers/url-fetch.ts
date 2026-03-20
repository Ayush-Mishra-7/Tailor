import type { EnrichmentSourceResult } from "../types";

const MAX_FETCH_CHARS = 50_000;
const MAX_PROMPT_CHARS = 6_000;
const REQUEST_TIMEOUT_MS = 8_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function nowIso(): string {
  return new Date().toISOString();
}

function createResult(overrides: Partial<EnrichmentSourceResult> & Pick<EnrichmentSourceResult, "label" | "status" | "source">): EnrichmentSourceResult {
  return {
    text: "",
    fetchedAt: nowIso(),
    ...overrides,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)));
}

function sanitizeHtmlToText(html: string): string {
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/section>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(text)
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PROMPT_CHARS);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "TailorBot/1.0 (+local-dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUrlHtml(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < 2) {
          continue;
        }

        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return html.slice(0, MAX_FETCH_CHARS);
    } catch (error) {
      lastError = error;
      if (attempt >= 2) {
        break;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Request failed.");
}

export function fetchDisabledResult(label: string, source: string): EnrichmentSourceResult {
  return createResult({
    label,
    status: "disabled",
    source,
  });
}

export function fetchSkippedResult(label: string, source: string, error?: string): EnrichmentSourceResult {
  return createResult({
    label,
    status: "skipped",
    source,
    error,
  });
}

export async function fetchSanitizedUrlContent(
  url: string,
  label: string,
  source: string,
): Promise<EnrichmentSourceResult> {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return createResult({
        label,
        status: "failed",
        source,
        url,
        error: "Only http and https URLs are supported for enrichment.",
      });
    }

    const html = await fetchUrlHtml(parsedUrl.toString());
    const text = sanitizeHtmlToText(html);

    if (!text) {
      return createResult({
        label,
        status: "failed",
        source,
        url: parsedUrl.toString(),
        error: "The page was fetched, but no usable text could be extracted.",
      });
    }

    return createResult({
      label,
      status: "success",
      source,
      url: parsedUrl.toString(),
      text,
    });
  } catch (error) {
    return createResult({
      label,
      status: "failed",
      source,
      url,
      error: error instanceof Error ? error.message : "Unknown fetch error.",
    });
  }
}

export async function fetchJobUrlContent(jobUrl?: string | null): Promise<EnrichmentSourceResult> {
  if (!jobUrl) {
    return fetchSkippedResult(
      "JOB URL EXTRACTED CONTEXT",
      "user-job-url",
      "No job URL was provided.",
    );
  }

  return fetchSanitizedUrlContent(jobUrl, "JOB URL EXTRACTED CONTEXT", "user-job-url");
}
