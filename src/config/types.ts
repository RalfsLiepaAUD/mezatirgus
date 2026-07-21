export const PROVENANCE_CATEGORIES = [
  "VERIFIED",
  "RESEARCH_UPDATED",
  "FIRST_HAND",
  "DESIGN_INFERENCE",
  "TUNABLE",
  "PLACEHOLDER",
  "ASSUMED",
  "UNCERTAIN",
] as const;

export type ProvenanceCategory = (typeof PROVENANCE_CATEGORIES)[number];

export const UNITS = [
  "MINOR_UNIT",
  "MINOR_UNIT_PER_CUBIC_METRE",
  "VOLUME_MILLI_CUBIC_METRE",
  "BASIS_POINT",
  "METRE",
  "SIMULATION_SECOND",
  "MILLIMETRE",
  "DAY_OF_YEAR",
  "COUNT",
  "MICRODEGREE",
  "MINOR_UNIT_PER_CUBIC_METRE_PER_DAY",
  "BUSINESS_DAY",
  "CALENDAR_DAY",
] as const;

export type Unit = (typeof UNITS)[number];

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ProvenanceRecord {
  id: string;
  schemaVersion: number;
  displayName: string;
  active: boolean;
  sourceFile: string;
  sourceLocator: string;
  category: ProvenanceCategory;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  tunable: boolean;
  researchRequired: boolean;
  notes: string;
  applicability?: string | undefined;
}

export interface AssumptionValue {
  value: number;
  unit: Unit;
  provenanceId: string;
  currencyCode?: string;
  allowNegative?: boolean;
}

export interface ConfigEnvelope<T = unknown> {
  schemaVersion: number;
  configId: string;
  records: T[];
}

export interface LoadedBundle {
  rootDir: string;
  manifest: Record<string, unknown>;
  files: Map<string, ConfigEnvelope>;
  hash: string;
  issues: ValidationIssue[];
  provenanceEntries: ProvenanceUsage[];
  counts: Record<string, number>;
}

export interface ProvenanceUsage {
  category: ProvenanceCategory;
  provenanceId: string;
  sourceFile: string;
  sourceLocator: string;
  configFile: string;
  fieldPath: string;
  researchRequired: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warning?: string;
}
