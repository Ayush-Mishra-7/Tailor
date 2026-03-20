import { fetchSanitizedUrlContent, fetchSkippedResult } from "./url-fetch";
import type { EnrichmentSourceResult } from "../types";

const DISALLOWED_HOST_PATTERNS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)indeed\.com$/i,
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)ashbyhq\.com$/i,
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)myworkdayjobs\.com$/i,
  /(^|\.)workday\.com$/i,
  /(^|\.)ziprecruiter\.com$/i,
  /(^|\.)dice\.com$/i,
  /(^|\.)builtin\.com$/i,
  /(^|\.)monster\.com$/i,
  /(^|\.)glassdoor\.com$/i,
  /(^|\.)workable\.com$/i,
  /(^|\.)boards\.greenhouse\.io$/i,
];

function inferCompanyProfileUrl(jobUrl?: string | null): string | null {
  if (!jobUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(jobUrl);
    if (DISALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(parsedUrl.hostname))) {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

export async function fetchCompanyProfileContext(input: {
  companyName?: string | null;
  jobUrl?: string | null;
}): Promise<EnrichmentSourceResult> {
  const companyProfileUrl = inferCompanyProfileUrl(input.jobUrl);
  if (!companyProfileUrl) {
    return fetchSkippedResult(
      "COMPANY CONTEXT",
      "company-profile",
      input.jobUrl
        ? "No approved company source could be inferred from the provided job URL."
        : "No company source is available without a job URL.",
    );
  }

  const label = input.companyName
    ? `COMPANY CONTEXT (${input.companyName})`
    : "COMPANY CONTEXT";

  return fetchSanitizedUrlContent(companyProfileUrl, label, "company-homepage");
}
