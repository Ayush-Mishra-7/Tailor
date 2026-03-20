import type { EnrichmentMetadata, EnrichmentResult, EnrichmentSourceResult, TailoringPromptInput } from "./types";

function trimBlock(text?: string | null): string {
  return (text ?? "").trim();
}

function appendSection(sections: string[], title: string, content?: string | null): void {
  const trimmed = trimBlock(content);
  if (!trimmed) {
    return;
  }

  sections.push(`[${title}]\n${trimmed}`);
}

function appendEnrichmentSection(sections: string[], source: EnrichmentSourceResult): void {
  if (source.status !== "success" || !source.text.trim()) {
    return;
  }

  sections.push(`[${source.label}]\n${source.text.trim()}`);
}

export function buildEnrichmentPromptContext(metadata: EnrichmentMetadata): string {
  const sections: string[] = [];
  appendEnrichmentSection(sections, metadata.jobUrl);
  appendEnrichmentSection(sections, metadata.companyContext);
  return sections.join("\n\n");
}

export function buildTailoringPrompt(input: TailoringPromptInput): string {
  const sections: string[] = [];
  appendSection(sections, "RESUME", input.resumeText);
  appendSection(sections, "JOB DESCRIPTION - USER PROVIDED", input.jobDescription);
  appendSection(sections, "JOB TARGET DETAILS", [
    input.companyName ? `Company: ${input.companyName}` : "",
    input.jobTitle ? `Position: ${input.jobTitle}` : "",
    input.jobUrl ? `Job URL: ${input.jobUrl}` : "",
  ].filter(Boolean).join("\n"));
  appendSection(sections, "ENRICHMENT CONTEXT", input.enrichmentContext);

  sections.push(
    "Please analyze my resume against this job context. If you have enough information, produce a tailored resume. If you need clarification about any of my experiences or skills, ask me specific questions first.",
  );

  return sections.join("\n\n");
}

export function buildEnrichmentResult(metadata: EnrichmentMetadata): EnrichmentResult {
  return {
    promptContext: buildEnrichmentPromptContext(metadata),
    metadata,
  };
}
