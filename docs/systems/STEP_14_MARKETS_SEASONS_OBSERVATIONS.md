# Step 14 — Markets, Seasons, Regime Change, Events, and Observations

Status: **IMPLEMENTED**. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §14.

## Domain files

- `src/market/types.ts` — `MarketDriver`, `MarketRegimeState`, `MarketObservation`, `MarketSnapshot`, `SeasonalWindow`
- `src/market/domain.ts` — `MarketDomain` reducer with all event handlers and invariants
- `src/market/commands.ts` — Command handlers: `CreateMarket`, `UpdateMarketDriver`, `TransitionMarketRegime`, `AdvanceMarketSeason`, `RecordMarketObservation`
- `src/market/read-models.ts` — Defensive read models: `marketReport`, `marketDriverReport`, `marketObservations`, `marketSummary`

## Market lifecycle

1. **CreateMarket** — initialises the market with a regime, season, and named drivers
2. **UpdateMarketDriver** — changes a driver's value (0-10000 bp) and direction (UPWARD/DOWNWARD/STABLE) via deterministic RNG-free event
3. **TransitionMarketRegime** — shifts between NORMAL, BOOM, RECESSION, STAGNATION
4. **AdvanceMarketSeason** — cycles through SPRING_THAW, SUMMER, AUTUMN, WINTER
5. **RecordMarketObservation** — creates a player-visible report from hidden state; uses deterministic 'market' RNG stream for noise

## Hidden truth vs player-visible information

- **Hidden truth:** `MarketSnapshot.regime`, `MarketSnapshot.drivers[].valueBasisPoints`, `drivers[].direction` — authoritative market state
- **Player-visible:** `MarketObservation.reportedRegime`, `driverObservations[].reportedDirection` — may differ from hidden truth due to RNG-based noise in reporting
- Observations are immutable once recorded; later updates do not retroactively change historic observations

## Price signal integration

Market drivers carry `valueBasisPoints` (intensity, 0-10000) and `weightBasisPoints` (influence). These feed into:
- **Buyer price cards** — `UpdateMarketDriver` for `EXPORT_DEMAND` drivers recalculates future buyer price cards; old cards remain immutable
- **Export pricing** — future integration point
- **Auction valuation** — future integration point

Seasonal windows affect:
- **Routing:** `AdvanceMarketSeason` → `SPRING_THAW` blocks `GRAVEL` route edges; other seasons restore them
- **Inventory:** `seasonalDegradationRateBasisPoints` exposed per season via read models

## Deterministic RNG behavior

- `RecordMarketObservation` uses `e.rng.stream('market')` for observation noise
- Named 'market' stream is independent from other RNG streams
- RNG draws are stored in the event and verified on replay

## Migration

- Version 12→13 adds empty `markets` state
- Existing Steps 1–13 behaviour preserved
- CORE_VERSION = "0.14.0", SAVE_SCHEMA_VERSION = 13, SNAPSHOT_SCHEMA_VERSION = 13

## Known limitations

- Market driver values do not automatically update (manual `UpdateMarketDriver` commands drive change)
- No automatic regime transition logic (triggered by `TransitionMarketRegime` command)
- Seasonal inventory degradation rate is exposed but no automatic batch-degradation tick exists
- One market regime transition tested; no multi-regime sequences validated
- Step 15 was not started
