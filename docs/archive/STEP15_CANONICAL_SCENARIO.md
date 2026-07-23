Status: ARCHIVED — DESIGN SOURCE, NOW IMPLEMENTED
Current canonical golden scenario:
docs/scenarios/STEP15_GOLDEN_SCENARIO.md (implementation: src/headless/step15.ts,
tests: tests/step15-scenario.test.ts)

This v3 document was the pre-implementation design/correction brief for the
canonical Step 15 golden scenario. It was subsequently implemented in full
(see the current canonical document above). The CONCEPTUAL / RRR (repository
reconciliation required) / "DeepSeek handoff — inspect before code" language
below reflects that pre-implementation state and must not be read as a
statement that implementation is still pending. Retained for historical design
rationale only — do not treat as current implementation authority.

---

STEP15_CANONICAL_SCENARIO.md — v3

Status: replaces v2. Correction pass applied from the source audit of the canonical repository. Seven phases and the full connected-run goal preserved. No scope added.

Change log (v2 → v3):

Pricing correction: bracket/grade pricing inside one measurement removed; MILL_D1 now holds three assortment-specific PriceCards with one flat finalRateMinorPerM3 each; measurements recompute acceptedVolumeMilliM3 × rate / 1000.
Contract-progress correction: progress tracked via FrameAgreement + AgreementDeliveryRecorded accepted volumes; Deal.recognizedVolumeMilliM3 removed as a fulfillment basis.
Market-causality correction: single driver→regime chain replaced by two separately proven causal pairs using payload cause references only.
Harvest correction: harvest yields one batch per species (10,000 bp species purity) carrying assortment/quality basis-point distributions; assortment separation deferred to yard sorting.
Port/export correction: no production port ledger or PortIntakeRecorded; port inventory and export-batch location proven test-side; settlement depletion asserted against recorded batch IDs.
Report/coverage correction: ReportGenerated removed as a production event; reconciliation is pure test-side reads; coverage manifest rewritten accordingly.

Conventions: money in integer minor units, 4,000,000 mu = €40,000.00. Event/field names written LikeThis that appear in the audit corrections are CONFIRMED (exist in the repository). Names marked CONCEPTUAL still require reconciliation; creating duplicate domain events to match this document's wording remains forbidden. RRR = repository reconciliation required.

1. Fixtures

World: 1 region; FOREST_1, RS_A, RS_B, AUC_SITE_1, YARD_1 (player-controlled, sorting-capable), MILL_D1, PORT_1; fixed route distances.

Companies: PLAYER — cash 4,000,000 mu (€40,000.00), owns YARD_1, TRUCK_1+DRIVER_1. COMP_1 — scripted-policy AI, cash 2,000,000 mu (€20,000.00), normal commands only, real ledger (script replaces the brain, never the hands; no injected inventory or outcomes). Plus AUC_SELLER_1 (generic seller, not LVM), SUPPLIER_S1/S2, STAND_SELLER_1, EXPORT_BUYER_1, CARRIER_1.

MILL_D1 pricing (corrected): three assortment-specific cards, one flat rate each:

ASSORT_V_18_25 → 10,000 mu/m³ (€100)
ASSORT_V_26P → 11,000 mu/m³ (€110)
ASSORT_THIN → 7,000 mu/m³ (€70)

Honest measurement; brāķis isolated per load via gradeAllocations rejection only. Payment term 10 days (so aging transitions occur in-run).

Physical fixtures: pile P1 (SUPPLIER_S1 @ RS_A): 40.000 m³, hidden truth = ASSORT_V_18_25 profile with 2.000 m³ brāķis. Pile P2 (SUPPLIER_S2 @ RS_B): COMP_1's target. Auction lot LOT_1 @ AUC_SITE_1: 58.000 m³ prepared birch, declared spec + hidden truth. Standing lot STAND_1: removed-volume fixture 55.000 m³, realized roadside 52.000 m³ (residue loss 3.000), two species: birch 34.000 m³ (mixed veneer/pulp assortment distribution) and spruce 18.000 m³ (pulp-dominant distribution). CTR_1: FrameAgreement PLAYER↔MILL_D1, committed 60,000 milli-m³ of ASSORT_V_18_25, tolerance per canon. CQ_1: charter quote PORT_1→EXPORT_BUYER_1, threshold 60 m³ (test-scale, labeled), rate 6,500 mu/m³ (€65). Scripted MarketDriverUpdated armed Day 15; scripted MarketRegimeChanged armed Day 16.

Opportunity flow (unchanged from v2): P1/P2 are physical fixtures only; canonical opportunities and company-facing offers must emerge through the real supplier/opportunity pipeline. Direct offer injection forbidden. Discovery knobs set for deterministic Day-1 surfacing (RRR: knob identification).

Seed: fixed; named RNG streams.

2. Phases
Phase A — Shared procurement (Days 1–3)

Entry: fresh world, tick-0 hash recorded.
Actions: ticks surface both opportunities via pipeline; PLAYER accepts P1's offer; COMP_1 accepts P2's; negative test — PLAYER attempts P2's opportunity post-commitment; PLAYER settles P1 payable.
Events: opportunity generation ×2, offer visibility ×2, acceptance ×2, commitments, payables, PaymentSettled(P1), ownership transfer, BatchesAvailable(B1@RS_A) — all CONCEPTUAL pending mapping.
Hard assertions: opportunity-generation precedes offer visibility (no injection); late accept fails with explicit closed reason and zero mutations; COMP_1 ledger cash decreased by its own settlement; one canonical opportunity per pile.
Failure intent: shared finite procurement broken — offers bypass the pipeline or two companies bought the same wood.

Phase B — Auction and standing timber (Days 2–8)

Actions: PLAYER max-bids LOT_1; COMP_1 ladder to 8,500 mu/m³; close Day 4, PLAYER wins at 8,600 mu/m³ (€86) → payable 58.000 × 8,600 = 498,800 mu (€4,988.00); settle; ownership → BatchesAvailable(B2). PLAYER accepts STAND_1, settles, schedules harvest; completes Day 8.
Events: auction open/bids/close/win + public-result intel (CONCEPTUAL); harvest lifecycle → one batch per species: B3_BIRCH (34.000 m³), B3_SPRUCE (18.000 m³).
Hard assertions (harvest, corrected): exactly one batch per expected species, each at 10,000 bp species purity; each carries the expected assortment basis-point distribution from the fixture; Σ species-batch volumes = 52.000 m³ realized; residue loss = removed − realized = 3.000 m³ recorded; deterministic bid ladder; LOT_1 removed from world; COMP_1 never bid beyond its cash.
Failure intent: auction competition or species-level harvest conservation is decorative.

Phase C — Logistics and yard sorting (Days 5–8)

Actions: hired CARRIER_1 moves B1 → MILL_D1; owned TRUCK_1 moves B2 → YARD_1; sort B2 (standard).
Events: hired + owned transport lifecycles (distinct cost postings); sorting queue/start/complete; children + loss; composition revealed.
Children fixture: C1 30.000 m³ (ASSORT_V_18_25), C2 6.000 m³ (ASSORT_V_26P), C3 20.500 m³ (ASSORT_THIN/tara profile), loss 1.500 m³ → Σ = 58.000 ✓.
Hard assertions: sort preconditions positive at YARD_1 and negative for B1 (not at yard → reject); exact conservation; revealed compositions equal hidden-truth partition; hired vs owned cost line items differ. Assortment bands appear here, not at harvest — this is where distribution-carrying batches become assortment-specific children.
Failure intent: transport or sorting mutates volume, ignores preconditions, or contradicts world truth.

Phase D — Domestic sale, measurement, receivable, payment (Days 5–19)

Loads (corrected to per-card submissions):

L1 (Day 5, spot): B1 whole → card ASSORT_V_18_25. Brāķis 2.000 m³ isolated via gradeAllocations; accepted 38,000 milli-m³; principal = 38,000 × 10,000 / 1000 = 380,000 mu (€3,800.00) → R1, due Day 15.
L2 (Day 9, under CTR_1): C1 30.000 m³ → card ASSORT_V_18_25; principal 300,000 mu (€3,000.00) → R2, due Day 19; AgreementDeliveryRecorded (accepted 30,000 milli-m³).
L3 (Day 10, spot): C2 6.000 m³ → card ASSORT_V_26P; principal 66,000 mu (€660.00) → R3, due Day 20.
Hard assertions:
Measurement (corrected): each principal recomputed test-side as acceptedVolumeMilliM3 × finalRateMinorPerM3 / 1000 against the correct assortment card — exact; rejected volume appears only through gradeAllocations; no bracket or grade-specific pricing exists inside any measurement; domestic revenue = 380,000 + 300,000 + 66,000 = 746,000 mu (€7,460.00), the sum of measurement principals.
Contract (corrected): agreement.acceptedVolumeMilliM3 = Σ accepted AgreementDeliveryRecorded volumes for CTR_1 = 30,000; deliveredVolumeMilliM3 consistent with the load; progress measured against committed volume 60,000 within tolerance; Deal.recognizedVolumeMilliM3 is not used as progress.
Aging: R1 observed in ≥2 distinct canonical states (e.g., current at Day 12; due-state at Day 15 per canonical semantics — RRR exact state names; no invented aging model) then terminal paid; CashReceived(R1) Day 15; R2/R3 collected by Day 19–20 (early-pay only if canon permits — RRR).
Acquisition estimates persist unmutated beside measurements.
Failure intent: revenue is fictional — flat-rate card math, agreement progress, or aging doesn't actually run.
Phase E — Market causality (Days 15–16, corrected)

Two separate causal pairs, proven independently, payload references only:

Pair A (Day 15): scripted MarketDriverUpdated fires → a BuyerPriceCardPublished follows whose breakdown.causeEventIds contains the market event ID. Assert containment exactly; assert no other card published in the window lacks cause IDs.
Pair B (Day 16): scripted MarketRegimeChanged fires → a BuyerDemandChanged follows carrying regimeEventId equal to the regime event's ID. Assert equality.
Explicitly not asserted: any connected driver→regime chain; automatic regime-metric recomputation; predecessor linkage via parentCauseId.
Failure intent: design law 2's implemented form is broken — cause references missing from the payloads that carry them.
Phase F — Port, charter, export (Days 16–26, corrected)

Actions: normal transport moves C3 (20.500), B3_SPRUCE (18.000), B3_BIRCH (34.000) → PORT_1 (total 72.500 m³ ≥ 60); PLAYER accepts CQ_1, export order records exactly these three batch IDs; vessel loads/departs/delivers; settlement per quote.
Hard assertions (all test-side; no production port ledger or PortIntakeRecorded exists or is required):

Port inventory computed test-side = Σ active batches with locationId = PORT_1 = 72,500 milli-m³ pre-loading;
every batch ID in the export order had locationId = PORT_1 immediately before order creation/loading (the export command itself does not enforce this — the test does);
settlement depletes exactly the referenced batch IDs; exported volume = Σ their depletion amounts = 72,500 milli-m³;
settlement value recomputed: 72,500 × 6,500 / 1000 = 471,250 mu (€4,712.50) — exact; receivable-vs-immediate-cash per CQ_1 semantics (RRR).
Failure intent: export is a façade — batches teleport, or settlement ignores which wood actually shipped.
Phase G — Final reconciliation (Day 30, corrected)

All reconciliation is pure test-side reads (consuming no RNG by construction); ReportGenerated is not a production event and is not asserted.
Hard assertions:

Conservation (global): fixture volumes + realized harvest = mill-accepted + rejected-brāķis disposition + exported + remaining inventory + sorting loss + harvest residue, exact in milli-m³, computed from event payloads.
Finance: closing PLAYER cash independently folded from every cash-affecting event/journal from 4,000,000 mu forward — equals finance read-model exactly; same for COMP_1; free/committed/receivable header reconciles Days 2, 5, 12, 15, 26, 30; zero VAT entries; zero negative-cash ticks.
P&L: Deal(P1) reconstructed through load/measurement/lot/deal and cost-layer links: 380,000 − pile cost − hired haul = system figure, exact; auction-deal P&L includes sorting cost, loss value, both hauls per cost-basis allocation.
Failure intent: the books don't close — wood or money appeared or vanished.
3. Determinism (whole-run)

Two same-seed runs → identical canonical state and event payloads/ordering (metadata exclusions listed, justified, and logged as serialization-cleanup recommendations). Save Day 18 → reload → continue ≡ uninterrupted.

4. Coverage manifest (corrected)

Fails by name if the run lacks any of: pipeline opportunity generation; offer acceptance by both companies; failed late-accept (finite-pool reduction proof); auction win; species-separated harvest with assortment bp distributions; hired transport; owned transport; sorting with exact loss; flat-rate measurement principal per assortment-specific card (hand-recomputed); gradeAllocations brāķis isolation; FrameAgreement accepted-volume progress (exact Σ equality); receivable ≥2 aging states; cash collection; MarketDriverUpdated → BuyerPriceCardPublished via breakdown.causeEventIds; MarketRegimeChanged → BuyerDemandChanged via regimeEventId; test-proven PORT_1 location for every exported batch ID; exact depletion of those batch IDs; independent cash and P&L reconstruction. Presence is never sufficient: every item above binds to its stated payload/value assertion; nothing passes on object existence.

5. Runtime and CI budget

30 simulated days; ~150–300 events (RRR after tick-verbosity check); target single-digit seconds in CI (slower = performance finding, not scope cut). Golden scenario: everything above, one seed. Nightly tier: 5-seed matrix; gate flat-reprice branch; measurement dispute; claim-segregated sort + premium outlet; COMP_1 distress variant; charter under-threshold negative; 3-game-year balance smoke.

6. DeepSeek handoff — inspect before code
Map every remaining CONCEPTUAL event to actual identifiers (two-column table); genuine absences are capability gaps for human review, never new-event creation or renames of existing behavior.
Extract canonical receivable aging state names/triggers; bind Phase D to them.
Confirm SubmitLoadToBuyer fields for the three-card setup and gradeAllocations rejection semantics against the B1 fixture.
Identify discovery knobs producing deterministic Day-1 offers; set explicitly in fixtures.
Confirm CQ_1 settlement semantics (receivable vs immediate cash).
Unit audit: integer minor units end-to-end on this scenario's path; float contact points reported as defects.
Only after 1–6 are reported: implement fixtures, COMP_1 script, harness. Mid-implementation contradictions go to the deviation register, never into silent adaptation.
