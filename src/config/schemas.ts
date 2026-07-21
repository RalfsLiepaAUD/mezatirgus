import { z } from "zod";
import { PROVENANCE_CATEGORIES, UNITS } from "./types.js";

export const idSchema = z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
export const schemaVersionSchema = z.number().int().positive();

export const baseRecordSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,
  displayName: z.string().min(1),
  active: z.boolean(),
  provenanceId: idSchema,
});

export const assumptionValueSchema = z.object({
  value: z.number().int(),
  unit: z.enum(UNITS),
  provenanceId: idSchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  allowNegative: z.boolean().optional(),
}).superRefine((entry, context) => {
  if (entry.value < 0 && entry.allowNegative !== true) context.addIssue({ code: "custom", message: "Negative value requires allowNegative=true" });
  if (entry.unit === "MINOR_UNIT" && !entry.currencyCode) context.addIssue({ code: "custom", message: "Money requires a currencyCode" });
  if (entry.unit !== "MINOR_UNIT" && entry.currencyCode) context.addIssue({ code: "custom", message: "currencyCode is only valid for MINOR_UNIT" });
  if (entry.unit === "BASIS_POINT" && (entry.value < 0 || entry.value > 10000)) context.addIssue({ code: "custom", message: "Basis points must be between 0 and 10000" });
});

export const deadlineRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("BUSINESS_DAYS"), amount: assumptionValueSchema.refine((v) => v.unit === "BUSINESS_DAY", "Business-day deadline requires BUSINESS_DAY") }),
  z.object({ kind: z.literal("CALENDAR_DAYS"), amount: assumptionValueSchema.refine((v) => v.unit === "CALENDAR_DAY", "Calendar-day deadline requires CALENDAR_DAY") }),
  z.object({ kind: z.literal("CALENDAR_SECONDS"), amount: assumptionValueSchema.refine((v) => v.unit === "SIMULATION_SECOND", "Calendar-second deadline requires SIMULATION_SECOND") }),
]);

export const provenanceRecordSchema = z.object({
  id: idSchema, schemaVersion: schemaVersionSchema, displayName: z.string().min(1), active: z.boolean(),
  sourceFile: z.string().min(1), sourceLocator: z.string().min(1), category: z.enum(PROVENANCE_CATEGORIES),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]), tunable: z.boolean(), researchRequired: z.boolean(),
  notes: z.string(), applicability: z.string().optional(),
});

const envelope = <T extends z.ZodTypeAny>(record: T) => z.object({ schemaVersion: schemaVersionSchema, configId: idSchema, records: z.array(record) });

export const manifestSchema = z.object({
  schemaVersion: schemaVersionSchema, configId: idSchema, bundleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  canonicalTimeUnit: z.literal("SIMULATION_SECOND"), configurationFiles: z.array(z.string().regex(/\.json$/)).min(1),
  provenance: z.array(provenanceRecordSchema).min(1),
});

export const speciesFileSchema = envelope(baseRecordSchema.extend({ code: z.string().regex(/^[a-z_]+$/) }));
export const assortmentFileSchema = envelope(baseRecordSchema.extend({ code: z.string().regex(/^[a-z_]+$/), compatibleSpeciesIds: z.array(idSchema).min(1) }));

const qualityRecordSchema = z.discriminatedUnion("kind", [
  baseRecordSchema.extend({ kind: z.literal("grade"), speciesId: idSchema, code: z.string().min(1) }),
  baseRecordSchema.extend({ kind: z.literal("diameter_bracket"), code: z.string().min(1), minDiameter: assumptionValueSchema, maxDiameter: assumptionValueSchema.nullable() }),
  baseRecordSchema.extend({ kind: z.literal("tara_entry_reason"), code: z.enum(["under_diameter", "poor_form"]) }),
  baseRecordSchema.extend({ kind: z.literal("certainty_state"), code: z.enum(["unknown", "seller_claimed", "estimated", "inspected", "sorted", "measured"]) }),
  baseRecordSchema.extend({ kind: z.literal("composition_profile"), speciesId: idSchema, proportions: z.array(z.object({ qualityGradeId: idSchema, proportion: assumptionValueSchema })).min(1) }),
]);
export const qualityFileSchema = envelope(qualityRecordSchema);

export const locationFileSchema = envelope(baseRecordSchema.extend({
  coordinateType: z.enum(["LATITUDE_LONGITUDE", "SCHEMATIC"]), latitudeE6: assumptionValueSchema.optional(), longitudeE6: assumptionValueSchema.optional(),
  schematicX: assumptionValueSchema.optional(), schematicY: assumptionValueSchema.optional(), countryCode: z.string().regex(/^[A-Z]{2}$/),
  regionCode: z.enum(["RIGA", "VIDZEME", "ZEMGALE", "KURZEME", "LATGALE", "EXTERNAL_EUROPE"]),
  roles: z.array(z.enum(["CITY", "REGIONAL_NODE", "ROADSIDE_SUPPLY", "YARD", "BUYER", "PORT", "EXTERNAL_DESTINATION"])).min(1),
}).superRefine((record, context) => {
  if (record.coordinateType === "LATITUDE_LONGITUDE" && !(record.latitudeE6 && record.longitudeE6)) context.addIssue({ code: "custom", message: "Latitude/longitude coordinates required" });
  if (record.coordinateType === "SCHEMATIC" && !(record.schematicX && record.schematicY)) context.addIssue({ code: "custom", message: "Schematic coordinates required" });
}));

const compatibilitySchema = z.object({ speciesId: idSchema, assortmentId: idSchema, accepted: z.boolean(), provenanceId: idSchema });
export const buyerFileSchema = envelope(baseRecordSchema.extend({
  fictional: z.literal(true), locationId: idSchema, buyerType: z.enum(["BIRCH_VENEER", "CONIFER_SAWMILL", "PULPWOOD", "ENERGY"]),
  compatibility: z.array(compatibilitySchema).min(1), behaviorNotes: z.array(z.string()),
}));

export const supplierFileSchema = envelope(baseRecordSchema.extend({
  fictional: z.literal(true), locationId: idSchema,
  archetype: z.enum(["PRIVATE_FOREST_OWNER", "SMALL_HARVESTING_CREW", "REGIONAL_TIMBER_TRADER"]),
  channels: z.array(z.enum(["PRIVATE_ROADSIDE_OFFER", "RECURRING_CONTACT", "PREPARED_ROUNDWOOD_AUCTION", "TRADER_SPOT"])).min(1),
  suppliedSpeciesIds: z.array(idSchema).min(1), suppliedAssortmentIds: z.array(idSchema).min(1),
  paymentExpectation: deadlineRuleSchema, documentReliability: assumptionValueSchema, initialRelationship: assumptionValueSchema,
}));

export const transportFileSchema = envelope(baseRecordSchema.extend({
  tier: z.enum(["EFFICIENT_CONTRACTED_OR_OWN_FLEET", "SMALL_TRADER_SPOT"]), baseRate: assumptionValueSchema,
  representativeDistance: assumptionValueSchema, isEarlyPlayerDefault: z.boolean(),
}));
export const seasonFileSchema = envelope(baseRecordSchema.extend({
  startDay: assumptionValueSchema, endDay: assumptionValueSchema,
  behaviorCode: z.enum(["WINTER_SUPPLY", "SPRING_THAW", "SUMMER_DEGRADATION", "AUTUMN_ACCESS"]),
  modifiers: z.array(z.object({ code: z.string().regex(/^[A-Z_]+$/), proportion: assumptionValueSchema })).min(1),
}));

export const auctionFileSchema = envelope(baseRecordSchema.extend({
  parameter: z.enum(["DEPOSIT", "BID_INCREMENT", "LATE_BID_EXTENSION", "PAYMENT_DEADLINE", "REMOVAL_DEADLINE", "NON_REMOVAL_PENALTY", "VOLUME_TOLERANCE", "TITLE_RISK_TRANSFER", "PUBLIC_RESULTS"]),
  value: z.union([assumptionValueSchema, z.array(assumptionValueSchema).min(1), deadlineRuleSchema, z.string(), z.boolean()]), valueProvenanceId: idSchema,
}));

const financeRecordSchema = z.discriminatedUnion("parameter", [
  baseRecordSchema.extend({ parameter: z.literal("STARTING_CASH"), difficulty: z.enum(["EASY", "NORMAL", "HARD"]), amount: assumptionValueSchema }),
  baseRecordSchema.extend({ parameter: z.literal("LOAN_PRODUCT"), principal: assumptionValueSchema, annualRate: assumptionValueSchema, term: deadlineRuleSchema }),
  baseRecordSchema.extend({ parameter: z.literal("REVOLVING_CREDIT"), creditLimit: assumptionValueSchema, annualRate: assumptionValueSchema }),
  baseRecordSchema.extend({ parameter: z.literal("INSTANT_PAYMENT_DISCOUNT"), discountRate: assumptionValueSchema }),
  baseRecordSchema.extend({ parameter: z.literal("BUYER_PAYMENT_TERMS"), minimum: deadlineRuleSchema, maximum: deadlineRuleSchema }),
  baseRecordSchema.extend({ parameter: z.literal("SUPPLIER_PAYMENT_EXPECTATION"), minimum: deadlineRuleSchema, maximum: deadlineRuleSchema }),
  baseRecordSchema.extend({ parameter: z.literal("DOMESTIC_B2B_TIMBER_VAT"), treatment: z.literal("NO_VAT_CASH_MOVEMENT"), treatmentProvenanceId: idSchema }),
]);
export const financeFileSchema = envelope(financeRecordSchema);

export const marketFileSchema = envelope(baseRecordSchema.extend({ speciesId: idSchema, assortmentId: idSchema, referenceRate: assumptionValueSchema }));
export const forestFileSchema = envelope(baseRecordSchema.extend({
  fictional: z.literal(true), locationId: idSchema, estimatedVolume: assumptionValueSchema,
  speciesComposition: z.array(z.object({ speciesId: idSchema, proportion: assumptionValueSchema })).min(1),
  regenerationState: z.enum(["NOT_HARVESTED", "AWAITING_REFORESTATION", "REGENERATING"]),
}));
export const portFileSchema = envelope(baseRecordSchema.extend({ fictional: z.literal(true), locationId: idSchema, capacity: assumptionValueSchema }));
export const scenarioFileSchema = envelope(baseRecordSchema.extend({
  playerCompanyDisplayName: z.string().min(1), startingLocationId: idSchema, buyerIds: z.array(idSchema).min(1), supplierIds: z.array(idSchema).min(1),
  forestIds: z.array(idSchema), portIds: z.array(idSchema), externalDestinationLocationIds: z.array(idSchema).min(1),
}));

export const fileSchemas: Record<string, z.ZodTypeAny> = {
  "species.json": speciesFileSchema, "assortments.json": assortmentFileSchema, "quality.json": qualityFileSchema,
  "locations.json": locationFileSchema, "buyers.json": buyerFileSchema, "suppliers.json": supplierFileSchema,
  "transport.json": transportFileSchema, "seasons.json": seasonFileSchema, "auctions.json": auctionFileSchema,
  "finance.json": financeFileSchema, "markets.json": marketFileSchema, "forests.json": forestFileSchema,
  "ports.json": portFileSchema, "scenario_first_full.json": scenarioFileSchema,
};