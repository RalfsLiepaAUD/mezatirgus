import { z } from "zod";
import { fileSchemas, manifestSchema } from "./schemas.js";
import type { ConfigEnvelope, ProvenanceRecord, ProvenanceUsage, ValidationIssue } from "./types.js";

const REQUIRED_FILES = ["species.json", "assortments.json", "quality.json", "locations.json", "buyers.json", "suppliers.json", "transport.json", "seasons.json", "auctions.json", "finance.json", "markets.json", "forests.json", "ports.json", "scenario_first_full.json"];
const REQUIRED_REGIONS = ["RIGA", "VIDZEME", "ZEMGALE", "KURZEME", "LATGALE", "EXTERNAL_EUROPE"];
const REQUIRED_LOCATION_ROLES = ["ROADSIDE_SUPPLY", "YARD", "BUYER", "PORT", "EXTERNAL_DESTINATION"];
const REQUIRED_SUPPLIERS = ["PRIVATE_FOREST_OWNER", "SMALL_HARVESTING_CREW", "REGIONAL_TIMBER_TRADER"];
const REQUIRED_FINANCE = ["STARTING_CASH", "LOAN_PRODUCT", "REVOLVING_CREDIT", "INSTANT_PAYMENT_DISCOUNT", "BUYER_PAYMENT_TERMS", "SUPPLIER_PAYMENT_EXPECTATION", "DOMESTIC_B2B_TIMBER_VAT"];
const REAL_COMPANY_NAMES = ["latvijas finieris", "stiga", "vika wood", "pata", "bono", "aca timber", "laskana", "södra", "lvm"];

function issue(path: string, message: string, severity: "error" | "warning" = "error"): ValidationIssue { return { path, message, severity }; }
function collectProvenance(value: unknown, path: string, output: Array<{ path: string; provenanceId: string }>): void {
  if (Array.isArray(value)) { value.forEach((child, index) => collectProvenance(child, `${path}[${index}]`, output)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if ((key === "provenanceId" || key === "valueProvenanceId" || key === "treatmentProvenanceId") && typeof child === "string") output.push({ path: childPath, provenanceId: child });
    else collectProvenance(child, childPath, output);
  }
}
function zodIssues(error: z.ZodError, file: string): ValidationIssue[] { return error.issues.map((entry) => issue([file, ...entry.path.map(String)].join("."), entry.message)); }

export interface ValidatedData { manifest: z.infer<typeof manifestSchema>; files: Map<string, ConfigEnvelope>; issues: ValidationIssue[]; provenanceEntries: ProvenanceUsage[]; counts: Record<string, number>; }

export function validateRawBundle(rawManifest: unknown, rawFiles: Map<string, unknown>): ValidatedData {
  const issues: ValidationIssue[] = [];
  const parsedManifest = manifestSchema.safeParse(rawManifest);
  if (!parsedManifest.success) return { manifest: rawManifest as z.infer<typeof manifestSchema>, files: new Map(), issues: zodIssues(parsedManifest.error, "manifest.json"), provenanceEntries: [], counts: {} };
  const manifest = parsedManifest.data;
  for (const file of REQUIRED_FILES) if (!manifest.configurationFiles.includes(file)) issues.push(issue("manifest.json.configurationFiles", `Required configuration file missing from manifest: ${file}`));

  const provenanceById = new Map<string, ProvenanceRecord>();
  manifest.provenance.forEach((provenance, index) => {
    if (provenanceById.has(provenance.id)) issues.push(issue(`manifest.json.provenance[${index}].id`, `Duplicate ID: ${provenance.id}`));
    provenanceById.set(provenance.id, provenance);
    if (provenance.category === "VERIFIED" && (!provenance.sourceFile.trim() || !provenance.sourceLocator.trim())) issues.push(issue(`manifest.json.provenance[${index}]`, "VERIFIED provenance requires source file and locator"));
    if (provenance.category === "PLACEHOLDER" && !provenance.tunable) issues.push(issue(`manifest.json.provenance[${index}]`, "PLACEHOLDER provenance must be tunable"));
    if (provenance.category === "ASSUMED" && (!provenance.tunable || !provenance.researchRequired)) issues.push(issue(`manifest.json.provenance[${index}]`, "ASSUMED provenance must be tunable and research-required"));
    if (provenance.category === "UNCERTAIN" && !provenance.researchRequired) issues.push(issue(`manifest.json.provenance[${index}]`, "UNCERTAIN provenance must be research-required"));
  });

  const files = new Map<string, ConfigEnvelope>();
  const allIds = new Map<string, string>();
  for (const fileName of manifest.configurationFiles) {
    const raw = rawFiles.get(fileName);
    if (raw === undefined) { issues.push(issue(fileName, "Configuration file listed in manifest is missing")); continue; }
    const schema = fileSchemas[fileName];
    if (!schema) { issues.push(issue(fileName, "No schema registered for configuration file")); continue; }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) { issues.push(...zodIssues(parsed.error, fileName)); continue; }
    const env = parsed.data as ConfigEnvelope<Record<string, unknown>>; files.set(fileName, env);
    env.records.forEach((record, index) => {
      const id = record.id as string; const prior = allIds.get(id);
      if (prior) issues.push(issue(`${fileName}.records[${index}].id`, `Duplicate ID ${id}; first seen at ${prior}`)); else allIds.set(id, `${fileName}.records[${index}]`);
    });
  }

  const idSets = new Map([...files].map(([file, env]) => [file, new Set(env.records.map((r) => (r as { id: string }).id))]));
  const requireRef = (file: string, path: string, target: string, id: string) => { if (!(idSets.get(target)?.has(id) ?? false)) issues.push(issue(`${file}.${path}`, `Missing referenced ID ${id} in ${target}`)); };
  const assumptions: Array<{ file: string; path: string; provenanceId: string }> = [];
  for (const [file, env] of files) { const found: Array<{ path: string; provenanceId: string }> = []; collectProvenance(env, "", found); found.forEach((entry) => assumptions.push({ file, ...entry })); }
  assumptions.forEach((entry) => { if (!provenanceById.has(entry.provenanceId)) issues.push(issue(`${entry.file}.${entry.path}`, `Missing provenance: ${entry.provenanceId}`)); });

  const assortments = files.get("assortments.json")?.records as Array<{ id: string; compatibleSpeciesIds: string[] }> | undefined;
  const assortmentById = new Map(assortments?.map((x) => [x.id, x]) ?? []);
  assortments?.forEach((x, i) => x.compatibleSpeciesIds.forEach((id, j) => requireRef("assortments.json", `records[${i}].compatibleSpeciesIds[${j}]`, "species.json", id)));
  const quality = files.get("quality.json")?.records as Array<any> | undefined;
  quality?.forEach((x, i) => { if (x.speciesId) requireRef("quality.json", `records[${i}].speciesId`, "species.json", x.speciesId); if (x.kind === "composition_profile") { const total = x.proportions.reduce((s: number, p: any) => s + p.proportion.value, 0); if (total !== 10000) issues.push(issue(`quality.json.records[${i}].proportions`, `Required proportions total 10000 basis points; received ${total}`)); x.proportions.forEach((p: any, j: number) => requireRef("quality.json", `records[${i}].proportions[${j}].qualityGradeId`, "quality.json", p.qualityGradeId)); } });

  const locations = files.get("locations.json")?.records as Array<any> | undefined;
  const regions = new Set(locations?.map((x) => x.regionCode)); const roles = new Set(locations?.flatMap((x) => x.roles));
  REQUIRED_REGIONS.forEach((x) => { if (!regions.has(x)) issues.push(issue("locations.json", `Required region not represented: ${x}`)); });
  REQUIRED_LOCATION_ROLES.forEach((x) => { if (!roles.has(x)) issues.push(issue("locations.json", `Required location role not represented: ${x}`)); });

  const buyers = files.get("buyers.json")?.records as Array<any> | undefined;
  buyers?.forEach((buyer, i) => { requireRef("buyers.json", `records[${i}].locationId`, "locations.json", buyer.locationId); const real = REAL_COMPANY_NAMES.find((n) => [buyer.displayName, ...buyer.behaviorNotes].join(" ").toLowerCase().includes(n)); if (real) issues.push(issue(`buyers.json.records[${i}]`, `Real-company behavioral allegation/reference is forbidden: ${real}`)); buyer.compatibility.forEach((c: any, j: number) => { requireRef("buyers.json", `records[${i}].compatibility[${j}].speciesId`, "species.json", c.speciesId); requireRef("buyers.json", `records[${i}].compatibility[${j}].assortmentId`, "assortments.json", c.assortmentId); const a = assortmentById.get(c.assortmentId); if (a && !a.compatibleSpeciesIds.includes(c.speciesId)) issues.push(issue(`buyers.json.records[${i}].compatibility[${j}]`, `Incompatible species/assortment pair: ${c.speciesId} + ${c.assortmentId}`)); }); });
  if (buyers?.length && assortments?.length && buyers.every((b) => assortments.every((a) => b.compatibility.some((c: any) => c.assortmentId === a.id && c.accepted)))) issues.push(issue("buyers.json", "Every buyer accepting every assortment is forbidden; buyers must be specialized"));

  const suppliers = files.get("suppliers.json")?.records as Array<any> | undefined;
  suppliers?.forEach((s, i) => { requireRef("suppliers.json", `records[${i}].locationId`, "locations.json", s.locationId); s.suppliedSpeciesIds.forEach((id: string, j: number) => requireRef("suppliers.json", `records[${i}].suppliedSpeciesIds[${j}]`, "species.json", id)); s.suppliedAssortmentIds.forEach((id: string, j: number) => requireRef("suppliers.json", `records[${i}].suppliedAssortmentIds[${j}]`, "assortments.json", id)); });
  const archetypes = new Set(suppliers?.map((s) => s.archetype)); REQUIRED_SUPPLIERS.forEach((x) => { if (!archetypes.has(x)) issues.push(issue("suppliers.json", `Required supplier archetype missing: ${x}`)); });
  if (suppliers && new Set(suppliers.map((s) => JSON.stringify([s.channels, s.suppliedSpeciesIds, s.suppliedAssortmentIds, s.paymentExpectation, s.documentReliability.value, s.initialRelationship.value]))).size !== suppliers.length) issues.push(issue("suppliers.json", "Supplier archetypes must have distinct commercial profiles"));

  const markets = files.get("markets.json")?.records as Array<any> | undefined;
  markets?.forEach((m, i) => { requireRef("markets.json", `records[${i}].speciesId`, "species.json", m.speciesId); requireRef("markets.json", `records[${i}].assortmentId`, "assortments.json", m.assortmentId); if (assortmentById.get(m.assortmentId) && !assortmentById.get(m.assortmentId)!.compatibleSpeciesIds.includes(m.speciesId)) issues.push(issue(`markets.json.records[${i}]`, "Market uses incompatible species/assortment")); });
  const forests = files.get("forests.json")?.records as Array<any> | undefined;
  forests?.forEach((f, i) => { requireRef("forests.json", `records[${i}].locationId`, "locations.json", f.locationId); const total = f.speciesComposition.reduce((s: number, p: any) => s + p.proportion.value, 0); if (total !== 10000) issues.push(issue(`forests.json.records[${i}].speciesComposition`, `Required proportions total 10000 basis points; received ${total}`)); f.speciesComposition.forEach((p: any, j: number) => requireRef("forests.json", `records[${i}].speciesComposition[${j}].speciesId`, "species.json", p.speciesId)); });
  (files.get("ports.json")?.records as Array<any> | undefined)?.forEach((p, i) => requireRef("ports.json", `records[${i}].locationId`, "locations.json", p.locationId));

  const auctions = files.get("auctions.json")?.records as Array<any> | undefined;
  const payment = auctions?.find((x) => x.parameter === "PAYMENT_DEADLINE"); if (payment && payment.value.kind !== "BUSINESS_DAYS") issues.push(issue("auctions.json", "Auction payment deadline must preserve business-day semantics"));
  const finance = files.get("finance.json")?.records as Array<any> | undefined; const financeKinds = new Set(finance?.map((x) => x.parameter)); REQUIRED_FINANCE.forEach((x) => { if (!financeKinds.has(x)) issues.push(issue("finance.json", `Required finance concept missing: ${x}`)); });
  const difficulties = new Set(finance?.filter((x) => x.parameter === "STARTING_CASH").map((x) => x.difficulty)); ["EASY", "NORMAL", "HARD"].forEach((x) => { if (!difficulties.has(x)) issues.push(issue("finance.json", `Starting cash missing difficulty: ${x}`)); });

  const scenarios = files.get("scenario_first_full.json")?.records as Array<any> | undefined;
  scenarios?.forEach((s, i) => { requireRef("scenario_first_full.json", `records[${i}].startingLocationId`, "locations.json", s.startingLocationId); s.buyerIds.forEach((id: string, j: number) => requireRef("scenario_first_full.json", `records[${i}].buyerIds[${j}]`, "buyers.json", id)); s.supplierIds.forEach((id: string, j: number) => requireRef("scenario_first_full.json", `records[${i}].supplierIds[${j}]`, "suppliers.json", id)); s.forestIds.forEach((id: string, j: number) => requireRef("scenario_first_full.json", `records[${i}].forestIds[${j}]`, "forests.json", id)); s.portIds.forEach((id: string, j: number) => requireRef("scenario_first_full.json", `records[${i}].portIds[${j}]`, "ports.json", id)); s.externalDestinationLocationIds.forEach((id: string, j: number) => requireRef("scenario_first_full.json", `records[${i}].externalDestinationLocationIds[${j}]`, "locations.json", id)); });

  const provenanceEntries: ProvenanceUsage[] = assumptions.flatMap((a) => { const p = provenanceById.get(a.provenanceId); if (!p) return []; const warning = p.confidence === "LOW" || ["PLACEHOLDER", "UNCERTAIN", "ASSUMED"].includes(p.category) ? "Weak or missing evidence; do not present as researched fact" : undefined; return [{ category: p.category, provenanceId: p.id, sourceFile: p.sourceFile, sourceLocator: p.sourceLocator, configFile: a.file, fieldPath: a.path, researchRequired: p.researchRequired, confidence: p.confidence, ...(warning ? { warning } : {}) }]; });
  const counts = Object.fromEntries([...files].map(([name, env]) => [name, env.records.length]));
  if (!(files.get("species.json")?.records.length)) issues.push(issue("species.json", "Generic wood is forbidden; at least one species is required"));
  if (!(files.get("assortments.json")?.records.length)) issues.push(issue("assortments.json", "Generic wood is forbidden; at least one assortment is required"));
  return { manifest, files, issues, provenanceEntries, counts };
}