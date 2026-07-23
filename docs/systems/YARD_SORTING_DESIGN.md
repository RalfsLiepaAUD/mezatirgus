# YARD_SORTING_DESIGN.md

Status: TARGET DESIGN — PARTIALLY IMPLEMENTED
Canonical for: the target yard-sorting subsystem (merges the base sorting
design with Amendments A1 — when sorting occurs — and A2 — grade refinement
and recovery potential; obsolete assumptions from earlier drafts are removed,
not merely overridden).

- **Implemented today**: yard-as-location/capacity/trucks/drivers at docs/systems/STEP_11_YARD_TRUCK_EMPLOYEE_LANE.md (src/operations/), plus a bare `SortBatchAtYard` command stub in src/operations/commands.ts.
- **Target (not yet built)**: the grading/recovery-band/netback sorting economics this document describes.
- **Research-required**: items already flagged in the body remain open.

Constrained by DESIGN_DECISIONS.md and PROCUREMENT_DESIGN.md. LVM-specific
procurement rules live in LVM_PROCUREMENT_DESIGN.md.

## 1. Scope

Governs everything between "timber arrives at the player's yard" and "child
batches leave the yard": receiving, classification, sorting, refinement,
consolidation, and outbound load-building. Does not govern procurement
channels, mill behavior, or transport pricing, which are defined elsewhere.

## 2. Settled decisions

1. **Sorting exists only after yard ownership.** No yard, no sorting — the
   action is absent, not disabled.
2. **Direct roadside-to-mill is the dominant flow**, before and after yard
   ownership. The yard opens a second business beside trading; it does not
   replace it.
3. Roadside timber arrives **already roughly sorted** by harvester/forwarder
   crews: coarse but real. Yard work is **refinement of coarse grades**, never
   untangling random mixtures.
4. **Most yard intake is delivered**: suppliers and traders quoting
   delivered-to-yard, trader inventory sales, consolidation purchases,
   re-sorting of held stock. Roadside lots divert to the yard only
   exceptionally (severe mis-description discovered at pickup, very cheap
   chaotic pile near the yard, certification segregation needs, no acceptable
   direct outlet, deliberate winter stock-building).
5. **Not all B is equal.** Beneath coarse commercial labels (A / B / C / tara /
   brāķis) sits hidden RecoveryPotential; B spans near-A to near-C recovery.
6. Sorting **never improves true quality or recovery**; it reveals, separates,
   classifies, consolidates, or downgrades existing material.
7. **Volume is exactly conserved**: children plus recorded loss equal parent.
8. Yard routing is **not universally superior**: double-haul economics, delay,
   freshness, and flat-ladder regimes make direct trade the correct choice for
   the majority of volume.
9. v1 determinism: exact hidden recovery-band volumes per batch; no probability
   distributions at sort time; no worker classification error; no photo system.

## 3. Domain model

### 3.1 Hidden truth

Every Batch carries hidden truth: exact volumes per (grade label ×
diameter band × recovery band), plus freshness (felling date) and claim tag.
v1 recovery bands are discrete and exact `[TUNABLE thresholds, no real-world
standard asserted]`:

- A (near-perfect first-cut logs)
- near-A / B+ (high-recovery B)
- ordinary B
- weak B / near-C
- C veneer
- 14–18 cm tara (diameter-driven)
- pulp/reject contamination
- brāķis (damage)

The player sees estimates with certainty levels; truth is revealed only by
operations and final mill measurement.

### 3.2 Operations (three, distinct)

1. **Intake inspection** — anywhere, cheap, minutes. Narrows certainty bands.
   No state change. Requires no yard.
2. **Receiving classification** — yard gate, low cost, fast. Measures incoming
   volume, assigns wood to rows by apparent class, records
   `SupplierVarianceRecorded` when description and reality diverge. Produces
   administrative separation and evidence; no child batches beyond row
   assignment. Requires a company-controlled yard and the batch at that yard.
3. **Full sorting (SortingOperation)** — physical separation.

```text
SortingOperation
  preconditions: company controls a yard with sorting capability;
                 input batch located at that yard;
                 capacity available (else the job QUEUES — never instant)
  input:   Batch (parent)
  params:  depth (rough | standard | fine) OR target template (buyer spec)
  costs:   €/m³ handling + time + capacity occupancy
  output:  Batch[] children partitioned by (label × diameter band ×
           recovery band per depth), certainty = high; freshness inherited;
           claims inherited per segregation rules; provenance → parent
  loss:    one explicit SortingLoss record (~0.5–2% [TUNABLE])
  events:  SortingQueued → SortingStarted → SortingCompleted
           (+ CompositionRevealed, SupplierVarianceRecorded)
```

**Conservation rule (invariant):** Σ(child volumes) + SortingLoss = parent
volume. Always. Loss posts as a cost event.

**Cost basis:** allocated to children pro-rata by volume in v1 (value-share
allocation later `[TUNABLE]`).

**Depth:** rough separates labels and the 18+/14–18 line; standard adds
recovery-band partition; fine sharpens template targeting. v1 outcomes are
deterministic from hidden truth at every depth — depth controls partition
granularity only.

### 3.3 Claims

Load claim = minimum claim among source batches; sorting never upgrades.
Certified children keep claims only via claim-segregated rows (yard flag,
costs capacity). Mixing into common rows downgrades silently and permanently —
a designed temptation feeding the certification consequence ladder in
PROCUREMENT_DESIGN.md.

## 4. Where yard value comes from

1. **Refining broad ABC/BC delivered mixes into bands.**
2. **Splitting 18+ veneer from 14–18 tara** — the supplier-optimism
   correction; suppliers often treat 14+ as veneer-capable, many mills price
   14–18 as tara or refuse it.
3. **Extracting near-A/B+ from ordinary B** — the flagship: recovery-aware
   mills pay above ordinary B for visibly high-recovery trucks; card-bound
   mills do not (Buyer trait `recovery_awareness`).
4. **Separating C veneer from genuine pulp contamination.**
5. **Consolidation** — full truck multiples, buyer-exact outbound loads,
   accumulation rows (A and B+ fractions gathered across many intakes).
6. **Evidence** — receiving classification builds per-supplier variance
   history, strengthening disputes in both directions.
7. **Timing** — holding winter stock toward spring scarcity, freshness
   permitting.

**Netback rule:** sorting is worth doing iff Σ(best-outlet netback of
children) − (best single-outlet netback unsorted) > sorting cost + loss +
delay/freshness cost + any extra hauls. The pre-commitment panel computes both
sides from the player's beliefs; the simulation resolves from truth.

**Double-haul brake:** roadside→yard→mill pays two hauls plus double handling
(≈€15–30/m³ behind direct at spot rates) — which is why gate-delivered wood,
paying no player-side inbound haul, is the yard's natural diet, and why direct
trade stays dominant without any artificial rule.

## 5. Geography, capacity, throughput

- Yards carry a siting attribute: distance to mill cluster / port. Near-cluster
  yards get cheap second hauls and stronger premium-load competition; remote
  yards need wider spreads to justify sorting.
- Throughput (m³/day `[TUNABLE]`) is shared across receiving, sorting, and
  loading; jobs queue when capacity is short, and queued wood keeps aging.
- Purchasing pace, sort depth, and outbound schedule form one planning loop:
  overbuying into a small yard is a designed failure mode; a full yard raises
  the player's own gate standards, mirroring mills.

## 6. Gameplay loop (yard-era)

Gate delivery arrives → receiving classification (variance recorded) →
route decision per lot: rows-only / rough / standard / fine / sort-to-template
/ refuse or flat-reprice at the gate → children into rows → accumulation rows
fill → outbound loads built against mill cards, requests, and templates →
second-haul dispatch inside receiving windows. Meanwhile the trading desk's
direct flows never touch the yard.

## 7. Player decisions

Which deliveries to accept at the gate; classify-only vs sort and at what
depth; template targeting against a live mill request; claim segregation
usage; accumulation-row patience vs freshness; outbound load composition;
capacity triage when the queue fills; when the regime says idle the sorting
line entirely.

## 8. Tuning values `[TUNABLE]`

Handling €/m³ by depth; loss %; throughput m³/day; queue rules; recovery-band
thresholds and per-band value spreads; delivered-basis premium over roadside
(≈€8–18/m³); accumulation-row caps; claim-segregation capacity penalty;
variance threshold triggering dispute options; siting-distance effects.

## 9. Research-required

Real sorting cost decomposition and throughput; actual handling-loss rates;
how Latvian yards segregate certified material; realistic recovery spread
within B for Latvian birch; how mills actually price visibly-premium B loads
and whether informal photo marketing is common; prevalence of 14–18 rejection
vs tara-pricing by mill type; second-haul cost norms; delivered-quote norms.

## 10. Implementation milestones

1. **M1 — Core operation (narrow):** SortingOperation with all three
   preconditions enforced (reject if no suitable yard; reject if batch not
   located there; queue if capacity short). Deterministic partition of exact
   hidden band volumes; conservation invariant; loss and cost posting;
   receiving classification with variance events. No distributions, no worker
   error, no photos. Headless-verifiable.
2. **M2 — Netback panel:** belief-based both-sides calculation, decision
   verbs, double-haul line items; ship-direct remains the default verb.
3. **M3 — Constraints:** throughput queueing, capacity occupancy, freshness
   decay during residence, working hours.
4. **M4 — Claims:** segregation flag, silent downgrade on mixing, one premium
   claim outlet.
5. **M5 — Recovery-band routing:** buyer `recovery_awareness`, band-sensitive
   pricing at savvy mills, accumulation rows, B+ truck economics.
6. **M6 — Photo-based premium-load offers:** simulated photos + description to
   selected mills; responses from visible quality, relationship, hunger,
   trust, distance, recovery strategy; misrepresentation resolves through the
   existing gate/abuse machinery.
7. **M7 — Tuning:** headless sweeps verifying direct and yard strategies each
   win in their regimes and sorting reliably loses money in flat-ladder,
   summer-decay, and honest-homogeneous cases.

## 11. Postponed

Worker skill and classification error; probabilistic reveal; sorting equipment
tiers, conveyors, machinery simulation; individual logs; worker pathfinding;
multi-yard networks; automated sorting policies; sort-to-order contracts;
sprinkler/wet-deck storage as a freshness counter; re-bucking/merchandising
(crosscutting to isolate defect sections); acoustic/scanning sorting;
chip/residue side-streams; buying unsorted piles at the player's gate beyond
DESIGN_DECISIONS.md §7.