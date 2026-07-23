# Step 15 — Canonical Golden Scenario

Status: IMPLEMENTED AND AUDITED

## Canonical source

- Implementation: `src/headless/step15.ts` (`createStep15Engine`, `runStep15`) — this is the canonical golden scenario.
- Tests: `tests/step15-scenario.test.ts` — 8 phase/assertion cases (Phases A–G plus payload/aging/reconciliation checks), a determinism case (two same-seed runs produce identical `stateChecksum()`/`eventLogChecksum()`), a save/reload continuity case (save at Phase D, reload, continue ≡ uninterrupted run), and a supplementary autonomous-scheduler proof.
- This document supersedes `docs/design/STEP15_CANONICAL_SCENARIO.md` v3, now archived at `docs/archive/STEP15_CANONICAL_SCENARIO.md`.
- The older, simpler run — `src/headless/scenario.ts`, formerly documented at `docs/design/STEP_15_HEADLESS_SCENARIO.md`, now archived at `docs/archive/STEP_15_HEADLESS_SCENARIO.md` — is a historical predecessor / basic smoke scenario. It remains wired to `package.json`'s `sim:headless` and `scenario:demo` scripts today, but it is **not** the canonical golden scenario.

## What this proves

One continuous, deterministic, seeded multi-day run exercising every major subsystem through real commands only (no injected state or bypassed validation): shared finite procurement between two independent companies, a prepared-roundwood auction against a real cash-constrained competitor, standing-timber harvest with per-species batch conservation, hired and owned transport with distinct cost postings, yard sorting with exact recovered/loss volume, buyer measurement with honest grading and grade-based rejection, a frame-agreement delivery with receivable aging, two independently-proven market causal chains, port aggregation and charter export, and full financial/volume reconciliation with zero VAT postings.

## Phases as implemented

**Phase A — Shared finite procurement** (`phaseA`): two suppliers each post a fixture pile; PLAYER and COMP_1 (a real second company with its own cash and ledger, not a scripted illusion) both see both offers through the real public-offer pipeline. PLAYER accepts P1 (40.000 m³), COMP_1 accepts P2. A late attempt by PLAYER to accept the already-taken offer is rejected atomically (`INVALID_OFFER_ACCEPTANCE`, audit fingerprint unchanged). COMP_1's cash decreases from its own ledger.

**Phase B — Auction and standing-timber harvest** (`phaseB`): a prepared-roundwood auction for a 58.000 m³ birch lot runs on real bids; COMP_1 ladders to 8,500 mu/m³ and is separately proven to be rejected when it bids beyond its own cash; PLAYER wins at 8,600 mu/m³, minting batch B2. In parallel, a standing-timber harvest right, plan, and completion mint separate per-species batches (birch, spruce) at roadside, with conservation between removed, realized, and residue-loss volume.

**Phase C — Hired + owned transport, yard sorting** (`phaseC`): B1 moves to the mill via a hired carrier (cost posts as `TRANSPORT_PLACEHOLDER`); B2 moves to the yard via an owned truck + driver (cost posts as `OPERATIONAL`, provenance `STEP_11_OPERATIONS_RULES`) — the two cost paths are asserted distinct. A sort attempt against a batch not physically at the yard is rejected atomically. B2 (58.000) is then sorted into three children — 30.000 (band A), 6.000 (band B_PLUS), 20.500 (band TARA_14_18) — plus 1.500 recorded loss, exact conservation.

**Phase D — Domestic sale, measurement, contract, aging** (`phaseD`): the mill buyer publishes three flat-rate, assortment-specific price cards and an active frame agreement (committed 60,000 milli-m³ veneer birch, fixed 10,000 mu/m³, 10-day payment term). One load is measured with honest grading, isolating and rejecting brāķis via `gradeAllocations` (never priced). A second load (30.000 m³) is delivered **under the frame agreement** as a single `RecordAgreementDelivery` → `AcceptAgreementDelivery` → `SettleAgreementDelivery` cycle, producing a receivable that is observed through `NOT_DUE` → `DUE` → `PAID` aging states. A third load (6.000 m³) is a separate spot sale against the sawlog card. The original acquisition estimate is confirmed unmutated by measurement.

**Phase E — Market causality** (`phaseE`): two independent cause→effect pairs are proven purely through event payload references, not assumed ordering: a market-driver update's event ID appears in every resulting `BuyerPriceCardPublished` event's `breakdown.causeEventIds`, and a regime transition's event ID appears in every resulting `BuyerDemandChanged` event's `regimeEventId`.

**Phase F — Port, charter, export** (`phaseF`): the sorted tara batch and both harvested species batches move by real transport to the port, aggregate there, and export under a charter quote; settlement depletes exactly the shipped batch IDs and recomputes value from quote terms times loaded volume — exact.

**Phase G — Settlement, reconciliation, terminal state** (`phaseG`): all payables settle, all receivables are paid, volume conservation holds end-to-end, closing cash for both companies is independently folded from ledger history and matches the finance read-model exactly, and zero VAT ledger entries exist anywhere in the run. The auction-lot profit/loss is reconstructed test-side from real cost layers and revenue journals, because the engine does not expose a single packaged "deal P&L" read-model for auction lots.

## Key verified figures (from `tests/step15-scenario.test.ts`)

- Auction settlement (acquisition cost of the won lot): 498,800 mu
- Owned haul cost (auction lot → yard): 16,000 mu
- Sorting cost (auction lot): 174,000 mu
- Port haul cost (tara child batch): 27,200 mu; export handling allocated to it: 17,202 mu
- Export revenue: tara child = 133,250 mu; combined harvested species batches = 331,500 mu
- **Final reconstructed auction-lot P&L: −224,052 mu** — asserted exactly (`expect(t.values.b2PnL).toBe(-224_052)`). The winning bid plus downstream haul, sorting, port, and handling costs exceed the blended domestic/export revenue the sorted children actually realized. This is a real outcome of the scenario's fixed fixture values, not a target or a bug.
- **Final canonical deterministic day: Day 31** — the confirmed final simulated game-time day reached once Phase G's reconciliation completes in the current implementation.
- Two same-seed runs produce identical `stateChecksum()` and `eventLogChecksum()`; a save taken mid-run (Phase D) and reloaded is state-identical to an uninterrupted run.

## Known nonblocking gap

The frame agreement is exercised with exactly **one** delivery (30,000 of its 60,000 milli-m³ commitment) in this canonical run. Its behavior across a second delivery cycle, a tolerance-boundary breach, or multi-period renewal is not exercised here. This is a known, nonblocking coverage gap for a future scenario extension — it does not weaken what Phase D actually proves (single-delivery accept/settle/aging is fully asserted).

## Cross-domain invariants proven

No duplicate receivables, payables, or cost layers; volume conserved across every split, move, sort, and depletion; every journal transaction balanced; ownership, custody, and location tracked on every batch and load; all RNG draws use named streams; Phase G's reconciliation consumes no RNG.

## Running it

The canonical scenario is exercised via the test suite: `pnpm test` (or `vitest run tests/step15-scenario.test.ts`). It is not yet wired to a dedicated CLI/package.json script — `sim:headless` and `scenario:demo` still point at the older predecessor (`src/headless/scenario.ts`, see `docs/archive/STEP_15_HEADLESS_SCENARIO.md`). Wiring a canonical CLI entry point is a reasonable follow-up but is out of scope for this document.
