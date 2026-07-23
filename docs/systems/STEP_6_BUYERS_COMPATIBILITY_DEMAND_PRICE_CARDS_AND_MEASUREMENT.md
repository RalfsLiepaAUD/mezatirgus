# Step 6 — Buyers, Compatibility, Demand, Price Cards, and Measurement

Status: IMPLEMENTED. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §6. All runtime buyers are fictional; behavior distributions are not claims about real companies.

## Model and information boundary

The authoritative buyer domain contains Buyer, PriceCard, and MeasurementAct. Buyers have deterministic `BUYER-` IDs, a configured fictional profile, active location, compatibility rules, stock, capacity, target stock, consumption, hunger, payment terms, instant-payment discount, and hidden measurement traits. Price cards and measurements have their own deterministic IDs and immutable event provenance.

Public/player read models deliberately omit hidden measurement bias and strictness. Gate decisions use only the buyer’s compatibility/capacity/demand state, the delivered Load composition, and its active card. Measurement uses hidden traits only after gate acceptance. Debug access to authoritative state remains outside ordinary buyer read models.

## Compatibility, capacity, demand, and hunger

A nonzero species/assortment combination in a Load must have an explicit accepted rule. Any unsupported combination is refused. The Load must be unloaded at the buyer’s active Step 4 location. The buyer must have capacity for dispatched volume before measurement begins; rejection is atomic and RNG-neutral.

Accepted measured volume increases buyer stock. `ConsumeBuyerStock` is the explicit causal release of stock and capacity. Hunger is an integer basis-point shortage against target stock, clamped to 0–10,000. Changing target/consumption or consuming stock emits an event and recalculates hunger. There is no autonomous noise or price movement without such a causal state change.

## Calculated price cards

Cards are calculated integer outputs. The inspectable breakdown contains base minor units per m³, hunger premium, capacity-utilization penalty, optional instant-payment discount, final rate, hunger, utilization, and causal event IDs. Tunable maximum adjustments and gate thresholds are centralized in `buyer/pricing.ts`. Repeating the same input state produces the same rate. Standard and instant options are separate cards.

## Gate and deterministic measurement

`SubmitLoadToBuyer` makes one of three gate decisions:

- `ACCEPT` for compatible capacity with ordinary quality/demand conditions;
- `REPRICE` when the centralized quality-share or low-hunger threshold applies;
- `REFUSE` for incompatibility, unavailable capacity, or the narrow low-hunger quality-stop rule.

Refusal creates a MeasurementAct audit record but no receivable or revenue. An accepted/repriced act draws exactly once from the named `buyer` RNG stream. The immutable event stores the adjustment, measured volume, grade allocation, accepted/rejected volume, applied rate, principal, and deterministic RNG material. Replay verifies that material and restores the draw count; reporting consumes no RNG.

Grade volumes use exact integer largest-remainder allocation from the Load’s quality basis points. Grade volumes sum to measured volume. The configured brāķis share is explicitly rejected in the skeleton; other measured grades are accepted. Thus measured volume equals accepted plus rejected volume, and a partial rejection never earns revenue. Repricing applies the centralized integer discount to the calculated card.

## Dispute choice

One explicit branch is implemented: `ACCEPT_RESULT` or `CHALLENGE`. Challenge marks the act disputed without a minigame or hidden-truth disclosure. Relationship, evidence-strength, escalation, and behavioral adaptation belong to later connected steps.

## Receivable and payment

Dispatch, movement, and unloading never create revenue. `BuyerMeasurementRecorded` creates a Step 3 Receivable and balanced revenue journal only for accepted measured volume:

`principal minor = floor(accepted milli-m³ × rate minor/m³ ÷ 1000)`.

The Load owner is the creditor. Standard payment uses the buyer-specific integer delay and an exact scheduled `BuyerPaymentDue` event. Instant payment applies the configured minor-units-per-m³ discount and settles at the measurement timestamp. Settlement posts a balanced existing-finance cash/receivable journal; it never mutates cash directly. Existing finance validation prevents duplicate manual payment. A scheduled payment that finds an already-paid or partially handled claim is safely stale and posts nothing.

## Events, persistence, and read models

Commands: `CreateBuyer`, `SetBuyerDemand`, `ConsumeBuyerStock`, `PublishBuyerPriceCard`, `SubmitLoadToBuyer`, and `ChooseMeasurementDispute`.

Events: `BuyerCreated`, `BuyerDemandChanged`, `BuyerStockConsumed`, `BuyerPriceCardPublished`, `BuyerMeasurementRecorded`, `BuyerMeasurementDisputeChosen`, and scheduled/immediate `BuyerPaymentDue`.

Buyer state is authoritative and checksummed. Core version is 0.6.0; save/snapshot schema is 5. Migration 4→5 adds a deterministic empty buyer snapshot without dropping Step 1–5 state. Replay preserves buyer, price-card, measurement, receivable, journal, scheduled-event, RNG, and counter state.

Read models provide a fictional buyer directory, compatibility matrix, stock/capacity/demand/hunger descriptor, calculated cards with causal breakdown, and measurement acts. They return defensive copies, consume no RNG, and omit hidden traits.

`pnpm buyer:demo` demonstrates a calculated card, accepted deterministic measurement, incompatible refusal, measured-volume receivable, delayed payment, causal stock consumption/card change, save/load, and replay.

## Known limitations and Step 7 exclusion

The skeleton uses immediate gate measurement after unloading, coarse basis-point grade vectors, one simple dispute choice, one conservative fictional measurement distribution, a daily consumption command rather than autonomous production scheduling, and one price formula. Documents, certification and diameter gates remain future compatibility dimensions. Payment distress/drift, relationship effects, adaptive conduct, supplier offers, documents, contacts, and intel are not implemented here.

Step 7 suppliers, offers, documents, relationships, and intel was not started.
