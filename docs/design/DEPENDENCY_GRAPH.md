# Dependency Graph

## Architectural boundaries

```text
configuration data ──validated definitions/provenance──┐
                                                       v
commands ──> simulation core ──> immutable events ──> persistence/event log
                    │                    │
                    │                    ├──> reporting read models ──> UI
                    │                    └──> player/AI information views
                    └── deterministic snapshots ──> headless balance runner
```

- **Simulation core:** authoritative clock, RNG, entities, rules, commands, conservation, AI, and domain events. No UI imports.
- **Configuration data:** versioned species, assortments, buyers/archetypes, price/cost anchors, transport tiers, seasons, auction assumptions, quality distributions, markets, forests, and provenance.
- **UI:** sends validated commands and renders player-visible projections/read models. It never owns rules or authoritative state.
- **Reporting:** event-derived projections for ledger, inventory, aging, utilization, analytics, and debug views; rebuildable from snapshot + events.
- **Persistence:** save envelope, config version/hash, seed, RNG state, snapshot, command/event sequence, schema migrations.
- **Headless runner:** instantiates the same core/config, supplies policies instead of UI commands, and exports metrics; no alternate “fast” economics.

## Object dependencies

```text
Species ─┬─> Assortment ─> buyer compatibility ─> PriceCard
         └─> Forest/HarvestEstimate ─> QualityComposition

Location + Company + Deal + AcquisitionLot
                     └─> TimberBatch ─> Load ─> MeasurementEvent
                                           └─> Receivable ─> CashLedgerEntry

Supplier/Buyer/Competitor ─> RelationshipState ─> Offer/Contract/Intel
Calendar + MarketRegime + AssortmentMarket ─> BuyerDemandState ─> PriceCard
Truck + Driver + route + Load ─> TransportJob
ForestAsset + Permit + HarvestContract ─> batches
Port + batches + CharterQuote + documents ─> export movement
```

Hard prerequisites are stable definitions/IDs, company/finance, calendar/RNG/events, location, and conserved timber. Placeholder logic is acceptable for formulas and thin actor policies; it is not acceptable for identity, ownership, cash versus claims, physical location, compatibility, or deterministic time.

## System dependencies and implementation order

| Order | System slice | Must be real first | Placeholder allowed initially |
|---:|---|---|---|
| 1 | Config/provenance validation | Stable IDs, units, provenance category | Sparse values and marked gaps |
| 2 | Clock, RNG, event log, save envelope | Deterministic ordering/replay | Coarse tick interval |
| 3 | Company, accounts, ledger, claims | Balanced postings; free vs committed vs receivable | One lender/product |
| 4 | Locations and route graph | Explicit locations and route distance/access | Small Latvia graph |
| 5 | Species, assortments, quality, lot/batch/load | Volume conservation and hierarchy | Simple distributions |
| 6 | Buyers, demand, compatibility, price cards | Cards calculated from state; rejection rules | Coarse hunger formula |
| 7 | Suppliers, offers, relationships, documents | Recurring identity and uncertain estimates | One negotiation outcome per branch |
| 8 | Deal execution, hired transport, dispatch | Ownership/cost/time transitions | Simple spot quote formula |
| 9 | Measurement, receivables, payment, reporting | Buyer measurement determines revenue; aging | Simple variance distributions |
| 10 | Auctions and competitor | Shared lots/cash/capacity; bounded bids | One AI policy; assumed auction config |
| 11 | Contracts, yard, sorting, owned truck/lane | Obligations/capacity/fixed costs | One of each; heuristic automation |
| 12 | Forest, harvest, permits | Multi-outturn and scheduled cost/risk | Thin permit workflow/estimate |
| 13 | Port, charter, export | Aggregation, documents, transit, working capital | One route/quote/buyer |
| 14 | Seasons, markets, regime transition, intel | Causal state changes | Single scripted driver event acting through agents |
| 15 | Headless scenario and balance metrics | Same core and config as interactive | Simple policies and CSV/JSON output |

## Circular dependencies to avoid

- Buyer prices must not read player routing intentions. Buyer demand produces a card; routing consumes its immutable snapshot.
- Market state must not be set from displayed prices. Agent supply/demand updates market pressure, which helps calculate prices.
- Reporting must not repair or mutate simulation state; it is a projection only.
- UI controls must not calculate authoritative costs, quality, auction outcomes, or payments.
- AI must not query hidden player/UI state or future RNG results; it uses its `IntelItem` view.
- Relationship outcomes may affect access/branches, but cannot directly rewrite historical deal terms.
- Finance affordability checks use ledger/accounts and committed claims, not forecast P&L.
- Inventory valuation cannot become physical volume or cash.
- A `MeasurementEvent` finalizes sale economics but does not overwrite acquisition estimates used for analytics.

## Tick order

For each simulation timestamp, process stable IDs within each phase:

1. apply queued player/AI commands whose execution time has arrived;
2. settle scheduled cash, interest, payroll, penalties, and due-state transitions;
3. advance harvest, handling, loading, road, vessel, and delivery jobs;
4. process access, freshness, degradation, inventory loss, and permit/document expiry;
5. consume buyer stock and fulfill production/intake plans;
6. update supplier availability, finite carrier/worker capacity, and contract periods;
7. update assortment-market drivers and market-regime transition conditions;
8. recompute buyer demand/hunger and publish new price-card snapshots only if required;
9. let AI perceive new information, then schedule decisions for a future command boundary;
10. emit public/private intel, reporting projections, alerts, and auto-pause requests;
11. assert invariants and optionally snapshot/checksum.

RNG streams should be named by subsystem/entity and draws recorded or reproducible, so adding a UI call cannot perturb economic outcomes.

## Event flow

```text
Command (accept offer)
→ OfferAccepted
→ DealCommitted + PayableCreated + LotRightsCreated
→ PaymentSettled
→ OwnershipTransferred (rule/config dependent)
→ BatchesAvailable
→ DispatchQueued
→ TransportStarted / TransportCompleted
→ GateDecision
→ MeasurementFinalized
→ ReceivableCreated
→ BuyerPaymentScheduled
→ CashReceived
→ DealCompleted
→ Ledger/analytics/intel projections updated throughout
```

Events carry `event_id`, game time, type, actor, target IDs, cause/parent event, schema version, visibility, and payload. Commands can fail without mutation and return a reason.

## Ownership transitions

| Channel | Initial control | Skeleton transition | Required caveat |
|---|---|---|---|
| Private roadside | Supplier owns/controls | At payment or explicit agreed term | Volume basis and risk term are deal fields |
| Prepared auction | Seller controls lot | Full payment → player title/risk | `[ASSUMED] RR` for exact LVM contract |
| Standing timber | Seller owns land/rights | Winning/payment creates harvest right; harvested batches become buyer stock | Exact permit/title responsibilities configurable/RR |
| Buyer delivery | Player owns in transit | Acceptance/measurement or contract delivery point transfers economic control | Contract field, not universal rule |
| Yard/port/carrier custody | Owner usually unchanged | Custodian/location changes only | Never conflate custody with title |

## Money-flow transitions

```text
free cash
  ├─ commitment → committed availability (no cash posting yet)
  ├─ supplier/auction settlement → cash out + inventory/rights cost
  ├─ transport/harvest/yard/charter settlement → cash out + deal/asset cost
  └─ loan draw → cash in + debt liability

accepted buyer measurement → revenue + receivable (not cash)
receivable aging → due/overdue/distress signal
buyer settlement → cash in + receivable reduction
interest/penalty/degradation → cost or asset loss with explicit event
```

Ordinary domestic B2B timber trades produce no VAT cash entry `[VERIFIED]`.

## Timber-flow transitions

```text
estimated opportunity
→ purchased lot or harvest right
→ roadside TimberBatch[]
→ reservation/allocation
→ Load[]
→ buyer OR yard
→ (yard: store → degrade and/or sort → child batches → new loads)
→ gate
→ measurement/accepted volume
→ buyer stock or port aggregation
→ consumed/exported
```

Every split/merge/move records source and destination quantities. Differences between dispatched and measured volume become an explicit measurement variance/loss event.

## Full forest-or-offer chain through accounting

```text
ForestAsset / standing-timber lot / roadside Offer
    ↓ inspect or auto-estimate (knowledge improves; truth stays hidden)
Deal + AcquisitionLot + DocumentSet + payment obligation
    ↓ pay / obtain rights / schedule harvest if needed
HarvestEstimate → HarvestContract → roadside TimberBatch[]
    ↓ reserve compatible portions and choose destinations
Load[] → TransportJob[] → gate/document check
    ↓ accept, reprice, refuse, or return
MeasurementEvent[] → invoice(s) → Receivable(s)
    ↓ buyer-specific stochastic-but-seeded payment timing
CashLedgerEntry settlement
    ↓
deal P&L + cash conversion days + supplier/buyer analytics + relationship/intel updates
```

One deal can therefore produce multiple destinations, invoices, and measurement acts without losing its single commercial identity.
