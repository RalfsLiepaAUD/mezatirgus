Status: HISTORICAL PREDECESSOR
Current canonical golden scenario:
docs/scenarios/STEP15_GOLDEN_SCENARIO.md

This document describes `src/headless/scenario.ts` — a simpler, earlier connected
scenario that predates the canonical Step 15 golden scenario. It is not current
implementation authority for "the" Step 15 scenario. `src/headless/scenario.ts`
itself is unchanged and still wired to `package.json`'s `sim:headless` /
`scenario:demo` scripts as a lightweight smoke run, but the canonical, audited
golden scenario is `src/headless/step15.ts` (see
`docs/scenarios/STEP15_GOLDEN_SCENARIO.md`).

---

# Step 15 — Connected Golden Scenario and Headless Balance Runner

Status: **IMPLEMENTED**. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §15.

## Domain files

- `src/headless/scenario.ts` — `createEngine`, `runCanonicalScenario`, `ScenarioResult`
- `src/cli/scenario-demo.ts` — Human-readable scenario demo
- `src/cli/headless-runner.ts` — Machine-readable headless runner with seed/config/runs support

## Canonical scenario flow

1. **Company setup** — company, opening balance (€100k), 5 locations, 4 route edges
2. **Supplier → deal** — supplier created, offer accepted → deal/lot/batch/payable
3. **Carrier transport** — hired carrier transports batch to yard
4. **Yard sorting** — batch sorted (certainty → SORTED), cost recorded
5. **Buyer + frame agreement** — buyer with price card, active frame agreement
6. **Market** — market created with export+domestic drivers, observation recorded
7. **Owned dispatch + lane** — truck+driver created, dispatch through lane to buyer
8. **Buyer measurement** — load submitted to buyer → measurement → receivable
9. **Export** — export buyer, quote, order, documents, slot, loading, sea transit, settlement
10. **Market regime change** — REGIME→BOOM, driver updated, season advanced to AUTUMN
11. **Finance settlement** — export receivable collected, ledger reconciled

## Headless runner (`pnpm sim:headless`)

### Inputs
- `--seed` — base seed string (default: `headless-default`)
- `--runs` — number of runs (default: 1); multiple runs append `-N` to seed
- `--debug` — set to `true` to expose invariant failure details

### Output (JSON)
```json
{
  "configurationHash": "scenario-v1",
  "runCount": 3,
  "baseSeed": "...",
  "debug": false,
  "runs": [{ "runNumber": 1, "seed": "...", "stateChecksum": "...",
    "eventLogChecksum": "...", "finalGameTime": 360000,
    "cashBalanceMinor": 10000000, "receivablesMinor": 0, "payablesMinor": 0,
    "ledgerResult": 0, "terminalStatus": "SOLVENT",
    "batchCount": 1, "totalVolumeMilliM3": 20000,
    "deliveredVolumeMilliM3": 0, "exportedVolumeMilliM3": 30000,
    "invariantFailures": [], "failed": false }],
  "anyFailed": false
}
```

### Determinism
- Same seed + configuration → identical checksums
- Different seeds → variation only through named RNG streams
- No hidden truth in ordinary output (debug flag required for invariant details)

## Cross-domain invariants
- No duplicate receivables, payables, or cost layers
- Volume conserved across batch splits, moves, and depletion
- Every journal transaction is balanced
- Ownership, custody, and location tracked on every batch/load
- All RNG draws use named streams; `Math.random` is absent

## Migration
- No schema change (remains at version 13, CORE_VERSION 0.14.0)

## Known limitations
- Policies are intentionally naive (fixed command sequences, no adaptive AI)
- Single company; no competitor interaction
- Not a balance target
- Step 16 was not started
