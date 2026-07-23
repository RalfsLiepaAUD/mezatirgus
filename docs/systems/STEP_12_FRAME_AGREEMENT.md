# Step 12 — Frame Agreement and Fulfillment

Status: **IMPLEMENTED**. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §12.

## Domain files

- `src/contracts/types.ts` — `FrameAgreement`, `AgreementDelivery`, `QualityThreshold`, `ContractsSnapshot`
- `src/contracts/domain.ts` — `ContractsDomain` reducer with all event handlers and invariants
- `src/contracts/commands.ts` — Command handlers: `CreateFrameAgreement`, `ActivateFrameAgreement`, `SuspendFrameAgreement`, `TerminateFrameAgreement`, `RecordAgreementDelivery`, `AcceptAgreementDelivery`, `SettleAgreementDelivery`, `SettleAgreementVolume`
- `src/contracts/read-models.ts` — Defensive read models: `agreementList`, `agreementDetail`, `agreementDeliveries`, `agreementsSummary`

## Behaviour

### Lifecycle
`PROPOSED` → `Activate` → `ACTIVE` → (deliveries) → `EXPIRED`/`FULFILLED`/`BREACHED`/`TERMINATED`
Suspension (`SUSPENDED`) and termination interrupt delivery.

### Validity
- `validFromTimestamp` / `validUntilTimestamp` enforced on activation
- Activation schedules `FrameAgreementExpired`; stale-event guard prevents double-processing

### Volume & tolerance
- `committedVolumeMilliM3` plus `toleranceBasisPoints` (bp, 0-10000)
- `deliveredVolumeMilliM3` / `acceptedVolumeMilliM3` tracked per-event
- Delivery must include at least one matching species and assortment from agreement specs
- Quality thresholds optionally enforced

### Pricing
- `FIXED_RATE`: fixed rate per m³
- `PRICE_CARD_LINKED`: references a buyer's published price card

### Finance integration
- `SettleAgreementDelivery` creates receivable, journal transaction, and cost layer
- Receivable collectable through existing `RecordReceivablePayment`
- `SettleAgreementVolume` computes bonus (over-delivery) or penalty (under-delivery)
- No direct cash mutation

### Migration
- Version 10→11 adds empty `contracts` state
- Existing Steps 1–11 behaviour preserved

## Known limitations
- One price basis per agreement; no mixed pricing
- Cover/renegotiation not implemented
- Relationship consequences not wired
- Bonus/penalty rates are flat-rate-per-m³, not percentage
- Step 13 was not started

## Version
CORE_VERSION = "0.12.0", SAVE_SCHEMA_VERSION = 11, SNAPSHOT_SCHEMA_VERSION = 11
