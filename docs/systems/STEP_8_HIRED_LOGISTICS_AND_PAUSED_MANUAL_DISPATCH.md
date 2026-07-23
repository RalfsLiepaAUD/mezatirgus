# Step 8 — Hired Logistics and Paused Manual Dispatch

Status: IMPLEMENTED. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §8. Carriers and disruption descriptions are fictional.

## Model and lifecycle

The authoritative transport domain contains `Carrier`, `CarrierQuote`, and `TransportJob`. Stable counters produce `CARRIER-`, `QUOTE-`, and `JOB-` IDs. A job preserves its Load ID, owner, origin, destination, quoted route edges, and cargo volume. Its lifecycle is planned → waiting for confirmation → dispatched → in transit → arrived → unloaded → completed. Cancellation is supported before pickup; cancellation after pickup is explicitly rejected in this skeleton.

## Quotes and pricing

Quotes require an active carrier, a populated Load, sufficient vehicle capacity, and an active directed Step 4 route. Exact expiry is scheduled and stale-safe. Pricing is deterministic integer arithmetic: base call-out + rounded-up route kilometres × distance rate + volume × rate + urgency basis-point adjustment. The immutable quote stores every component, distance, time, route, capacity-relevant volume, and final minor-unit total.

## Paused manual dispatch and movement

Quote acceptance, job creation, and Load allocation schedule no movement. `ConfirmDispatch` is the explicit player gate. It atomically revalidates job state, unique active Load allocation, ownership, origin, volume, carrier capacity, and the exact quoted route. A missing, blocked, or changed route rejects without consuming RNG or reserving IDs.

Confirmation stores one named `transport` RNG draw and the derived disruption outcome in its immutable event. It schedules exact pickup and arrival timestamps. Pickup transfers custody to the carrier without moving the Load or changing ownership. Arrival changes the Load location only at the scheduled timestamp. Unload restores custody to the owning company. No event teleports cargo early.

Cancelled jobs leave later pickup, disruption, and arrival events harmless. Scheduled processing checks the authoritative job lifecycle before applying physical changes.

## Disruption, costs, and finance

The skeleton has one fictional road-delay branch. A configured basis-point chance determines an integer delay and surcharge; both are stored in the dispatch event and replay-verified. The surcharge moves arrival later and becomes part of final transport cost.

Completion after unload creates one carrier `Payable`, one balanced operating-expense/accounts-payable journal, and one Load cost layer linked to that payable. It never changes cash. Payment remains the existing `RecordPayablePayment` finance operation, preventing duplicate settlement.

## Persistence and read models

Core version is 0.8.0 and save/snapshot schema is 7. Migration 6→7 adds an empty transport snapshot without dropping Steps 1–7. Transport state, queued timestamps, stored RNG material, IDs, price components, cargo links, payable links, and lifecycle provenance are authoritative and checksummed. Replay uses the production transport, inventory, and finance reducers.

Carrier directory, quote detail, job detail, and transport board return defensive copies and consume no RNG. `pnpm transport:demo` proves paused dispatch, pickup, deterministic disruption, delayed arrival, unload, payable/cost attribution, and save/load replay checksum equality.

## Known limitations and Step 9 exclusion

The skeleton models one Load per hired job, one vehicle capacity per carrier, one-way quotes, a single route, one disruption kind, and cancellation only before pickup. It does not implement multi-point loading, partial loads, waiting charges, carrier contracts, owned fleets, drivers, maintenance, automatic dispatch, or recurring-lane aggregation.

No Step 9 yard, employee, harvesting, forest, auction, contract, export, market-regime, competitor, or UI behavior was started.
