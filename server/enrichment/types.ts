export type EnrichmentSourceStatus = "success" | "failed" | "skipped" | "disabled";
export type EnrichmentOverallStatus = "completed" | "partial" | "failed" | "skipped" | "disabled";

export interface EnrichmentSourceResult {
  label: string;
  status: EnrichmentSourceStatus;
  source: string;
  text: string;
  fetchedAt: string;
  url?: string;
  error?: string;
}

export interface EnrichmentMetadata {
  overallStatus: EnrichmentOverallStatus;
  performedAt: string;
  jobUrl: EnrichmentSourceResult;
  companyContext: EnrichmentSourceResult;
}

export interface EnrichmentResult {
  promptContext: string;
  metadata: EnrichmentMetadata;
}

export interface TailoringPromptInput {
  resumeText: string;
  jobDescription?: string | null;
  jobUrl?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  enrichmentContext?: string;
}
