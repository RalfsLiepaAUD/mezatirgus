Status: ARCHIVED — HISTORICAL
Current replacement: docs/systems/STEP_2_DETERMINISTIC_CORE.md and src/scheduler/commands.ts (autonomous scheduler is now part of core sim)
Do not treat as current truth.

# Phase 2 Milestone 1 — The World Ticks

Status: **IMPLEMENTED**.

## Domain files

- `src/scheduler/commands.ts` — `registerSchedulerCommands`, `setupAutonomousScheduler`
- `src/cli/world-demo.ts` — Human-readable autonomous-world demo
- `src/cli/autonomous-runner.ts` — Machine-readable autonomous scenario runner

## Autonomous systems

1. **Buyer consumption** — every tick (3600s game time), each active buyer consumes configured stock via `ConsumeBuyerStock`; hunger and capacity systems update automatically
2. **Supplier offer generation** — every 3 ticks, active suppliers generate deterministic offers with RNG-based volume/rate; 3-day expiry timestamps; uses named `autonomous` RNG stream
3. **Competitor activity** — every 6 ticks, picks cheapest available open offer and accepts it (up to 10× available cash); uses `autonomous` RNG stream for fair selection
4. **Recurring financial pressure** — daily (24 ticks): employee payroll and yard storage costs posted as payables via `PostOperationsCost`; no direct cash mutation

## Implementation

- New `AutonomousCommand` event type handled in `fireScheduled` which calls `this.execute()` with the stored command type and payload
- Each autonomous handler schedules its next occurrence via `scheduleNext` with `e.queue.schedule()`
- Stale-event safety: autonomous events fire only at exact scheduled times; paused state blocks all time advancement

## 21-day zero-input outcome (seed 42)

| Metric | Value |
|--------|-------|
| Final cash | €30,000.00 (€30k starting, payables accrued) |
| Buyer stock | 69,416 m³ (from 80,000 = 10,584 consumed) |
| Buyer hunger | 0 bp (stock well above target) |
| Offers generated | 168 |
| Offers expired | 144 |
| Offers accepted | 0 (none affordable with cash constraint) |
| Active price cards | 1 (unchanged) |
| Payables | €6,048 (accumulated payroll/storage) |

## Determinism
- Same seed/config → identical checksums
- Large time jumps == repeated small advances (proven by test)
- All journals balanced; no duplicate objects

## Known limitations
- No auction, forest, or export autonomous integration
- Competitor only accepts offers (no auction bidding, no dispatch)
- No automatic payable payment (cash only changes when player pays)
- 21-day run at ~200ms/tick requires patience
- Excluded from this milestone: export, auction-conversion, sorting-payoff loops
