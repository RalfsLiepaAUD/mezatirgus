# Full Object Model

> Status: ARCHIVED — SUPERSEDED
> Current replacement: docs/systems/ARCHITECTURE.md
> Do not treat as current architecture authority. Object names below (`AcquisitionLot`, `TimberLot`, `TimberBatch`, `MeasurementEvent`) are historical design-time names; the implementation uses `Lot`, `Batch`, `MeasurementAct` — see the replacement document.

## Modeling rules

- IDs are deterministic stable identifiers generated from persistent per-entity-type counters, with optional readable prefixes such as `DEAL-000001`, `LOT-000001`, `BATCH-000001`, and `LOAD-000001`. Counter state is part of the authoritative save and replay state. UI labels, names, and localized text must never be relational keys.
- Money is stored as integer minor units plus an ISO-style currency code.
- Volume is stored as integer thousandths of a cubic metre.
- Rates are stored as integer minor units per cubic metre.
- Percentages and proportions are stored as integer basis points.
- State changes occur through commands/events and ledger entries, not silent mutation.
- Config definitions are immutable within a save; runtime entities reference versioned definitions.
- Every sourced or numeric field can point to a provenance record: source file, page/section, category, confidence, tunable flag, and research-required flag.
- The first full skeleton represents every major object type below. Later-stage objects may initially be seeded records, read-only placeholders, or one-path implementations, provided their IDs, relationships, ownership, lifecycle state, provenance, persistence shape, and boundary with connected systems are real.

## Central hierarchy and accounting identity

```text
Deal
└── AcquisitionLot / TimberLot
    ├── TimberBatch[]
    │   └── allocated portions → Load[]
    │       └── delivery → MeasurementEvent[]
    ├── DocumentSet
    └── costs, payables, receivables and ledger links
```

A forest purchase remains one `Deal` and normally one acquisition identity even when its harvest creates several roadside piles. The harvest outturn creates separate `TimberBatch` records for each homogeneous combination of species, assortment, quality/freshness/certainty state, and location. Portions of those batches form several `Load` records, potentially sent to different buyers or a yard. Each delivery can create its own `MeasurementEvent`, invoice, and `Receivable`; supplier, harvesting, road preparation, transport, yard, and financing costs may create several `Payable` and ledger records. All descendants retain `deal_id` and `acquisition_lot_id`, so deal-level expected-versus-realized profitability remains coherent without pretending the wood is physically homogeneous.

## Commercial, finance, and counterparty objects

| Object | Purpose and important fields | Relationships; creation/modification/consumption | Ownership and lifecycle | Skeleton and provenance |
|---|---|---|---|---|
| `Company` | Economic actor: id, fictional name, type, status, reputation, capabilities, home location, accounting policy | Owns accounts, assets, inventory, contracts, staff; created at world generation; commands/events modify; insolvency/end-state consumes active status | One owner per asset/obligation at a time; founded → active/distressed → insolvent/acquired/closed | Required. Initial values `[LOCKED/TUNABLE]`; fictional profiles may be calibrated but not copied |
| `FinanceAccount` | Cash/bank/restricted/debt-clearing account: currency, balance cache, restrictions | Belongs to company; balance derived from ledger; deposits and committed cash reference it | Company-owned; open → frozen/closed; never delete if referenced | Required. Accounting rules are design; starting balances tunable |
| `CashLedgerEntry` | Immutable money fact: timestamp, debit/credit account, amount, category, counterparty, deal/object links, memo | Created by settlement, fees, payroll, drawdown, repayment; reporting consumes it; corrections reverse, never edit | Company books; posted entries immutable | Required. No VAT cash entries for ordinary domestic B2B timber `[VERIFIED]` |
| `Loan` | Term borrowing: principal, rate, schedule, covenants, collateral, arrears | Lender/company; drawdown posts cash and liability; ticks accrue interest; payments modify; finance/reporting consume | Borrower obligation; offered → active → repaid/defaulted | Required as one simple product. Terms centralized placeholder/tunable |
| `CreditFacility` | Revolving working capital: limit, drawn, rate, availability, review date | Company/lender; draws fund cash; repayments restore headroom; distress/covenants modify | Approved → active/suspended/closed/defaulted | Required as object, minimal locked/unavailable initial state acceptable. Product terms placeholder |
| `Receivable` | Buyer debt: invoice, principal, due date, aging, expected/payment distribution, recourse, deal/load links | Created after accepted measurement/invoice; buyer payment or default modifies; ledger/reporting consume | Creditor company owns; open → partial/paid/overdue/impaired/defaulted/factored | Required. Buyer terms sourced where real calibration exists; fictional runtime traits |
| `Payable` | Company debt: supplier/auction/transport/payroll amount, due date, priority, deal links | Created by purchase/service/penalty; settlement posts ledger; distress logic consumes | Debtor company obligation; committed → due → paid/overdue/defaulted | Required. Supplier speed `[FIRST-HAND/RESEARCH-UPDATED]`; exact auction deadlines assumed |
| `Deal` | Commercial/accounting identity: channel, parties, signed time, expected and realized P&L, status, risk flags | Parent of lot(s), costs, documents, loads, measurements, invoices; accepted offer/auction/contract call-off creates | Acquiring/selling company owns record; proposed → committed → executing → completed/cancelled/defaulted | Required. Structure locked; numeric forecasts retain provenance |
| `AcquisitionLot` / `TimberLot` | Purchased lot: seller, basis, agreed/estimated volume, unit/total cost, origin, ownership/risk timestamps, terms | Child of deal; parent of batches/documents; offer/auction/forest harvest creates; measurement/removal modifies | Seller → buyer at configured contractual transition; available → paid/owned → removed/closed/failed | Required. Exact LVM transfer is `[ASSUMED] RESEARCH_REQUIRED` |
| `Supplier` | Supply-side contact/profile: company/person, channels, regions, reliability, documents, payment expectations | Creates offers; relationships and deal history modify observed profile; contracts/advances consume | Independent actor; active/inactive/blacklisted | Required. Fictional identity; behaviors inferred/first-hand as distributions |
| `Buyer` | Demand-side actor: location, compatibility, capacity, consumption, documents, grading/measurement/payment traits | Owns demand state and computed price cards; loads and contracts consume capacity; measurements/payment modify histories | Independent fictional company; open/limited/stopped/distressed/closed | Required. Real firms only calibration; no unverified attribution |
| `Offer` | Time-limited proposed acquisition/sale: seller, lot estimate, volume basis, price, deadline, inspection state, documents | Supplier/channel creates; inspection/negotiation modifies; acceptance creates deal/lot/payable | Issuer controls until accepted; discovered → evaluated/negotiating → accepted/expired/rejected | Required. Values sourced/tunable/placeholder per field |
| `AuctionLot` | Competitive lot: type, reserve/start, bid rules, schedule, estimated wood/outturn, deposit, deadlines, documents/results | Auction service creates; bids modify leader; close creates deal/payable/lot or failed outcome | Seller until configured transfer; announced → open → extended/closed → paid/removed/failed | Required. Exact rules config `[ASSUMED] RESEARCH_REQUIRED`; public results practice `[VERIFIED]` |
| `AuctionBid` | Immutable bid: bidder, €/m³, total shown, time, status, proxy cap if supported | Company command/AI creates; auction close consumes; result becomes intel | Bidder owns intent; placed → leading/outbid/won/lost/invalid | Required. No uncapped auto-bid; increments assumed config |
| `SupplyContract` / `FrameAgreement` | Recurring obligation: parties, period, volume, tolerance, price basis, schedule, bonus/penalty, fulfillment | Negotiation creates; load allocation and measurements update; settlement/reporting consume | Counterparties share contract; draft → active → fulfilled/breached/expired/terminated | Required. One simple frame agreement; ±10% and bonus values tunable/sourced as documented tactic |
| `PriceCard` | Calculated buyer offer by compatibility/bracket/quality at time: lines, premiums, validity, causal inputs | Pricing system computes from buyer demand, regime, season, competition; routing UI and measurement consume snapshot | Buyer publishes; calculated → published → superseded/expired | Required. Output, never static constant; base anchors in data with provenance |
| `BuyerDemandState` | Buyer state per compatible stream: stock, capacity, consumption, planned intake, commitments, hunger, stop/gate state | Deliveries add stock; consumption removes it; season/regime/contracts modify plans; price/grading use it | Buyer-owned runtime state; continuously active, versioned snapshots | Required. Hunger formula tunable; causal inputs inspectable in debug |

## Timber, quality, measurement, and definitions

| Object | Purpose and important fields | Relationships; creation/modification/consumption | Ownership and lifecycle | Skeleton and provenance |
|---|---|---|---|---|
| `Species` | Definition: code, localized name, density/seasonal traits, compatible assortments | Referenced by batches, forest estimates, buyers, markets | Versioned config, no runtime owner | Required: birch, spruce, pine, aspen, alder, oak. Traits need provenance |
| `Assortment` | Commercial product definition: code, species compatibility, diameter/quality/document rules, degradation behavior | Referenced by batches, buyers, price cards, markets, contracts | Versioned config | Required: veneer logs, sawlogs, pulpwood, energy wood, reject/brāķis |
| `QualityComposition` | Fractions/volumes by grade and diameter bracket, freshness/felling date, certainty, inspection method | Component of batch/load estimate; sorting splits/refines; measurement supersedes estimates without erasing them | Follows batch; estimated → inspected/sorted → measured/realized | Required. Birch A/B/tara/brāķis and tara dual paths locked; distributions tunable |
| `TimberBatch` | Homogeneous physical stock: owner, lot/deal, species, assortment, quality, volume, location, freshness, reserved volume, unit-cost layers | Harvest/purchase/sort creates; storage degrades; load allocation splits; sale/consumption exhausts | Exactly one owner and location at a time; planned → available/reserved/in_transit? (physical volume moves via loads) → depleted/lost | Required; core physical object. All numeric states trace to source, measurement, or event |
| `Load` | Transport-sized movement: source/destination, batch portions, planned/actual volume, truck/job, documents, status | Dispatch creates from compatible portions; transport updates; buyer creates measurement; delivery transfers/consumes portions | Owner follows goods/risk terms; planned → loading → in transit → gate → accepted/refused/delivered/returned | Required. ~30 m³ payload is research anchor/tunable |
| `MeasurementEvent` / `MeasurementAct` | Buyer-side record: declared/estimated/measured volume, bracket split, grades, downgrades, price-card snapshot, payable, dispute evidence/outcome | Accepted delivery creates; dispute may append resolution; creates revenue/receivable and analytics | Issuer record linked to both parties; provisional → final/disputed → resolved | Required. Bias traits are possible distributions, not universal facts |

## Forestry, documents, and operations objects

| Object | Purpose and important fields | Relationships; creation/modification/consumption | Ownership and lifecycle | Skeleton and provenance |
|---|---|---|---|---|
| `ForestAsset` | Land/rights asset: owner, polygons/region, hectares, inventory date/certainty, access, obligations, encumbrances | Property deal creates/transfers; estimate and harvest contract consume; growth/revaluation later modifies | One legal owner; offered → owned → partially/fully harvested → retained/sold | Required one simple asset. Inventory uncertainty explicit; legal details research-required |
| `HarvestEstimate` | Commercial forecast: species/assortment outturn distributions, cutting, forwarding, road prep, schedule, access/season risk, roadside cost | Generated from forest/standing lot and config; inspection may refine; harvest compares actual | Belongs to opportunity/deal; draft → accepted baseline → realized comparison | Required. 2023 cost anchors sourced; missing decomposition placeholders centralized |
| `HarvestContract` | Contractor agreement: scope, stand, schedule, rates, capacity reservation, liabilities, completion | Deal/company and contractor create; ticks/events advance; completion creates batches/payables | Company holds service right/obligation; quoted → active → delayed/completed/breached | Required minimal. Permit responsibility configurable where uncertain |
| `DocumentSet` | Versioned bundle: origin, ownership/harvest rights, permit copy/reference, transport notes, certification, export/phytosanitary/EUDR later | Lot/forest/deal creates; loads reference; gate/compliance checks consume | Controlled by deal owner, with issuer metadata; incomplete → valid/expired/rejected | Required. Concept/source fields verified individually; legality must not be overclaimed |
| `FellingPermitState` | Permit workflow abstraction: authority, applicant/responsible party, stand, status, dates, document reference | Standing/forest opportunity creates; responsibility config and events modify; harvest requires valid state | Responsible party configurable; not_required/pending/valid/expired/suspended/rejected | Required placeholder workflow. Exact responsibility `[UNCERTAIN/RESEARCH_REQUIRED]` |
| `Truck` | Vehicle capacity and state: owner, location, payload, availability, condition, fixed/variable cost | Company/carrier owns; jobs reserve/move; maintenance modifies | One owner; ordered/available/assigned/in transit/maintenance/sold | Required one owned truck plus abstract hired capacity. Cost data provenance required |
| `Driver` | Qualified worker: employer, location, schedule, wage, availability, assigned truck/job | Employee specialization; dispatch consumes hours; events modify | Employed/contracted; available/assigned/off-duty/absent/left | Required one driver. Labour values tunable/research-backed where possible |
| `TransportJob` | Executable move: load(s), route, carrier/truck/driver, pickup/delivery windows, quoted/actual cost, waits/access | Dispatch creates; tick engine advances; completion moves wood and creates payable/cost | Ordering company controls plan; planned → assigned → loading → transit → waiting → complete/failed | Required. Spot vs efficient tiers distinct |
| `RecurringTransportLane` | Aggregated repetitive flow: origin/destination, eligible stock, cadence, capacity, rules, exceptions | Dispatcher creates; each cycle emits jobs/aggregated events; contracts/stock modify | Company program; draft → active/paused/ended | Required one minimal lane. Grouping cannot destroy inspectable exceptions |
| `Yard` | Storage/sorting location: owner, capacity, accepted wood, handling/sort cost, queues, degradation modifiers | Receives loads/batches; sorting creates new batches; storage ticks; sale/dispatch consumes | Rented/owned; planned → operating/constrained/closed/sold | Required one yard. Sorting €2-4/m³ `[TUNABLE]` |
| `Port` | Aggregation/export location: capacity, gates, services, documents, handling/stock | Loads deliver; storage/charter/export consumes; buyer may colocate | Operator/location object; open/congested/stopped | Required one fictionalized port representation; real capacity may calibrate only |
| `Vessel` / `CharterQuote` | Sea movement capacity or quote: route, parcel, dates, rate, validity, terms, transit | Broker/market creates quote; acceptance reserves vessel and creates payable/job; export consumes port stock | Carrier owns vessel; company owns accepted carriage right; quoted → accepted/expired → loading/sailing/delivered | Required one quote; rates placeholder because public tariffs unavailable |
| `Employee` | Worker relationship: role, skills, wage, location, capacity, knowledge/contact book, morale | Hiring creates; work/experience/poaching modifies; systems consume capacity/intel | Company employer; candidate → employed/absent/left/terminated | Required one employee; detailed labour law abstracted |

## World, market, information, and coordination objects

| Object | Purpose and important fields | Relationships; creation/modification/consumption | Ownership and lifecycle | Skeleton and provenance |
|---|---|---|---|---|
| `RelationshipState` | Per company-contact state: warmth, trust, abuse, blacklist, favors, gossip access, evidence history | Interactions/events modify; offers, negotiations, gates, disputes, intel consume | Belongs to ordered pair/context, not global contact score; active → damaged/recovering/blacklisted | Required one contact. Effects locked; rates tunable |
| `Competitor` | AI company policy/state: company id, archetype, regions, capabilities, beliefs, risk appetite, commitments | Perception/decision systems create bids/deals/jobs; market outcomes modify finance/reputation | Same ownership rules as player; active/distressed/insolvent/acquired | Required one named fictional competitor; AI uses same conserved resources |
| `MarketRegime` | Named causal condition: driver vector, start/end logic, observable signals, affected markets | Shocks/season/agents cause transition; assortment markets and behavior consume | World state; emerging → active → fading/ended | Required one transition. Never directly overwrite prices |
| `AssortmentMarket` | Market state per region/species/assortment: supply, demand, clearing pressure, expectations, history | Offers, buyer demand, competitors, export, season update; pricing and intel consume | World-owned runtime aggregate; continuous | Required minimal veneer/sawlog/pulp/energy separation; base data provenance |
| `Season` / `Calendar` | Deterministic game time, season windows, holidays/access/degradation modifiers, speed/pause | Clock advances ticks; all schedules query it; events can auto-pause | World state; monotonic time, save-restored exactly | Required. Compression locked; window dates tunable/sourced |
| `Location` | Expansion-ready node/region/route metadata: coordinates, country, region, access class, road links, port flag | Every physical object references; routing computes distance/time/access | World definition/config; runtime closures are events/state overlays | Required Latvia nodes plus European-ready IDs; no UI-coordinate coupling |
| `Event` | Immutable domain occurrence: type, time, actor, targets, payload, cause, RNG draw reference, visibility | Commands/ticks create; systems subscribe; reporting/persistence/headless runner consume | World log; scheduled → emitted → handled; never retroactively changed | Required. Deterministic order and causal metadata |
| `InformationItem` / `IntelItem` | Player/AI belief: subject, claim/range, confidence, source, acquired/expiry time, truth link hidden, visibility | Public results, price cards, contacts, employees, observation create; decisions consume; time/history refine | Owned by an observer; unknown → learned → stale/corrected/disproved | Required. Separates world truth from learnable knowledge |

## Generic scheduled obligations and player-yard conduct

| Object | Purpose and important fields | Relationships; creation/modification/consumption | Ownership and lifecycle | Skeleton and provenance |
|---|---|---|---|---|
| ScheduledObligation | Generic future duty: obligor, subject, type, created/due dates, estimated/final amount, currency, status, source event, settlement/waiver event | Harvest completion creates a reforestation obligation linked to ForestAsset and Deal; calendar activates it; finance/accounting settle or mark overdue | Company obligation; scheduled → due → settled/overdue/waived. Specific reforestation mechanics remain data-driven | Required one-path representation from the first skeleton [LOCKED]; timing/cost values are sourced, tunable, or placeholder |
| YardConductPolicy | Player-selected grading/measurement conduct: declared policy, opportunistic actions, evidence, vigilance/detection state, employee awareness, consequence history | Yard gate/measurement commands use it; adaptive detection, disputes, relationships, reputation, employees, and events modify consequences | Player company controls choices; each action remains an auditable event, not a permanent moral label | Required one-path ethical and opportunistic choices [LOCKED — mirror implementation]; fictional only and never attributed to real companies |

## Cross-cutting ownership rules

1. Physical timber volume is conserved. A split subtracts from the source batch and creates traceable children; a merge is allowed only for compatible states and preserves component provenance.
2. A company may own timber while another party physically holds or transports it. `owner_company_id`, `custodian_id`, `location_id`, and risk-bearing party are distinct.
3. Commercial title/risk transitions are rule-driven by channel configuration. LVM title-on-payment is an `[ASSUMED]` skeleton rule, not asserted fact.
4. Money is changed only by balanced ledger postings. A payable or receivable is a claim, not cash.
5. Estimates are never overwritten by outcomes. Expected quality/value and measured quality/value coexist for analytics.
6. Public truth, actor-private truth, and player-visible intel are separate layers.

## Provenance minimum

Every configuration record containing a numeric or behavioral assumption should include:

```json
{
  "source_file": "docs/source/...",
  "source_locator": "page or section",
  "category": "VERIFIED | RESEARCH-UPDATED | FIRST-HAND | DESIGN-INFERENCE | TUNABLE | PLACEHOLDER | ASSUMED | UNCERTAIN",
  "confidence": "high | medium | low",
  "tunable": true,
  "research_required": false,
  "notes": "scope and non-universality"
}
```

Runtime values additionally record the calculation/version or event that produced them.

