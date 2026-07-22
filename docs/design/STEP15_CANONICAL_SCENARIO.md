STEP15_CANONICAL_SCENARIO.md — Revised (v2)

Status: replaces v1 of this document. One deterministic, seeded, connected run proving the full skeleton is genuinely exercised. No scope added, no scope removed.

Global conventions for this document:

Money: integer minor units only. 4,000,000 mu = €40,000.00. Every money figure below is written as X mu (€Y).
Event names: every event below is CONCEPTUAL — design shorthand, not a claim that the identifier exists in the repository. DeepSeek must reconcile each against actual command/event names before implementation (§Handoff). Creating new duplicate domain events merely to match this document's wording is forbidden. If canon behavior exists under another name, map to it; if behavior is genuinely absent, that is an E-list finding, not a rename.
RRR = REPOSITORY_RECONCILIATION_REQUIRED — ordering or semantics to be derived from code/canon, not assumed from this doc.
1. Fixtures

World: 1 region; locations FOREST_1, RS_A, RS_B, AUC_SITE_1, YARD_1 (player-controlled, sorting capability), MILL_D1, PORT_1; fixed route distances.

Companies:

PLAYER: cash 4,000,000 mu (€40,000.00); owns YARD_1, TRUCK_1 + DRIVER_1.
COMP_1: AI with deterministic scripted decision policy (see §2); starting cash 2,000,000 mu (€20,000.00) so its commitments are real finance.
AUC_SELLER_1 (generic platform seller — not LVM, per LVM_PROCUREMENT_DESIGN §2), SUPPLIER_S1, SUPPLIER_S2, STAND_SELLER_1, EXPORT_BUYER_1, CARRIER_1.

Physical fixtures vs opportunities — the required flow: P1 (owned by SUPPLIER_S1, at RS_A) and P2 (owned by SUPPLIER_S2, at RS_B) exist as physical piles with hidden-truth composition fixtures. The scenario must then let the real supplier/opportunity pipeline run: physical pile → canonical opportunity generated → company-facing offer appears in each company's view. Direct injection of offers is forbidden; only the piles and their owners are fixtures. Discovery parameters are set so both offers deterministically surface on Day 1 under the seed (RRR: exact discovery mechanism knobs).

Other fixtures: LOT_1 at AUC_SITE_1 (prepared birch, declared spec + hidden truth); STAND_1 (standing timber, outturn fixture guaranteeing ≥2 assortments: veneer logs + pulpwood); CTR_1 (PLAYER↔MILL_D1 supply contract, 60 m³ birch B, current period); CQ_1 (charter quote PORT_1→EXPORT_BUYER_1, test-scale threshold 60 m³, labeled test-scale per DECISIONS_STILL_NEEDED); scripted market driver DRV_PULP armed for Day 15.

MILL_D1 profile: honest meters (bias 0), fixed card 7,000/10,000/11,000 mu per m³ (€70/€100/€110), payment term 10 days (chosen so aging transitions occur inside the run — see Phase D), no instant-pay.

Seed: fixed; all randomness through named RNG streams.

2. Scripted competitor rules

COMP_1 uses a deterministic decision script but interacts with the world exclusively through normal commands: it perceives through its own view, accepts O2 via the standard accept command, creates a real commitment, pays from real cash, receives real ownership and inventory, and its finances post to a real ledger. It never receives injected inventory, injected outcomes, or bypassed validation. The script only replaces the decision brain, never the hands. Its acquisitions must reduce the same finite pools the player draws from.

3. Phases

One world, one continuous run, seven named phases. Each phase lists entry conditions, ordered actions, conceptual events, hard assertions, and the intent of its failure message.

Phase A — Shared procurement (Days 1–3)

Entry: fresh world, fixtures loaded, tick 0 state hash recorded.
Actions: run ticks (supply/discovery pipeline surfaces both opportunities); PLAYER accepts offer on P1; COMP_1 script accepts offer on P2; negative test: PLAYER attempts to accept P2's opportunity after COMP_1's commitment; PLAYER settles the P1 payable.
Conceptual events: OpportunityGenerated(P1), OpportunityGenerated(P2), OfferVisible(→PLAYER), OfferVisible(→COMP_1), OfferAccepted×2, DealCommitted×2, PayableCreated×2, PaymentSettled(P1), OwnershipTransferred(P1), BatchesAvailable(B1@RS_A).
Hard assertions: both offers arrived via the pipeline (assert the opportunity-generation event precedes offer visibility — no injected offers); PLAYER's late accept fails with an explicit closed/unavailable reason and zero mutations; COMP_1's cash decreased by its settlement amount in its own ledger; P1 and P2 are single canonical opportunities each (no duplicates).
Failure intent: "Shared finite procurement is broken: either offers bypass the pipeline, or two companies can buy the same wood."

Phase B — Auction and standing timber (Days 2–8, overlapping A)

Entry: Phase A commitments exist.
Actions: PLAYER places max-bid on LOT_1; COMP_1 script bids a deterministic ladder to 8,500 mu/m³ (€85); auction closes Day 4; PLAYER wins at 8,600 mu/m³ (€86); PLAYER settles; PLAYER accepts STAND_1, settles, schedules harvest; harvest completes Day 8.
Conceptual events: AuctionOpened, BidPlaced×n, AuctionClosed/Won, public-result intel event, PaymentSettled, OwnershipTransferred(LOT_1), BatchesAvailable(B2@AUC_SITE_1); DealCommitted(STAND_1), HarvestRightGranted, HarvestStarted, HarvestCompleted → BatchesAvailable(B3v, B3p).
Hard assertions: bid ladder is deterministic and identical across same-seed runs; the losing bidder's view records the loss; LOT_1 removed from the available world; harvest yields ≥2 distinct assortment batches whose summed volume equals the outturn fixture exactly; COMP_1's bid spending never exceeded its cash (its own affordability checks ran).
Failure intent: "Auction competition or multi-assortment harvest is decorative rather than real."

Phase C — Logistics and yard sorting (Days 5–8)

Entry: B1, B2 exist and are owned.
Actions: hired transport (CARRIER_1) moves B1 RS_A→MILL_D1; owned TRUCK_1 moves B2 AUC_SITE_1→YARD_1; PLAYER sorts B2 at standard depth.
Conceptual events: hired and owned TransportStarted/Completed (distinct cost structures posting), SortingQueued→Started→Completed, children C1..Cn + SortingLoss, CompositionRevealed.
Hard assertions: sorting preconditions verified positively (yard controlled, batch located there, capability present) — and one negative: a sort command against B1 (not at the yard) rejects; Σ(children)+loss = B2 exactly in milli-m³; children's revealed composition equals the hidden-truth fixture partition (deterministic reveal); hired vs owned transport post different cost line items.
Failure intent: "Transport or sorting mutates volume, ignores preconditions, or reveals composition that contradicts world truth."

Phase D — Domestic sale, measurement, receivable, payment (Days 5–19)

Entry: B1 arrives at MILL_D1 (Day 5); sorted children available (Day 8).
Actions: B1 gate submission → accepted → measured (spot sale); Day 9–10: 30 m³ of sorted B children delivered under CTR_1 → measured; receivables age; payments collect on term.
Conceptual events: GateDecision(accept)×2, MeasurementFinalized(M1, M2), ReceivableCreated(R1 due D15, R2 due D20), aging transitions per canonical receivable semantics, CashReceived(R1) D15±0 (deterministic under seed), CashReceived(R2) D19 (early payment permitted by canon distribution — RRR whether early-pay is in scope; if not, D20), ContractProgressed(CTR_1), DealCompleted(D1).
Hard assertions (aging — the corrected checkpoint): R1 must be observed in at least two distinct canonical aging states across the run — e.g., asserted CURRENT at Day 12, asserted transitioned to its canonical due/收-state at Day 15, then terminal paid/collected state after cash — using existing receivable semantics only (RRR: exact state names; do not invent an aging model). Measurement math: M1's payable is recomputed in the test from M1's own payload — Σ(bracket volume × card price) using the 7,000/10,000/11,000 mu card — and must equal the system's payable exactly; the bracket split must be consistent with B1's hidden-truth fixture under honest-meter rules. ContractProgressed counter equals measured (not dispatched) volume. Acquisition estimates for B1/B2 still exist unmutated alongside measurements.
Failure intent: "Revenue is fictional: measurement doesn't do bracket math, receivables don't age, or contracts don't track fulfillment."

Phase E — Market and regime causality (Day 15)

Entry: stable price cards exist; DRV_PULP armed.
Actions: scripted driver fires.
Conceptual chain: driver event → affected agent state change (e.g., EXPORT_BUYER_1 intake/appetite) → recalculated price card publication → regime metric recomputation → regime-change event. The exact ordering and event vocabulary of this chain is RRR — derive from DEPENDENCY_GRAPH.md tick order (market drivers update phase 7, buyer demand/cards phase 8) and the market design docs; this document specifies only the requirement: every link carries a cause reference to its predecessor, and the chain from driver to card is reconstructable from events alone, length ≥2.
Hard assertions: zero price-card changes anywhere in the run lacking a cause chain; the regime metric's before/after values are both recorded; no other card moved without cause during the driver turbulence.
Failure intent: "Design law 2 is violated: prices moved without discoverable cause, or causality is asserted in prose but absent from events."

Phase F — Port, charter, export (Days 16–26)

Entry: B3p + tara-class children exist; regime shift has occurred.
Actions: transport pulp/tara volumes to PORT_1 across multiple loads; aggregate ≥60 m³; accept CQ_1; vessel loads, departs, delivers; export settles per quote terms.
Conceptual events: PortIntakeRecorded×n, CharterAccepted, VesselScheduled/Loaded/Departed, ExportDelivered, ExportSettled → receivable or cash per CQ_1 (RRR: settlement semantics).
Hard assertions: port inventory equals Σ(intakes) before loading and decrements exactly by loaded volume; charter cannot be accepted below threshold (negative test at 59.9 m³ if cheap to include — else minimal variant omits, expanded includes); export settlement amount recomputed from CQ_1 terms × loaded volume, exact.
Failure intent: "Export is a façade: port aggregation doesn't conserve volume or settlement ignores contract terms."

Phase G — Final reconciliation and reports (Day 30)

Entry: all receivables terminal, all transports complete.
Actions: generate final reports; run global assertions.
Hard assertions:

Conservation (global): Σ(fixture pile/lot volumes + harvest outturn) = Σ(mill-measured + exported + remaining inventory + all recorded losses), exact in milli-m³ — computed by the test from event payloads.
Finance: ledger balanced every tick; closing cash of PLAYER recomputed independently in the test by folding every cash-affecting event payload from 4,000,000 mu forward — must equal system state exactly; same check for COMP_1; free/committed/receivable header reconciles at Days 2, 5, 12, 15, 26, 30; zero VAT entries; zero negative-cash ticks.
Deal P&L: D1's P&L recomputed by hand in the test (M1 revenue − P1 cost − hired haul) — exact match; auction-deal P&L includes sorting cost, loss value, and both hauls per the cost-basis allocation rule.
Reports: report generation consumes zero RNG (economics identical with reports on/off).
Failure intent: "The books don't close: somewhere, money or wood appeared or vanished."
4. Determinism assertions (whole-run)

Two same-seed runs → identical canonical domain state and event payload/ordering, excluding only demonstrably nondeterministic metadata (each exclusion listed and justified, and logged as a serialization-cleanup recommendation). Save at Day 18 → reload → continue ≡ uninterrupted run.

5. Strengthened coverage manifest

The scenario fails, by name, if the event log lacks any required conceptual capability (mapped to real events at reconciliation): opportunity generation, offer via pipeline, competitor acquisition, auction win, multi-assortment harvest, hired transport, owned transport, sorting with loss, gate decision, measurement, receivable creation, ≥2 aging states, cash collection, contract progress, cause-chained card publication, regime change, port intake, export settlement, report generation.

Presence is necessary but never sufficient. Every required system additionally carries one meaningful payload/state assertion, and no assertion may pass because an object or state key merely exists. The non-negotiable four: measurement proves real bracket/grade math (hand recomputation); competitor acquisition proves finite-pool reduction (the failed late-accept); P&L recomputed independently from payloads; closing cash recomputed independently from payloads.

6. Runtime and CI budget
Simulated span: 30 game days (was 35; nothing needed the last five).
Estimated events: ~150–300 total (dominated by tick-phase events; RRR once tick verbosity is known).
Expected runtime post-optimization: single-digit seconds in CI; if >30 s, that's a performance finding, not a reason to shrink the scenario.
In the golden CI scenario: everything in §3–§5, single seed.
Nightly / separate integration tier: 5-seed matrix; gate flat-reprice branch; measurement-dispute prompt; claim-segregated sort + premium outlet; COMP_1 overcommit→distress variant; charter under-threshold negative test if omitted from minimal; long-horizon (3-game-year) balance smoke.
7. DeepSeek handoff — inspect before writing any code
Event/command inventory: list actual repository names for every CONCEPTUAL event above; produce a two-column mapping table (conceptual → real). Where no real counterpart exists, flag as a capability gap for human review — do not create a new event to satisfy this document's vocabulary, and do not duplicate an existing behavior under a new name.
Receivable semantics: extract the canonical aging states and transition triggers from code; report them; the Phase D assertions then bind to those exact states.
Market chain order: trace the real driver→agent→card→regime pathway through the tick phases; report actual ordering and cause-reference fields; Phase E binds to that.
Discovery knobs: identify what parameters make both Day-1 offers deterministic under the seed; report them; fixtures set them explicitly.
Settlement semantics for export (receivable vs immediate cash) per existing charter/quote design.
Unit audit: confirm all money flows in the scenario path are integer minor units end-to-end; report any float contact points as defects.
Only after 1–6 are reported and reviewed: implement fixtures, the COMP_1 script, and the test harness. Anything discovered mid-implementation that contradicts this document goes to the deviation register, not into silent adaptation