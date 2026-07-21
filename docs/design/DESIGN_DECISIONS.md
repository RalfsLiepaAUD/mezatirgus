# DESIGN_DECISIONS.md — Locked Design Decisions

This is the highest-authority product document. Where it conflicts with older planning, generic design intuition, implementation convenience, prototypes, or assumptions, this document wins. Do not silently redesign locked decisions. Missing numbers must be centralized and labeled.

Status: `[LOCKED]` decided; `[TUNABLE]` structure locked and number adjustable; `[RESEARCH-UPDATED]` anchored by source research; `[FIRST-HAND]` product-owner industry experience; `[DESIGN-INFERENCE]` gameplay structure inferred from evidence; `[PLACEHOLDER]` temporary centralized assumption.

## 1. Design laws [LOCKED]

1. The cash conversion cycle is the game: suppliers and logistics are paid before buyer measurement and settlement.
2. Every market move has a discoverable cause. Do not add meaningless random price noise.
3. Net company margins are narrow, broadly 2–6%. Growth comes from turnover, volume, information, and efficiency.
4. Research-backed values are used where supported; every other value is explicitly tunable or placeholder.
5. Hidden information must be learnable through inspection, records, relationships, employees, and repeated experience.
6. The mirror applies: once the player owns a yard, the player becomes buyer, grader, gatekeeper, and relationship manager.
7. Strategy depends on market regime; no build dominates every state.
8. The player is one company in a finite shared economy.
9. Competitors do not cheat; they use noisy information, make mistakes, and can fail.
10. The simulation remains losable through liquidity, receivables, leverage, inventory, contracts, and operational failure.

## 2. Time [LOCKED]

The game is pausable real-time with a deterministic tick-based core, seeded RNG, pause/1x/3x/fast controls, configurable auto-pause, and headless execution. Approximately three game weeks pass in five real minutes at normal speed. Planning, routing, dispatch-queue changes, and bookkeeping occur while paused; deliberation is never punished.

## 3. Seasons [LOCKED; numbers TUNABLE]

Winter increases harvest and supply pressure. Spring thaw restricts gravel-road access and can make mills hungry. Summer creates birch freshness/degradation risk and possible purchase stops. Autumn wet ground limits access. Seasons affect harvesting, transport, buyer stock/hunger, degradation, supply, and spreads.

## 4. Money and cash flow [LOCKED; RESEARCH-UPDATED]

- Buyer payment terms are buyer-specific, broadly 2–30 days, with seeded variation around stated terms. Later drift is a distress signal.
- Some buyers offer instant payment at approximately €5/m³ discount `[TUNABLE]`.
- Forest owners and small crews normally expect fast payment; speed builds reputation.
- Large traders may offer supplier advances; the player can unlock advances later.
- Working-capital facilities, factoring, credit insurance, and leasing are later financial tools.
- There is no futures/hedging market; price risk is managed physically.
- The UI permanently distinguishes free cash, committed payments, and receivables.
- Ordinary domestic B2B timber transactions between VAT-registered Latvian companies have no VAT cash movement in the core timber engine `[VERIFIED]`.

## 5. Quality [LOCKED]

Birch veneer material uses A/B/tara (C)/brāķis. Tara has two entry paths: under-diameter and poor form despite sufficient diameter. A-grade is embedded rarity, never routine whole-truck A loads. QualityComposition records grade and diameter-bracket fractions, freshness/felling date, and certainty. Player loading choices may allocate known composition, but outcomes remain uncertain until measurement. Numeric distributions, thresholds, and prices are data-driven and tunable.

## 6. Buyers and measurement [LOCKED]

Buyers are fictional and specialized by species, assortment, diameter, quality, certification, and documents. Price cards are calculated outputs from stock, capacity, consumption, planned intake, season, competition, market regime, export demand, and commitments.

Buyer hunger affects price, C-tolerance, gate acceptance, grading strictness, purchase stops, and inbound calls. The gate can accept, flat-reprice, or refuse visibly unsuitable loads. A grading/measurement act determines payable volume and bracket/quality allocation.

Fictional buyer traits may include honest or conservative measurement, volume shaving, bracket-boundary shaving, and adaptive behavior based on supplier vigilance `[FIRST-HAND/TUNABLE]`. These behaviors are distributions, never universal claims or attributions to real companies. Relationships affect outcome branches and access, not automatic price.

## 7. Measurement disputes and the mirror [LOCKED]

There is no measurement-checking minigame. Rare disputes arise when a measurement act diverges from the player estimate; dispute power depends on estimation evidence. Expected-versus-realized analytics reveal systematic differences over time.

Once the player operates a yard, supplier-side quality pressure mirrors mill-side pressure: gate checks, repricing, refusals, abuse escalation, blacklists, grading reputation, and effective cost per B-equivalent m³.

**Player-side grading and measurement conduct [LOCKED — mirror implementation]:** this implements the existing mirror decision rather than introducing a new design direction. Once the player operates a yard, the player may choose opportunistic or unethical grading and measurement conduct. The same adaptive detection logic, relationship effects, dispute risk, reputation damage, employee consequences, and long-tail commercial risk that apply to fictional mills apply to the player. Misconduct is not universally optimal and must not be sanitized into only strict-versus-lenient conduct within the rules. Preserve meaningful moral and commercial agency. Conduct and counterparties are fictionalized; never attribute wrongdoing to a real company.

## 8. Buying and forestry channels [LOCKED at concept level]

Buying channels include private roadside offers, recurring contacts, prepared-roundwood auctions, standing-timber auctions and private sales, forest property, distressed trader sales, and supplier advances.

Standing timber and forest purchases automatically generate commercial HarvestEstimates covering cutting, forwarding, road preparation, roadside assortment outturn, schedule, and major risk. Technical forestry operations, machines, cutting patterns, detailed ecology, and silviculture remain abstract.

A forest or standing purchase may yield several species, assortments, roadside batches, loads, destinations, invoices, and measurements while remaining one Deal.

**Forest-obligation implementation [LOCKED]:** after harvest, reforestation becomes a scheduled cost and obligation. Forest assets retain a coarse regeneration state. Technical silviculture remains abstract. Obligations are generic scheduled entities from the start so later forest-depth expansion does not require architectural rework.

Exact permit responsibility remains configurable and research-required where evidence is uncertain.

## 9. Auctions [LOCKED structure; exact mechanics ASSUMED/RESEARCH_REQUIRED]

Support prepared-roundwood and standing-timber auctions, registration, deposits/guarantees, fixed €/m³ increments, late-bid extension, payment/removal deadlines, public result history, AI bidders, identity reveal after close, documents, penalties, and failed-payment/removal outcomes. Bid UI always shows €/m³ and total; uncapped auto-bids are forbidden.

The corrected v2 auction reference is available and is the only auction-law/mechanics reference. Exact deposit, increment, extension, payment, removal, penalty, tolerance, and title-transfer values remain configurable `[ASSUMED]` / `RESEARCH_REQUIRED` parameters and must not be presented as verified Latvian law or LVM contract fact.

## 10. Selling, contracts, and exports [LOCKED at concept level]

Selling channels include domestic spot buyers, frame agreements, contracts, trader-to-trader sales, port aggregation, short-sea export, long-haul export, and emergency fallback markets.

Contracts model period volume, schedule tolerance, fixed or indexed prices, retro bonuses, penalties, renegotiation, and cover. Export requires port aggregation, documents, handling, vessel/charter quotes, transit time, and working capital. Sea freight is quoted per cargo, not a static universal tariff. All in-game counterparties are fictional.

## 11. Competitors and aggregation [LOCKED]

The world contains 8–12 named fictional competitors plus a small-trader cloud. Timber, buyer capacity, auctions, trucks, employees, and contracts are finite. AI uses noisy beliefs, pays real costs, can overbid or overcommit, and can become distressed. Real firms and financials calibrate only; never copy identities or attribute unverified conduct.

AI flows may use statistical resolution until they touch the player. Early and medium player operations retain individual TimberBatch, Load, and TransportJob records.

**Load aggregation ceiling [LOCKED]:** aggregation is opt-in. Exception loads, disputed loads, contract-critical loads, and loads on new routes always remain individually visible. A recurring lane may aggregate routine flow only after several clean, successful repetitions prove the route stable. Aggregated flows preserve child lineage, costs, volume conservation, exception records, and reporting summaries. The player can inspect and override every lane.

## 12. Relationships and information [LOCKED]

Named recurring contacts include owners, crews, traders, buyers, carriers, employees, and lenders. Fast payment, consistent dealing, and favors build warmth/trust. Abuse, broken commitments, disputes, and late payment damage access and can lead to refusal or blacklist. Intelligence comes from public results, price cards, commentary, suppliers, traders, competitors, employees, and later analysts. World truth and each actor’s beliefs remain separate.

## 13. Logistics, yards, and employees [LOCKED]

Transport includes hired spot carriers, dedicated contracts, owned trucks, drivers, location, payload, partial-load penalties, route distance, access, waiting, multi-point loading, maintenance, utilization, manual/automatic dispatch, and recurring lanes. Small traders pay higher spot rates than efficient contracted/own-fleet floors.

Yards store, degrade, grade, measure, and sort inventory, turning the player into the buyer under the mirror rule. Sorting value depends on assortment spreads and must include handling cost and loss. Employees add wages, capacity, knowledge, and consequences rather than free modifiers.

## 14. Markets [LOCKED]

Veneer, sawlog, pulpwood, and energy markets have different drivers. Market changes propagate through agent behavior and conserved supply/demand, never direct arbitrary price edits. MarketRegime is first-class: steep spreads favor sorting; flat spreads favor volume/logistics and make yard overhead dangerous.

## 15. Central object model [LOCKED]

`Deal → AcquisitionLot / TimberLot → TimberBatch[] → Load[] → MeasurementEvent[]`.

Deal is the commercial/accounting identity. AcquisitionLot ties ownership, supplier terms, documents, and purchase cost. TimberBatch is homogeneous physical volume at one location. Load moves compatible portions. MeasurementEvent records buyer measurement, grading, payable value, and dispute state. Estimates remain alongside outcomes for analytics.

## 16. Development and data rules [LOCKED]

Build an ugly but connected full skeleton before polishing. Every major object type is represented; later-stage objects may initially be seeded, read-only, or one-path implementations. Systems exchange timber, money, location, time, and information.

The simulation is UI-independent, deterministic, data-driven, testable, persistable, and headless-runnable. Numeric assumptions live in centralized machine-readable configuration with source file/locator, provenance category, confidence, tunable flag, and research-required flag. Hardcoded magic numbers are bugs.

Identifiers are deterministic stable IDs generated from persistent per-entity-type counters, optionally readable (for example `DEAL-000001`). UI labels are never relational keys. Money uses integer minor units plus currency; volume uses integer thousandths of a cubic metre; rates use integer minor units per cubic metre; proportions use basis points.
