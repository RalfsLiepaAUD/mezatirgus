# Mežtirgus

Mežtirgus ("forest market" in Latvian) is a realistic, pausable forestry and
roundwood-trading company simulator. The player starts as a tiny Latvian
timber trader and grows into an integrated forestry, logistics, storage,
trading, and export business — managing narrow margins, imperfect
information, physical timber, and the cash conversion cycle.

The simulation core is deterministic, headless-runnable, and UI-independent:
every economic outcome is driven by seeded RNG and versioned configuration
data, never hardcoded or random-without-cause.

## Current project status

The first full connected skeleton (Steps 1–15) is implemented:

- deterministic core: clock, RNG, commands, events, persistence/replay
- company finance: ledger, loans, credit, interest, solvency
- Latvia location graph and routing
- deal → lot → batch → load inventory spine with cost layers
- buyers, compatibility, demand, price cards, and measurement
- suppliers, offers, documents, relationships, and intel
- hired logistics and paused manual dispatch
- auctions and a first AI competitor
- forests, standing timber, and harvesting
- yards, owned trucks, employees, and recurring lanes
- frame agreements
- port export (charter quotes, documents, settlement)
- markets, seasons, and regime change
- a connected golden scenario and headless balance runner

This is a deliberately ugly, connected skeleton — not a balanced or polished
game. See `docs/roadmap/DECISIONS_STILL_NEEDED.md` for what's still open.

## Implemented systems

Each system below has an as-built design report in `docs/systems/`:

| System | Doc |
|---|---|
| Deterministic core | `docs/systems/STEP_2_DETERMINISTIC_CORE.md` |
| Company finance and books | `docs/systems/STEP_3_COMPANY_FINANCE_AND_BOOKS.md` |
| Latvia map and locations | `docs/systems/STEP_4_LATVIA_MAP_AND_LOCATIONS.md` |
| Deal/lot/batch/load inventory | `docs/systems/STEP_5_DEAL_LOT_BATCH_LOAD_AND_INVENTORY.md` |
| Buyers, demand, price cards | `docs/systems/STEP_6_BUYERS_COMPATIBILITY_DEMAND_PRICE_CARDS_AND_MEASUREMENT.md` |
| Suppliers, offers, relationships | `docs/systems/STEP_7_SUPPLIERS_OFFERS_DOCUMENTS_RELATIONSHIPS_AND_INTEL.md` |
| Hired logistics, dispatch | `docs/systems/STEP_8_HIRED_LOGISTICS_AND_PAUSED_MANUAL_DISPATCH.md` |
| Auctions and competitor | `docs/systems/STEP_9_AUCTIONS_AND_FIRST_COMPETITOR.md` |
| Forests and harvesting | `docs/systems/STEP_10_FORESTS_STANDING_TIMBER_AND_HARVESTING.md` |
| Yard, truck, employee, lane | `docs/systems/STEP_11_YARD_TRUCK_EMPLOYEE_LANE.md` |
| Frame agreements | `docs/systems/STEP_12_FRAME_AGREEMENT.md` |
| Port and export | `docs/systems/STEP_13_PORT_EXPORT.md` |
| Markets, seasons, observations | `docs/systems/STEP_14_MARKETS_SEASONS_OBSERVATIONS.md` |

Target designs not yet fully implemented live alongside them:
`docs/systems/PROCUREMENT_DESIGN.md`, `docs/systems/LVM_PROCUREMENT_DESIGN.md`,
`docs/systems/YARD_SORTING_DESIGN.md` — each states what's implemented today
versus what's still target/research-required.

## Canonical golden scenario

The canonical, audited, deterministic end-to-end scenario is:

- `src/headless/step15.ts` (implementation)
- `tests/step15-scenario.test.ts` (assertions)
- `docs/scenarios/STEP15_GOLDEN_SCENARIO.md` (description)

`src/headless/scenario.ts` is an older, simpler predecessor scenario kept for
reference; it is not the canonical scenario. See
`docs/archive/STEP_15_HEADLESS_SCENARIO.md`.

## Repository setup

Requires Node.js >= 22.

```
pnpm install
pnpm build
```

## Test commands

```
pnpm test              # vitest run — full test suite
pnpm sim:headless       # canonical headless runner (older predecessor scenario)
pnpm validate:config    # validate data/*.json configuration bundle
pnpm report:provenance  # regenerate reports/provenance-manifest.md
```

Most systems also have a human-readable CLI demo, e.g. `pnpm finance:demo`,
`pnpm buyer:demo`, `pnpm auction:demo`, `pnpm export:demo` — see `package.json`
for the full list.

## Documentation entry point

- Agents (or anyone doing implementation work): start at `AGENTS.md`.
- Humans looking for a specific document: start at `docs/README.md`, a
  compact map of every active document with its status and purpose.

**`docs/archive/` and `docs/design/FIRST_FULL_SKELETON_PLAN.md` are
historical.** They record real design/implementation history but are not
current authority — do not treat anything in `docs/archive/` as describing
the present state of the code.

## Branch convention

`master` is the active development branch.
