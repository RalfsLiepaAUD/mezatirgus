import type { LoadedBundle, ProvenanceCategory, ProvenanceUsage } from "./types.js";
import { PROVENANCE_CATEGORIES } from "./types.js";

export interface ProvenanceReport {
  configHash: string;
  generatedFromBundleVersion: string;
  countsByCategory: Record<ProvenanceCategory, number>;
  verified: ProvenanceUsage[];
  assumed: ProvenanceUsage[];
  placeholder: ProvenanceUsage[];
  uncertain: ProvenanceUsage[];
  researchRequired: ProvenanceUsage[];
  warnings: string[];
  all: ProvenanceUsage[];
}

export function buildProvenanceReport(bundle: LoadedBundle): ProvenanceReport {
  const countsByCategory = Object.fromEntries(
    PROVENANCE_CATEGORIES.map((category) => [
      category,
      bundle.provenanceEntries.filter((entry) => entry.category === category).length,
    ]),
  ) as Record<ProvenanceCategory, number>;

  return {
    configHash: bundle.hash,
    generatedFromBundleVersion: String((bundle.manifest as { bundleVersion?: unknown }).bundleVersion ?? "unknown"),
    countsByCategory,
    verified: bundle.provenanceEntries.filter((entry) => entry.category === "VERIFIED"),
    assumed: bundle.provenanceEntries.filter((entry) => entry.category === "ASSUMED"),
    placeholder: bundle.provenanceEntries.filter((entry) => entry.category === "PLACEHOLDER"),
    uncertain: bundle.provenanceEntries.filter((entry) => entry.category === "UNCERTAIN"),
    researchRequired: bundle.provenanceEntries.filter((entry) => entry.researchRequired),
    warnings: bundle.provenanceEntries.flatMap((entry) =>
      entry.warning ? [`${entry.configFile}:${entry.fieldPath}: ${entry.warning}`] : [],
    ),
    all: bundle.provenanceEntries,
  };
}

export function provenanceReportMarkdown(report: ProvenanceReport): string {
  const lines = [
    "# Configuration Provenance Manifest",
    "",
    `- Bundle version: ${report.generatedFromBundleVersion}`,
    `- Configuration hash: \`${report.configHash}\``,
    "",
    "## Counts by category",
    "",
    "| Category | Values |",
    "|---|---:|",
    ...Object.entries(report.countsByCategory).map(([category, count]) => `| ${category} | ${count} |`),
    "",
    "## Research required",
    "",
    "| Category | Configuration field | Source | Confidence |",
    "|---|---|---|---|",
    ...report.researchRequired.map(
      (entry) =>
        `| ${entry.category} | \`${entry.configFile}:${entry.fieldPath}\` | ${entry.sourceFile}, ${entry.sourceLocator} | ${entry.confidence} |`,
    ),
    "",
    "## All assumptions and sourced values",
    "",
    "| Category | Configuration field | Source | Warning |",
    "|---|---|---|---|",
    ...report.all.map(
      (entry) =>
        `| ${entry.category} | \`${entry.configFile}:${entry.fieldPath}\` | ${entry.sourceFile}, ${entry.sourceLocator} | ${entry.warning ?? ""} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
