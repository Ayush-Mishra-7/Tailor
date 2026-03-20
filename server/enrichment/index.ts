import { fetchCompanyProfileContext } from "./fetchers/company-profile";
import { fetchDisabledResult, fetchJobUrlContent, fetchSkippedResult } from "./fetchers/url-fetch";
import { buildEnrichmentResult } from "./normalize";
import type { EnrichmentMetadata, EnrichmentOverallStatus, EnrichmentSourceResult, EnrichmentResult } from "./types";

function isEnrichmentEnabled(): boolean {
  const rawValue = (process.env.ENABLE_ENRICHMENT ?? "true").trim().toLowerCase();
  return rawValue !== "false" && rawValue !== "0" && rawValue !== "off";
}

function deriveOverallStatus(results: EnrichmentSourceResult[]): EnrichmentOverallStatus {
  const statuses = results.map((result) => result.status);

  if (statuses.every((status) => status === "disabled")) {
    return "disabled";
  }

  if (statuses.every((status) => status === "skipped")) {
    return "skipped";
  }

  const successCount = statuses.filter((status) => status === "success").length;
  const failedCount = statuses.filter((status) => status === "failed").length;

  if (successCount > 0 && failedCount === 0) {
    return "completed";
  }

  if (successCount > 0 && failedCount > 0) {
    return "partial";
  }

  if (successCount > 0) {
    return "completed";
  }

  if (failedCount > 0) {
    return "failed";
  }

  return "skipped";
}

export async function enrichSessionContext(input: {
  jobUrl?: string | null;
  companyName?: string | null;
}): Promise<EnrichmentResult> {
  const performedAt = new Date().toISOString();

  if (!isEnrichmentEnabled()) {
    const metadata: EnrichmentMetadata = {
      overallStatus: "disabled",
      performedAt,
      jobUrl: fetchDisabledResult("JOB URL EXTRACTED CONTEXT", "user-job-url"),
      companyContext: fetchDisabledResult("COMPANY CONTEXT", "company-profile"),
    };

    return buildEnrichmentResult(metadata);
  }

  const [jobUrlResult, companyContextResult] = await Promise.all([
    input.jobUrl
      ? fetchJobUrlContent(input.jobUrl)
      : Promise.resolve(fetchSkippedResult("JOB URL EXTRACTED CONTEXT", "user-job-url", "No job URL was provided.")),
    fetchCompanyProfileContext({
      companyName: input.companyName,
      jobUrl: input.jobUrl,
    }),
  ]);

  const metadata: EnrichmentMetadata = {
    overallStatus: deriveOverallStatus([jobUrlResult, companyContextResult]),
    performedAt,
    jobUrl: jobUrlResult,
    companyContext: companyContextResult,
  };

  return buildEnrichmentResult(metadata);
}

export { buildTailoringPrompt } from "./normalize";
export type { EnrichmentMetadata, EnrichmentResult, EnrichmentSourceResult } from "./types";
