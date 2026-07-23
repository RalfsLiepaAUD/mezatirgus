# Documentation Map

Compact index of every active document. If you're an agent, read `AGENTS.md` first, then this file, then follow the canonical reading order it gives. Everything under `docs/archive/` is historical and is intentionally **not** listed below — see its own note at the bottom.

Status legend: **AS-BUILT** (accurate description of shipped code) · **TARGET** (describes unimplemented or partially implemented future scope) · **ROADMAP** (open decisions/plan, not a system description) · **VISION** (product identity/rules, not a system description).

## Vision (`docs/vision/`)

| Doc | Purpose | Status | Priority |
|---|---|---|---|
| `DESIGN_DECISIONS.md` | Locked product rules (cash cycle, seasons, quality, buyers, auctions, contracts, object model, etc.) | VISION | **Highest** — overrides every other document on conflict |
| `CONFIRMED_PRODUCT_DIRECTION.md` | Product identity, player role, starting position, progression arc, realism scope, sources of fun | VISION | Second — elaborates DESIGN_DECISIONS, does not override it |

## Architecture (`docs/systems/`)

| Doc | Purpose | Status | Priority |
|---|---|---|---|
| `ARCHITECTURE.md` | Module/dependency boundaries, tick order, event flow, and the current object model (`Deal`/`Lot`/`Batch`/`Load`/`MeasurementAct`) matching `src/` exactly | AS-BUILT | Read before touching any subsystem |

## Systems, as-built (`docs/systems/STEP_N_*.md`)

One report per implemented subsystem, in build order. Each is accurate as of its own step; verified against `src/` during the last audit.

| Step | Doc | Subsystem |
|---|---|---|
| 2 | `STEP_2_DETERMINISTIC_CORE.md` | Clock, RNG, commands/events, persistence/replay |
| 3 | `STEP_3_COMPANY_FINANCE_AND_BOOKS.md` | Ledger, loans, credit, interest, solvency |
| 4 | `STEP_4_LATVIA_MAP_AND_LOCATIONS.md` | Location graph and routing |
| 5 | `STEP_5_DEAL_LOT_BATCH_LOAD_AND_INVENTORY.md` | Deal→Lot→Batch→Load inventory spine |
| 6 | `STEP_6_BUYERS_COMPATIBILITY_DEMAND_PRICE_CARDS_AND_MEASUREMENT.md` | Buyers, demand, price cards, measurement |
| 7 | `STEP_7_SUPPLIERS_OFFERS_DOCUMENTS_RELATIONSHIPS_AND_INTEL.md` | Suppliers, offers, relationships, intel |
| 8 | `STEP_8_HIRED_LOGISTICS_AND_PAUSED_MANUAL_DISPATCH.md` | Hired carriers, manual dispatch |
| 9 | `STEP_9_AUCTIONS_AND_FIRST_COMPETITOR.md` | Generic auction engine, first AI competitor |
| 10 | `STEP_10_FORESTS_STANDING_TIMBER_AND_HARVESTING.md` | Forest assets, harvest rights/plans/jobs |
| 11 | `STEP_11_YARD_TRUCK_EMPLOYEE_LANE.md` | Yard-as-location, owned trucks, drivers, lanes |
| 12 | `STEP_12_FRAME_AGREEMENT.md` | Frame agreements, deliveries |
| 13 | `STEP_13_PORT_EXPORT.md` | Port aggregation, charter, export settlement |
| 14 | `STEP_14_MARKETS_SEASONS_OBSERVATIONS.md` | Market regimes, seasons, causal observations |

All AS-BUILT.

## Systems, target design (`docs/systems/`)

Each states an explicit Implemented / Target / Research-required split at the top — read that block first, the rest of the document is the aspirational design.
**Priority — read these only when working on their topic area:** markets, buyers, suppliers, AI yards, relationships, procurement, sorting, or LVM.

| Doc | Purpose | Status |
|---|---|---|
| `LVM_PROCUREMENT_DESIGN.md` | LVM (state forest company) as a 3-channel supply institution | TARGET DESIGN — PARTIALLY IMPLEMENTED |
| `MILL_SUPPLIER_RELATIONSHIP_DESIGN.md` | Mill relative-supplier ranking, structured relationship state, favours, negotiation, exploit protections | TARGET DESIGN — NOT YET IMPLEMENTED |
| `PROCUREMENT_DESIGN.md` | Rich pile/opportunity/negotiation/certification procurement model | TARGET DESIGN — PARTIALLY IMPLEMENTED |
| `REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md` | Regional multi-buyer market, physical AI trader yards, strict destination choice, arbitrage, net millback | TARGET DESIGN — NOT YET IMPLEMENTED |
| `YARD_SORTING_DESIGN.md` | Yard grading/recovery-band/netback sorting economics | TARGET DESIGN — PARTIALLY IMPLEMENTED |

## Scenarios (`docs/scenarios/`)

| Doc | Purpose | Status |
|---|---|---|
| `STEP15_GOLDEN_SCENARIO.md` | The canonical connected golden scenario (`src/headless/step15.ts`, `tests/step15-scenario.test.ts`) — Phases A–G, key figures, known gaps | AS-BUILT — IMPLEMENTED AND AUDITED |

## Roadmap (`docs/roadmap/`)

| Doc | Purpose | Status |
|---|---|---|
| `DECISIONS_STILL_NEEDED.md` | Genuinely open, unresolved product/research decisions (excludes anything already locked in DESIGN_DECISIONS.md) | ROADMAP |

## Historical reference kept at its original path

`docs/design/FIRST_FULL_SKELETON_PLAN.md` — the original 15-step implementation plan. Kept at this exact path (not moved into `docs/roadmap/` or `docs/archive/`) because `reports/provenance-manifest.md` cites it by path as a provenance source for config data. Historical reference only — not current implementation authority.

## `docs/archive/` — historical, never current authority

Contains superseded plans, retired designs, and scenario predecessors: `GAME_VISION.md` (merged into `CONFIRMED_PRODUCT_DIRECTION.md`), `DEPENDENCY_GRAPH.md` and `FULL_OBJECT_MODEL.md` (merged into `ARCHITECTURE.md`), `MASTER_SYSTEM_MAP.md` (superseded by `ARCHITECTURE.md`), `OPEN_QUESTIONS.md`, `SYSTEM_REQUIREMENTS.md`, `DEVELOPMENT_PLAN.md`, `MINIMUM_VERSION_OF_EVERY_SYSTEM.md`, `PHASE_2_MILESTONE_1_WORLD_TICKS.md`, `STEP15_CANONICAL_SCENARIO.md` (pre-implementation design source, now realized — see `docs/scenarios/STEP15_GOLDEN_SCENARIO.md`), and `STEP_15_HEADLESS_SCENARIO.md` (predecessor scenario, `src/headless/scenario.ts`). Every file carries a header naming its current replacement. Do not cite anything here as describing the present state of the code.
