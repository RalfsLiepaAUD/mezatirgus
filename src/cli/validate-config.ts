import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigurationBundle } from "../config/load.js";
import { buildProvenanceReport, provenanceReportMarkdown } from "../config/report.js";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(currentFile, "../../..");
const bundle = await loadConfigurationBundle(projectRoot);
const errors = bundle.issues.filter((entry) => entry.severity === "error");
const warnings = bundle.issues.filter((entry) => entry.severity === "warning");
const report = buildProvenanceReport(bundle);

console.log(errors.length === 0 ? "Configuration valid" : "Configuration invalid");
console.log(`Version: ${String((bundle.manifest as { bundleVersion?: unknown }).bundleVersion ?? "unknown")}`);
console.log(`Hash: ${bundle.hash}`);
console.log("Record counts:");
for (const [file, count] of Object.entries(bundle.counts)) console.log(`  ${file}: ${count}`);
console.log("Provenance value counts:");
for (const [category, count] of Object.entries(report.countsByCategory)) console.log(`  ${category}: ${count}`);
console.log(`Warnings: ${warnings.length + report.warnings.length}`);
for (const warning of [...warnings.map((entry) => `${entry.path}: ${entry.message}`), ...report.warnings]) {
  console.log(`  WARN ${warning}`);
}
for (const error of errors) console.error(`  ERROR ${error.path}: ${error.message}`);

if (process.argv.includes("--write-reports")) {
  const reportDir = resolve(projectRoot, "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(resolve(reportDir, "provenance-manifest.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(resolve(reportDir, "provenance-manifest.md"), provenanceReportMarkdown(report), "utf8");
  console.log(`Reports written to ${reportDir}`);
}

if (errors.length > 0) process.exitCode = 1;
