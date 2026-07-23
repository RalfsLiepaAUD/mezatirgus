PROCUREMENT_DESIGN.md — Canonical Timber Procurement Design

Status: TARGET DESIGN — PARTIALLY IMPLEMENTED

- **Implemented today**: the supplier/offer/relationship slice this design builds on already exists — recurring fictional suppliers, roadside offers, documents, relationships, and intel, as reported in docs/systems/STEP_7_SUPPLIERS_OFFERS_DOCUMENTS_RELATIONSHIPS_AND_INTEL.md. That is the current as-built authority for what actually runs today.
- **Target (not yet built)**: everything below — the four-layer PhysicalPile → CanonicalOpportunity → CompanyView → Deal model, per-pile competitive views, negotiation state, certification progression, and the regional supply model — is design intent, not shipped behavior.
- **Research-required**: certification premiums, audit practice, regional densities, and receiving-hour norms remain `[RESEARCH_REQUIRED]`/`[TUNABLE]` as already flagged throughout this document; treat those markers as still open.

1. Status and scope

Scope: Timber procurement, finite regional supply, offer discovery, shared competition, supplier relationships, mill demand, receiving windows, and certification handling.
Supersedes earlier procurement drafts and clarification notes only. It governs the buying-and-placing gameplay of Mežtirgus and is constrained by DESIGN_DECISIONS.md (shared finite economy, causal prices, learnable hidden information, cash-conversion core). It is written for human developers and coding AIs. Nothing here locks uncertain real-world numbers: certification premiums, audit practice, regional densities, and receiving-hour norms are [RESEARCH_REQUIRED] or [TUNABLE] and live in configuration with provenance.

2. Settled design decisions
The player starts as a registered timber-trading SIA holding valid basic FSC Chain-of-Custody certification. FSC 100% and Controlled Wood handling work from day one.
Certification progression is maintenance and expansion, not acquisition: audit standing, trust, supplier claim coverage, premium outlet access, findings/suspension risk, later multi-site scope.
Clean documentation is automatic; certification surfaces as gameplay only at meaningful exceptions or temptations.
Mature early-game flow targets 3–6 new contacts/opportunities per day and 8–15 visible opportunities, ramping up from a quieter day one as reputation grows.
No single supplier spams offers; network-level activity comes from many quiet nodes with per-supplier cadence caps.
Gluts raise seller-side activity and degrade average quality; shortages reduce offers and raise mill-demand pressure. Total decision load stays roughly constant; the pressure moves.
The four-layer model is canonical: PhysicalPile → CanonicalOpportunity → CompanyView → Deal. One pile, one opportunity, many private views, one atomic winner.
Regional supply runs on the minimal seven-variable model (§5). Only roadside piles are individually simulated in v1.
Supply never spawns; every offer traces to a pile, every pile to a harvest decision, every decision to market state, with realistic lag.
Implementation follows the six milestones in §14.
3. Core gameplay loop

Scan → Evaluate → Secure → Schedule → Place → Deliver → Settle → Reputation feedback.

The player watches a live board of concurrent opportunities (incoming offers, outbound findings, mill requests), evaluates them against cash, freshness, transport, and demand, secures wood by negotiating price / volume basis / payment speed, schedules pickup against mill receiving windows, delivers into the existing gate/measurement systems, collects on terms, and every settled deal updates relationships and reputation — which changes what the board shows next. Offers coexist and persist; the player prioritizes among many, never resolves one forced offer at a time. Procurement runs in both directions: sellers contact the player, the player calls suppliers, and mills contact the player with volume requirements.

4. Domain model

PhysicalPile (world truth, exists once). Location, owner reference, true composition and volume (hidden), felling date, access class, claim status, state (standing → roadside → sold → removed). Never duplicated.

CanonicalOpportunity (market fact, one per pile-for-sale). Pile reference, owner's current ask, offered volume basis, patience/deadline state, set of aware companies, status (open → under-negotiation(s) → committed → closed). The object all companies race on.

CompanyView (private, one per aware company). That company's beliefs: estimated composition with confidence bands, relationship context with the owner, its own negotiation state (last offers/counters), inspection results, awareness source (call, gossip, agent). AI views are structurally identical to the player's — same object, different owner. Buy-side hidden-information gameplay lives here.

Deal (created at commitment). Snapshot of the winning view plus final terms (price, volume basis, claims, payment speed). The pile's remaining lifecycle (pickup, transport, gate, measurement) hangs off the Deal via the existing Deal → Lot → Batch → Load → MeasurementAct spine. Losing companies' views become dead intel with a cause ("sold to X").

Integration: piles are Lot precursors; receiving windows are TransportJob constraints; claims live in DocumentSet/QualityComposition. No new architecture.

5. Finite regional supply model

Per region (v1 = one region), deterministic under seeded RNG, all counters/queues:

standing_stock[species] — m³ counter; slow annual regeneration; hard floor.
owner_pool — owner count plus a monthly harvest-propensity scalar (no individual owners).
contractor_capacity — harvest slots per month (integer; seasonal modifier).
harvest_queue — FIFO of (volume, species-mix template, decision date); the price-lag mechanism.
pile_list — the only individually simulated entities: ~10–60 active pile records.
price_signal — trailing average of regional realized prices (what owners perceive).
season_index — from calendar; multiplies propensity, capacity, and access.

Monthly tick: harvest decisions = owner_pool × propensity(price_signal vs threshold, season, jitter), capped by contractor slots → pushed to queue → entries mature after 2–6 weeks → instantiate piles → decrement standing stock. Daily/weekly: piles age (freshness decay), owner patience counts down (ask drops at thresholds; then the owner exits or sells to the abstract market), discovery rolls decide which companies see which piles, competitor purchases consume piles (Tier-2 AIs through their own views; the small-trader cloud as a simple absorption rate; LVM internal flows as a fixed monthly absorption constant).

This preserves, with a deliberately small deterministic core: finite supply, seasonal effects, price response with lag (emergent hog-cycle gluts and shortages), contractor capacity, pile aging, and shared competitor consumption. Not simulated individually in v1: owners, contractor crews, trees, harvest operations, other regions.

6. Discovery and offer-board behavior

A pile is not automatically visible. Companies see it through: owner outreach (probability = relationship reach + pay-fast reputation in the region), outbound calls (the player's targeted daily calls, later agents), and gossip (secondhand, uncertain). Unseen or unbought piles persist and age; "expired" always has a cause — bought by someone else or owner patience exhausted — never a timer.

Density. Mature target: 3–6 new touches/day from a regional catchment of ~40–60 active piles and a network of 15–25 occasional suppliers [TUNABLE]. Per-supplier cadence caps keep individual contacts quiet (an owner sells a few times a year; a contractor crew roughly weekly). Day one shows 1–3 touches/day, ramping with reputation — earned density doubles as tutorial pacing.

Quality mix at target density [TUNABLE]: 2–3 serious, 4–6 mediocre, 1–2 distressed/opportunistic, 2–4 unsuitable. Unsuitable cards are content (they teach market judgment) but must die fast.

Anti-clutter: (a) natural expiry with visible cause; (b) a one-tap pass verb that declines politely without relationship damage and hides the card; (c) the board sorted by at-a-glance attractiveness (estimated margin band, distance, freshness). Scanning takes seconds; there is no inbox management.

Regime behavior: glut → 8–10 touches/day, worse average quality, desperate sellers, full mills. Shortage → 1–3 touches/day, arrogant sellers, and the mill-request side of the board lights up instead.

7. Negotiation and atomic competition

Negotiation state lives inside each CompanyView, never in the opportunity. Multiple companies may haggle over one pile in parallel; the owner entertains them within patience limits. The first company whose terms satisfy the owner's reservation logic commits, flipping the canonical status atomically; the opportunity closes for everyone else with cause sold, and losers' negotiations die with a reason they can observe. One pile, one truth, N beliefs, one winner. No duplication of the physical lot, no locking except at the commit instant. Incoming offers are passive and free, scaling with reputation; outbound calls cost the scarce early resource — attention (≈4–6 meaningful calls/day [TUNABLE]) — and can reach owners before piles become common knowledge.

8. Mill demand and receiving windows

Mills, driven by their existing hunger state and relationship tier, actively issue:

Spot requests ("300 m³ birch 18+ this month, +€2 over card") — accepting creates a commitment feeding the existing cancellation/short-delivery risk tree;
Urgent gap-fills — short deadline, premium, large relationship swing either way;
Frame call-offs — scheduled volumes under agreements, occasionally with extra-volume favor opportunities.

Each mill has receiving windows (typical weekday daytime; some approved-evening; rare 24/7 port yards [RESEARCH_REQUIRED]). A truck outside the window waits — carrier waiting fees, driver-hour limits, overnight freshness/weather exposure. Exceptional late unloading is a favor: gated by relationship tier, granted sparingly, consumed by use, withdrawn if abused. Windows make dispatch a scheduling game: Friday pile + distant mill + summer heat is a real decision.

9. Certification and claims

Start state: valid basic FSC Chain-of-Custody. Claim handling is live from day one.

Claim tags: every batch carries FSC 100%, Controlled Wood, or no claim. A load's claim = the minimum claim among its source batches — mixing downgrades, never upgrades. FSC 100% premium is configurable ≈ €2–5/m³ [PLACEHOLDER/RESEARCH_REQUIRED], paid only by mills that currently need the claim. Controlled Wood is the ordinary bulk category. Commercial downgrade is always permitted: selling certified wood without the claim simply forfeits the premium — routine and sometimes correct.

Day-one gameplay: exactly one recurring micro-decision — per-load claim handling (mixing vs partial loads, premium vs freshness, downgrade when no premium outlet exists).

Invisible when clean: buying properly documented wood from legitimate sellers requires zero certification actions. Certification appears only at exceptions and temptations: a seller with origin-paper gaps at a tempting price, an ambiguous mixed pile, a shortcut under deadline pressure.

Progression: audit standing built by clean history; supplier-network claim coverage; premium outlets unlocked through relationships; later multi-site scope when yards exist.

Consequence ladder (fair, graduated, never hidden dice): minor finding (fix-it obligation, small cost) → suspension (weeks without claim sales; premium outlets pause; relationship damage with claim-dependent mills) → loss (rare; only after repeated knowing violations; costly re-certification). Consequences follow only from choices the player was warned about. Audit cadence, costs, and suspension practice are [RESEARCH_REQUIRED]; the ladder is design, the numbers are config.

10. Relationships and regional employees

Suppliers: stranger → known → first-call → preferred. Advanced by fast payment, fair grading at the player's own yard, and favors (buying distress). Yields earlier calls, better prices, patience, gossip.

Mills: spot seller → request recipient → frame-agreement eligible → privileges (late-unloading approval, gap-fill first refusal). Advanced by clean loads, kept commitments, volume history. Damage is asymmetric; blacklisting remains possible per DESIGN_DECISIONS.md.

Coverage: each region's supplier relationships sum into the share of that region's piles the company ever sees.

Regional procurement employees (mid-game): one agent per region (Vidzeme, Zemgale, Kurzeme, Latgale) adds call capacity, grows local relationships, raises discovery share and estimate accuracy, and costs a wage. Agents use the same skill-vector treatment as AI actors — better ones cost more, are poachable, and arrive with contact books. Early game the player personally covers ~1 region; growth forces the choice between thinning attention and delegating coverage.

11. Player daily workload

Target: 15–25 real decisions per in-game day, each with a number attached. Example day (week 6, ~€19k free):

Morning (paused): board shows 11 items; two new overnight — a mediocre 35 m³ mixed-birch offer at €80 and a distressed 90 m³ contractor lot 140 km out (serious margin, heavy haul, answer by Thursday). One card greyed: "Vidzeme 55 m³ — taken by MEŽAVOTS" (the one slept on; lesson filed). A pinned mill request: 120 m³ spruce sawlogs in 10 days, +€4, two late unloadings pre-approved — 70 m³ secured so far. Triage: pass two junk cards.

Midday (5 calls): two outbound hunting the missing 50 m³ spruce (one contractor holds 30 m³ verbally for Thursday); one probing the birch offer's felling date; one countering the distressed seller €4 under ask — he counters €2 under, deadline stands. One call banked.

Afternoon (paused dispatch): truck A booked for the held spruce, delivering inside the sawmill's Friday window; the distressed lot plus that commits €9,400 against €19k free with the next receivable landing Tuesday. Accept the counter, queue truck B, keep the banked call for tomorrow's spruce gap — knowing Friday may force a choice between an expensive late-unload favor and shorting the request.

Evening (3× speed): trucks roll; gossip lands ("someone's paying 72 for pine roadside in Zemgale"). Day total: ~9 touches triaged, 5 calls spent, 2 commitments, 1 competitor lesson, buffer consciously thinned.

12. Tuning values [TUNABLE]

Touch rates and ramp curve; visible-board size; quality-mix ratios; per-supplier cadence caps; call budget; pile patience and ask-decay curves; harvest-queue maturation lag; contractor slots; discovery probabilities; owner propensity thresholds; freshness decay rates; late-unload favor frequency; premium levels; consequence-ladder thresholds; regime activity multipliers; typical lot sizes (15–60 m³, occasional 100+); mill-request frequency (1–2/month at start, scaling with relationship).

13. Research-required items

Real FSC 100% premium levels and which mill types pay them; CoC audit cadence, cost, and suspension practice; Controlled Wood documentation norms; receiving-hour reality by mill type and late-unloading practice; regional pile densities and supplier-network sizes for catchment calibration; broker commission norms; owner payment-speed expectations by channel.

14. Implementation milestones
M1 — Supply engine: seven-variable regional model, pile lifecycle, one competitor absorption. Headless-verifiable: finite, seasonal, price-lagged.
M2 — Discovery and board: discovery channels, CompanyViews, board UI with triage verbs; canonical/private split proven with an AI as second viewer.
M3 — Negotiation and commit: view-resident negotiation, parallel haggling, atomic commitment, Deal handoff to the existing object spine.
M4 — Demand side: mill requests, receiving windows, the late-unload favor.
M5 — Claims end-to-end: batch tags, min-claim-per-load, one premium-paying mill, downgrade decisions, exception-only certification events.
M6 — Density and regime tuning: headless runs calibrating touch rates, quality mix, and regime flips against the §11 workload target.
15. Explicitly postponed

Regional agents and multi-region coverage; brokers as a full discovery channel; CoC audit simulation depth, multi-site scope, and percentage-claim systems; standing supplier agreements; contractor scheduling depth; receiving-slot booking; owner-psychology depth; gossip-driven pool visibility; mill claim-demand cycles; individual simulation of owners, crews, or non-pile supply objects.
