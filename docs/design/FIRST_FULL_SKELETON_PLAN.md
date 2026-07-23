Status: HISTORICAL REFERENCE
Not current implementation authority.
See AGENTS.md and docs/README.md for canonical sources.

# First Full Skeleton Plan

## Milestone outcome

Build an ugly, deterministic, headless-runnable vertical economy—not a polished slice. The milestone proves that all major departments exchange conserved **timber**, balanced **money**, explicit **location**, scheduled **time**, and actor-specific **information**. It is not a balance target.

No application code is created by this plan. File names below are proposed.

## Proposed repository tree

```text
data/
  schema/                 JSON schemas and provenance schema
  species.json            assortments.json       quality.json
  locations.json          buyers.json             suppliers.json
  transport.json          seasons.json            auctions.json
  finance.json            markets.json            forests.json
  ports.json              scenario_first_full.json
src/
  core/                   clock, rng, ids, commands, events, invariants
  model/                  entities and value objects
  systems/                finance, timber, market, actors, logistics, forestry...
  config/                 loading, validation, versioning, provenance
  persistence/            save envelope, snapshots, migrations
  reporting/              read models and analytics
  headless/               policies, runner, metrics export
  ui/                     shell, screens, command adapters, presenters
tests/
  unit/                   property/contract tests by system
  integration/            connected flows
  scenarios/              golden seeds and command scripts
  fixtures/               minimal valid configuration
docs/design/              authoritative design documents
```

Language/framework/module extensions should follow the eventual stack; the boundaries and responsibilities are the requirement, not these suffix-free paths.

## Implementation steps

Each step ends with a runnable/testable increment. `PH` = centralized `PLACEHOLDER`; `RR` = `RESEARCH_REQUIRED`.

### 1. Data contracts and provenance

- **Modules/files:** `data/schema/*`, all starter JSON files, `src/config/*`.
- **Minimum UI:** config validation/error page or console table.
- **Simulation logic:** deterministic per-entity-type counter IDs, units, cross-reference validation, provenance-category validation, config version/hash.
- **Data:** six species; five assortments; buyer compatibility; quality buckets; Latvia nodes; starter costs/terms; every numeric item labeled.
- **Tests:** schema failures for missing provenance, invalid units, duplicate IDs, bad compatibility, unmarked placeholder.
- **Acceptance:** the minimal scenario config loads with zero errors and emits a manifest of all `PH`, `ASSUMED`, `UNCERTAIN`, and `RR` values.
- **Simplifications/gaps:** sparse network and actor set; exact LVM terms and forest legal details remain RR.
- **Provenance:** corrected auction PDF alone anchors auction/VAT; price/cost and buyer/export PDFs anchor their respective fields; locked design labels remain distinct.

### 2. Deterministic core, calendar, events, and persistence envelope

- **Modules/files:** `src/core/{clock,rng,commands,event_queue,event_log,invariants}`, `src/persistence/{save,snapshot,migrations}`.
- **Minimum UI:** pause/1x/3x/fast controls, game date, event log, auto-pause toggle.
- **Simulation logic:** monotonic ticks, stable phase ordering, named RNG streams, scheduled/domain events, command validation, checksums.
- **Data:** ~3 game weeks/5 real minutes at 1x `[LOCKED]`; season window config.
- **Tests:** same seed + commands gives identical event/state hashes; pause produces no time advance; save/load resumes identically.
- **Acceptance:** a 90-day empty-world run is deterministic at every speed.
- **Simplifications/gaps:** coarse tick and one save schema; no optimization yet.
- **Provenance:** time model `[LOCKED]`; tick size is a technical choice recorded in schema/version, not a product question.

### 3. Company dashboard, finance, and books

- **Modules/files:** `src/model/{company,finance,claims}`, `src/systems/{ledger,finance,loan,credit}`, `src/reporting/cash`.
- **Minimum UI:** permanent free cash/committed/receivables header; ledger; receivable/payable aging; one loan panel.
- **Simulation logic:** balanced postings, reservations/commitments, one loan, thin revolving-facility object, interest, due/overdue/default states.
- **Data:** starting cash; one lender/product; rates/eligibility PH; no starting debt.
- **Tests:** posting balance, insufficient-free-cash rejection, draw/interest/repay, aging boundary, no domestic timber VAT cash.
- **Acceptance:** start at configured cash, commit a payment without spending it, settle it, create and collect a receivable, and reconcile every balance.
- **Simplifications/gaps:** one currency (EUR), one account, no tax/factoring/insurance; product pricing tunable.
- **Provenance:** VAT rule `[VERIFIED]`; starting position `[LOCKED/TUNABLE]`; loan terms clearly PH.

### 4. Latvia map and expansion-ready locations

- **Modules/files:** `src/model/location`, `src/systems/routing`, `data/locations.json`.
- **Minimum UI:** schematic Latvia map/list with selected route, distance, access class, and travel time.
- **Simulation logic:** graph routing, explicit node/edge IDs, region/country, seasonal closures, Europe-compatible country/node schema.
- **Data:** Riga, sample roadside nodes, buyers, yard, port, forest, and an external export destination; initial routes PH/verified where available.
- **Tests:** symmetric/asymmetric route cases, blocked gravel edge, no teleport, save stability.
- **Acceptance:** every physical object has a valid location and all transport quotes derive from a route.
- **Simplifications/gaps:** not a beautiful geographic map; sparse roads; detailed restriction data later.
- **Provenance:** real place/distances may be sourced; fictional company locations are design data.

### 5. Deal-lot-batch-load spine and inventory

- **Modules/files:** `src/model/{deal,lot,batch,load,quality}`, `src/systems/{inventory,ownership}`.
- **Minimum UI:** deal tree and inventory grid with owner/location/species/assortment/quality/freshness/certainty.
- **Simulation logic:** create, reserve, split, compatible merge, move, deplete; cost layers and ancestry; invariant checks.
- **Data:** species, assortments, brackets, A/B/tara/brāķis, initial quality distributions.
- **Tests:** property tests for volume conservation, no double allocation, invalid merge, embedded A, dual tara paths.
- **Acceptance:** one lot splits into multiple batches and loads while deal-level volume and costs reconcile.
- **Simplifications/gaps:** composition vectors rather than logs; crude table rendering.
- **Provenance:** object hierarchy `[LOCKED]`; composition values `[TUNABLE/FIRST-HAND]` with scope notes.

### 6. Buyers, compatibility, demand, price cards, and measurement

- **Modules/files:** `src/model/{buyer,price_card,measurement}`, `src/systems/{buyer_demand,pricing,gate,measurement,payment}`.
- **Minimum UI:** fictional buyer directory, compatibility matrix, demand descriptor, calculated card, measurement act, dispute choice.
- **Simulation logic:** stock/capacity/consumption/hunger; calculated cards; gate accept/reprice/refuse; seeded measurement traits; buyer-specific payment distribution.
- **Data:** at least a veneer buyer, sawlog buyer, pulp/export buyer, and fallback energy buyer; fictional profiles; one instant-pay option.
- **Tests:** incompatibility rejection, capacity consumption, hunger-caused card change, deterministic act, receivable from measured—not dispatched—volume.
- **Acceptance:** one load is measured into brackets/grades, creates a receivable, and pays later; another is rejected for incompatibility.
- **Simplifications/gaps:** coarse mood noise and one dispute branch; no behavior attributed to real companies.
- **Provenance:** public terms/specs calibrate ranges; shaving is possible `[FIRST-HAND/TUNABLE]`, never universal.

### 7. Suppliers, offers, documents, relationships, and intel

- **Modules/files:** `src/model/{supplier,offer,documents,relationship,intel}`, `src/systems/{offers,documents,relationships,information}`.
- **Minimum UI:** phone/offers list, inspection view, document checklist, one named contact, intel feed.
- **Simulation logic:** uncertain truth vs belief; agreed vs mill-measured volume basis; freshness question/inspection; offer expiry; fast-payment reputation; favor/gossip; missing-document failure.
- **Data:** few fictional supplier contacts, one roadside offer, required documents, gossip templates.
- **Tests:** offer expiry, belief refinement without truth leak, late-payment relationship damage, valid/missing document branches.
- **Acceptance:** accepting an offer creates deal/lot/payable; the contact’s later offer/intel changes because of settlement behavior.
- **Simplifications/gaps:** branch-based negotiation and small contact set; permit responsibility remains configurable RR.
- **Provenance:** document requirements `[VERIFIED]`; relationship mechanics `[LOCKED/DESIGN-INFERENCE]`; payment speed research-updated.

### 8. Hired logistics and paused manual dispatch

- **Modules/files:** `src/model/transport_job`, `src/systems/{carrier_market,dispatch,transport}`.
- **Minimum UI:** route/netback comparison and paused dispatch queue editor.
- **Simulation logic:** spot quotes, finite slots, ~30 m³ payload, partial-load minimum, access/wait modifiers, prepayment/payable, movement across ticks.
- **Data:** efficient floor and higher spot tier, payload, access/season multipliers.
- **Tests:** affordability, payload, partial-load penalty, blocked road, capacity collision, location transition.
- **Acceptance:** a hired truck moves a real batch portion to a buyer, consumes cash/time/capacity, and cannot be assigned twice.
- **Simplifications/gaps:** no animation or detailed road geometry; spot formula tunable.
- **Provenance:** LVM cost formula is an efficient baseline, not the small-player rate; spot range research-updated.

### 9. Auctions and first competitor

- **Modules/files:** `src/model/{auction,competitor}`, `src/systems/{auction,ai_perception,ai_decision}`, `data/auctions.json`.
- **Minimum UI:** two auction pages/logs: prepared roundwood and standing-timber placeholder; €/m³ and total side by side; public results.
- **Simulation logic:** registration/deposit, fixed increment, bounded proxy maximum, late extension, close, settlement/removal deadlines, bidder reveal, AI valuation with error/cash constraint.
- **Data:** one lot of each type; all exact mechanics centralized `[ASSUMED] RR`; one fictional competitor.
- **Tests:** no uncapped bid, increment enforcement, extension, deposit accounting, AI cannot exceed cash/cap, deterministic result.
- **Acceptance:** player or AI wins a conserved lot; loser cannot acquire it; result becomes intel; failure branch can forfeit deposit.
- **Simplifications/gaps:** standing lot resolves into harvest workflow placeholder; exact LVM rules not claimed.
- **Provenance:** corrected v2 tags copied field by field; never use the rejected report.

### 10. Forest asset, standing opportunity, harvest estimate, and contract

- **Modules/files:** `src/model/{forest,harvest,permit,scheduled_obligation}`, `src/systems/{forest_market,harvest_estimator,harvesting}`.
- **Minimum UI:** one asset/opportunity view showing auto-estimated roadside cost, outturn ranges, schedule, access, major risks, coarse regeneration state, and scheduled obligations.
- **Simulation logic:** purchase rights/asset; permit-state gate; contract job; cutting/forwarding/road costs; seeded multi-species/assortment realization into batches; harvest completion creates a generic scheduled reforestation cost/obligation and advances a coarse regeneration state.
- **Data:** one forest, one private or auction standing opportunity, 2023 cost anchors, PH decomposition and outturn distributions.
- **Tests:** permit blocks start, schedule/season delay, cost posting, multi-outturn conservation, estimate vs realization retained, obligation scheduled/due/settled/overdue states, regeneration transition.
- **Acceptance:** one standing-timber deal creates several roadside batches and payables but remains one deal; harvest also creates a scheduled reforestation obligation linked to the forest and books.
- **Simplifications/gaps:** technical silviculture, individual trees, and machines remain abstract; obligation timing/cost may be placeholder; title/permit responsibilities remain RR and configurable.
- **Provenance:** verified cost anchors separated from inferred/placeholder components.

### 11. Yard, sorting, owned truck, driver, employee, and recurring lane

- **Modules/files:** `src/model/{yard,yard_conduct_policy,truck,employee,lane}`, `src/systems/{yard,sorting,fleet,payroll,lanes,auto_dispatch}`.
- **Minimum UI:** yard inventory/capacity, gate and grading/measurement choices, conduct consequence history, simple sorting, fleet/employee roster, utilization, lane stability/child loads, inspect/override controls, and auto-dispatch preview.
- **Simulation logic:** handling/storage cost, degradation, composition split/loss; player ethical or opportunistic grading/measurement choices with adaptive detection, disputes, relationship/reputation/employee consequences; one truck + driver; one employee; opt-in recurring lane that proves stability through clean repetitions, preserves child lineage/cost/volume/exceptions/summaries, and is inspectable/overridable; conservative auto-dispatch PH.
- **Data:** one yard, truck/driver/wage/cost values PH/tunable, sorting €2-4/m³ anchor.
- **Tests:** yard capacity, sorting conservation/loss, deterministic player-conduct detection and consequences, payroll, driver requirement, utilization, new-route individual visibility, clean-repetition qualification, forced individual disputed/exception/contract-critical loads, lineage and volume conservation, lane override, auto-dispatch information boundary.
- **Acceptance:** wood travels through the yard and exposes meaningful fictional grading/measurement agency with mirrored risks; a stable opt-in lane may aggregate routine flow while protected loads remain individual, and every child, cost, volume, exception and report reconciles and remains inspectable/overridable.
- **Simplifications/gaps:** conduct begins with one ethical and one opportunistic path; detection/consequence values are tunable; lane stability count is tunable; employee work is capacity tokens; maintenance and automation remain coarse.
- **Provenance:** sorting range `[TUNABLE]`; official wage may anchor market, role wage remains labeled.

### 12. Frame agreement and fulfillment

- **Modules/files:** `src/model/contract`, `src/systems/{contracts,allocation,settlement}`.
- **Minimum UI:** one contract card with volume, tolerance, price basis, period progress, projected shortfall.
- **Simulation logic:** allocate delivered measured volume; retro bonus or penalty; breach/renegotiation placeholder; relationship result.
- **Data:** one fictional buyer agreement; terms tunable and clearly not asserted universal practice.
- **Tests:** boundary at tolerance, measured-volume fulfillment, bonus settlement, missed-volume consequence.
- **Acceptance:** contract changes routing value and produces a real consequence if missed.
- **Simplifications/gaps:** one period and one price basis; cover/renegotiation later.
- **Provenance:** structure `[LOCKED/RESEARCH-UPDATED]`; numeric terms tunable.

### 13. Port, charter quote, export buyer, and export flow

- **Modules/files:** `src/model/{port,charter}`, `src/systems/{port,export,sea_transport}`.
- **Minimum UI:** port stock/handling view, one quote, cargo readiness, export timeline.
- **Simulation logic:** aggregation threshold, document check, quote validity/acceptance, capacity reservation, handling, transit, export buyer measurement/payment.
- **Data:** one Latvian port node, one fictional European buyer, one quote, one export market; skeleton cargo threshold scaled if needed for test speed.
- **Tests:** insufficient cargo, expired quote, missing docs, cash lock through transit, delivery/receivable.
- **Acceptance:** timber leaves a domestic batch trail, aggregates at port, sails, and settles without bypassing money/time/documents.
- **Simplifications/gaps:** one route; sea rates PH/RR; scaled cargo explicitly marked as skeleton-only if below researched 2,000-5,000 m³.
- **Provenance:** capacities/destinations research-updated; transit inference and quote values labeled; no public tariff invented.

### 14. Markets, seasons, regime change, events, and analytics

- **Modules/files:** `src/model/{market,regime}`, `src/systems/{markets,seasons,shocks}`, `src/reporting/{deals,inventory,utilization,analytics}`.
- **Minimum UI:** causal news/event feed; simple market chart; completed-deal ledger; expected-vs-realized buyer/supplier views; B-equivalent cost.
- **Simulation logic:** separate assortment pressure; one export-demand driver change propagates through AI/buyer demand to cards; seasonal access/degradation; analytics from stored estimates/outcomes.
- **Data:** price anchors/series, market driver weights PH/tunable, seasonal windows, one regime transition.
- **Tests:** no price change without cause event, assortment divergence, spring road restriction, summer freshness loss, analytics detection over repeated measurements.
- **Acceptance:** one regime change alters a later routing/sorting decision and its full causal chain is inspectable.
- **Simplifications/gaps:** few drivers and one transition; not balanced.
- **Provenance:** sourced series remain anchors, not copied static future prices; all driver weights labeled.

### 15. Connected golden scenario and headless balance runner

- **Modules/files:** `src/headless/{runner,policies,metrics}`, `tests/scenarios/first_full_skeleton`, `data/scenario_first_full.json`.
- **Minimum UI:** scenario launcher, seed display, debug/admin panel, completion summary.
- **Simulation logic:** scripted initial opportunities plus policy-driven continuations using the same command API; batch runs with metric aggregation.
- **Data:** fixed seed scenario containing all milestone objects and one alternative seed set.
- **Tests:** golden event hash, ledger reconciliation, volume conservation, replay/save equivalence, AI information boundary, long-run invariant/property tests.
- **Acceptance:** one headless scenario produces an offer, prepared auction, standing placeholder/harvest, yard sort, domestic measurement/receivable/payment, completed deal, contract progress, competitor action, regime change, owned/hired logistics, lane, port/charter/export, and reports—with no invariant failure.
- **Simplifications/gaps:** policies are intentionally naive; metric output may be JSON/CSV; runs diagnose dominance but do not certify balance.
- **Provenance:** output includes config hash and counts/outcomes grouped by provenance category where relevant.

## Required milestone inventory

The scenario must instantiate: dashboard; starting cash; cash ledger; receivables/payables; one loan; all species/assortments; quality composition; compatibility; demand; supplier offers; prepared and standing auctions; inventory; Latvia/Europe-ready map; hired logistics; one owned truck/driver; manual dispatch and auto placeholder; one lane; one yard/sort; one standing opportunity and forest asset; harvest estimate and multi-outturn; one non-driver employee; one competitor; one regime change; one frame agreement; one relationship contact; one port/quote/export buyer; one document set; one measurement; one receivable; one completed deal; profitability reporting; and one headless scenario.

## Save format

Use a versioned, inspectable envelope (JSON in development; compact encoding later if needed):

```json
{
  "save_schema_version": 1,
  "core_version": "...",
  "config_manifest_hash": "...",
  "scenario_id": "...",
  "seed": "...",
  "game_time": "...",
  "rng_stream_states": {},
  "entity_counters": {},
  "snapshot": {},
  "events_after_snapshot": [],
  "player_preferences": {}
}
```

Never serialize UI component state as simulation truth. Store stable IDs and provide migrations; retain the config bundle/hash needed for replay.

## Deterministic test strategy

- Unit tests for value objects, posting rules, price/quality calculations, and state machines.
- Property tests for money reconciliation, nonnegative/nonduplicated volume, capacity, ownership, and monotonic time.
- Golden scenario tests using seed + command script + event/state checksum.
- Metamorphic tests: UI speed changes cannot change results; save/load cannot change results; reporting on/off cannot consume RNG; adding unseen intel cannot alter another actor’s decision.
- Distribution tests over many seeds check bounds and monotonic relationships without expecting one exact outcome.

## Headless balance approach

Run the identical core at maximum speed with several deliberately simple policies (spot trader, quality/sorting, contract volume, logistics owner, conservative cash manager). Sweep seeds and tunable config, then report survival, insolvency cause, net margin, cash-conversion days, turnover, inventory age/loss, utilization, contract performance, market share, concentration, and strategy dominance. A future 1,000-game-year run is a capacity goal; the skeleton first proves deterministic batches and invariant stability over shorter horizons.

## Minimal debug/admin panel

Development-only views should show:

- seed, clock phase, next events, RNG stream counters, and state checksum;
- world truth beside selected actor belief/intel (explicitly labeled);
- buyer stock/hunger/traits and price-card causal breakdown;
- batch ancestry, reservations, ownership, custody, location, and cost layers;
- company cash, claims, credit, AI valuation/decision reasons, and solvency;
- market drivers/regime, capacity utilization, document/permit state;
- provenance drill-down for every configured number;
- invariant failures and command/event trace.

The panel may reveal hidden state only in debug builds and must be unable to mutate production simulation state except through explicit admin commands recorded in the event log.

## UI decoupling rule

UI components render read models and submit commands such as `AcceptOffer`, `PlaceBid`, `QueueTransport`, or `DisputeMeasurement`. They do not import rule implementations, advance time, draw RNG, post ledgers, or mutate entities. Calculators exposed to the UI are pure projections using public/player-known inputs; authoritative execution repeats validation in the core and emits events.

