# Mežtirgus — Agent Instructions

This file is the entry point for any agent (or human) about to work in this
repository. Read it before touching code or docs.

## Canonical reading order

1. `AGENTS.md` (this file)
2. `docs/README.md` — compact map of every active document
3. `docs/vision/DESIGN_DECISIONS.md` — highest-authority locked product rules
4. `docs/vision/CONFIRMED_PRODUCT_DIRECTION.md` — product identity, progression, sources of fun
5. `docs/systems/ARCHITECTURE.md` — module boundaries, object model, dependency order
6. The relevant `docs/systems/STEP_N_*.md` as-built report for the system you're touching
7. The relevant target-design document (`PROCUREMENT_DESIGN.md`,
   `LVM_PROCUREMENT_DESIGN.md`, `YARD_SORTING_DESIGN.md`) when the work is
   about unimplemented or partially implemented scope

Research documents (under `docs/source/` where present) are reality anchors.
Do not invent forestry mechanics that contradict them.

## What is NOT current authority

- `docs/archive/` — historical documents (superseded plans, retired designs,
  predecessor scenarios). Never treat these as describing the current system.
- `docs/design/FIRST_FULL_SKELETON_PLAN.md` — historical reference only. Kept
  at this exact path because `reports/provenance-manifest.md` cites it by
  path; do not move or rename it.
- Anything under a generated `dist/` output — never a source of truth; the
  TypeScript sources under `src/` are authoritative.

## Project goal

Build a realistic forestry and roundwood trading simulator. The player
should feel like they are building a forestry company from scratch.

The simulation covers:

Forest resources → Harvesting → Timber assortments → Trading → Transport →
Storage → Buyers → Payments → Company growth

## Central simulation object spine

The canonical object spine, matching `src/inventory/types.ts` exactly, is:

```
Deal → Lot → Batch[] → Load[] → MeasurementAct[]
```

`Batch` (not `TimberBatch`) is the central object. Every system should
create, modify, move, store, sell, measure, or finance `Batch` objects.
Current domain names are `Deal`, `Lot`, `Batch`, `Load`, `Allocation`,
`Reservation`, `CostLayer`, and `MeasurementAct` (in `src/buyer/types.ts`).
Older documents may still say `AcquisitionLot`, `TimberBatch`, `TimberLot`,
or `MeasurementEvent` — those names are historical/stale and do not exist in
the code. If you find them in an active (non-archived) document, that is a
documentation defect; fix the document rather than the code.

## Canonical Step 15 golden scenario

The canonical, audited, deterministic golden scenario is
`src/headless/step15.ts` plus `tests/step15-scenario.test.ts`, described in
`docs/scenarios/STEP15_GOLDEN_SCENARIO.md`.

`src/headless/scenario.ts` is an older, simpler predecessor/basic smoke
scenario (`docs/archive/STEP_15_HEADLESS_SCENARIO.md`). Do not treat it as
canonical, and do not merge its description into the canonical scenario doc.

## Development philosophy

Do not build a polished small game first. Build a complete ugly simulation
skeleton. Every major department should exist in a simple form before deep
polishing.

## Realism rules

Wood is not one resource.

Species: Birch, Spruce, Pine, Aspen, Alder, Oak

Assortments: Veneer logs, Sawlogs, Pulpwood, Energy wood, Reject

Buyers are specialized. A veneer mill does not automatically buy all birch.
A pulp mill does not automatically buy veneer logs. Buyer acceptance rules
must exist.

Transport matters. Distance, trucks, payload, roads and location affect
profitability.

Cash flow matters. A profitable company can fail because money is trapped in
inventory or unpaid invoices.

## Do not start with

- beautiful maps
- AI narrator
- animations
- multiplayer
- complex UI

Build the economic relationships first.

## First milestone (historical — already achieved)

The original first-milestone sandbox (company, money, timber objects,
species, assortments, suppliers, buyers, offers, inventory, basic
transactions) is implemented. See `docs/systems/` for what now exists beyond
it.

## Numeric conventions

Money is stored as integers in minor currency units. Volume is stored as
integers in thousandths of a cubic metre (milli-m³). Never use floating-point
for money or volume — this is enforced by config/schema validation and by
convention throughout `src/`.

## Repository conventions

- Repository path: `C:\Users\vendi\mezatirgus`
- Active branch: `master`
- Node.js >= 22
- Test: `pnpm test` (runs `vitest run`); a golden-scenario-only run is
  `vitest run tests/step15-scenario.test.ts`
- Other useful scripts: `pnpm validate:config`, `pnpm report:provenance`,
  `pnpm sim:headless`, and per-system CLI demos (`pnpm buyer:demo`,
  `pnpm auction:demo`, `pnpm export:demo`, etc. — see `package.json`)
- Agents must not commit or push automatically; leave changes staged/unstaged
  for the user to review unless explicitly instructed otherwise.
