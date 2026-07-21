# Step 13 — Port, Export Buyer, and Sea Transport

Status: **IMPLEMENTED**. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §13.

## Domain files

- `src/exports/types.ts` — `ExportBuyer`, `ExportQuote`, `ExportOrder`, `ExportsSnapshot`
- `src/exports/domain.ts` — `ExportsDomain` reducer with all event handlers and invariants
- `src/exports/commands.ts` — Command handlers: `CreateExportBuyer`, `CreateExportQuote`, `AcceptExportQuote`, `CreateExportOrder`, `ValidateExportDocuments`, `ConfirmExportSlot`, `CompleteExportLoading`, `AcceptExportCargo`, `SettleExportOrder`, `CancelExportOrder`
- `src/exports/read-models.ts` — Defensive read models: `exportQuoteList`, `exportOrderList`, `exportTimeline`, `exportsSummary`

## Flow

1. **Export buyer** created at destination location
2. **Export quote** created from port→destination route, with rate, handling, documentation costs
3. Quote accepted → **export order** created with volume and document requirements
4. **Documents validated** — missing docs set status to MISSING (blocks further progress)
5. **Slot confirmed** — schedules loading start, departure and arrival events
6. **Loading completed** — vessel departs immediately, schedules arrival event
7. **Vessel arrives** — stale-event guard if order cancelled mid-transit
8. **Cargo accepted/rejected** — accepted volume drives revenue
9. **Order settled** — creates receivable (export revenue) and payable (port handling) through finance

## Finance integration
- `SettleExportOrder` creates both a `Receivable` (revenue) and `Payable` (handling/docs)
- Journal transactions for both revenue recognition and cost posting
- Receivable collectable through existing `RecordReceivablePayment`
- Cost layers added to inventory domain
- No direct cash mutation

## Migration
- Version 11→12 adds empty `exports` state
- Existing Steps 1–12 behaviour preserved

## Known limitations
- One route; sea rates are fixed/tunable (PH)
- Cargo threshold 30 m³ for test speed (below researched 2,000-5,000 m³)
- No containerization or multi-slot logic
- No customs authority simulation beyond document validation
- Step 14 was not started

## Version
CORE_VERSION = "0.13.0", SAVE_SCHEMA_VERSION = 12, SNAPSHOT_SCHEMA_VERSION = 12
