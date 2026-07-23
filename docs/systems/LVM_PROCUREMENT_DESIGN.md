# LVM_PROCUREMENT_DESIGN.md

Status: TARGET DESIGN — PARTIALLY IMPLEMENTED
Canonical for: the target LVM procurement subsystem (this is the single source
of truth for how the state forest company's wood reaches the player — it
supersedes all earlier framings of "LVM auctions," including the paper-prototype
fiction of routinely bidding on individual prepared roadside piles).

- **Implemented today**: the generic fictional auction engine at docs/systems/STEP_9_AUCTIONS_AND_FIRST_COMPETITOR.md (src/auction/) — a reusable low-level bidding primitive, not LVM-specific.
- **Target (not yet built)**: the LVM-specific 3-channel institutional model (roadside/short-term auctions/long-term cooperation) this document describes.
- **Research-required**: the [RESEARCH_REQUIRED]/[ASSUMED] items already flagged in the body remain open — those markers are left as-is below.

Constrained by DESIGN_DECISIONS.md and PROCUREMENT_DESIGN.md; yard mechanics
live in YARD_SORTING_DESIGN.md.

## 1. Scope

Governs LVM as a supply institution: its sales calendar, eligibility,
short-term delivery auctions, and longer-term cooperation. Does not govern
private/contractor roadside procurement, which is a separate channel and is
**not** LVM.

## 2. Settled decisions

1. **Three distinct procurement channels**, never conflated:
   - **Channel 1 — Private/contractor roadside**: physical pile-based
     procurement (piles, discovery, negotiation, four-layer model). The
     early-game backbone. Defined in PROCUREMENT_DESIGN.md.
   - **Channel 2 — LVM short-term delivery auctions**: scheduled contract
     volumes delivered over a defined period. Mid-game channel. Defined here.
   - **Channel 3 — LVM longer-term cooperation**: larger framework supply;
     the Titan channel; late-game. Structure `[RESEARCH_REQUIRED]`.
2. LVM operates a **rolling sales calendar** — verified: overlapping periodic
   sales procedures at large scale (a single short-term round has offered
   ~216,800 m³ for a two-month delivery window), with published offers,
   application deadlines, and scheduled electronic auction sessions.
3. LVM is **not modeled as normally selling one roadside pile at a time**.
   Whether any individual roadside-lot or cirsma spot channel is accessible to
   a small trader, and on what mechanics, is `[RESEARCH_REQUIRED]`; the design
   must not assume it as the ordinary early-game LVM channel.
4. Consequence: the early game rests on Channel 1. LVM is something the player
   **grows into**, first via eligibility, then via short-term auctions, then
   possibly long-term cooperation.

## 3. Channel 2 — LVM short-term delivery auctions

### 3.1 Verified structure

- **Eligibility approval** precedes participation: a one-time (per-period)
  qualification against published buyer criteria via the partner portal;
  in-game, an "approved LVM buyer" status with modest requirements.
- **Calendar**: offers are published in advance with application deadlines and
  fixed auction session dates; multiple product offers run concurrently in a
  round.
- **Products**: specified by assortment, species, diameter class, and quality
  grade (e.g., birch veneer logs 18+; sawlog classes split by diameter), with
  regional and delivery-period information attached.
- **Result**: the winner concludes a **delivery contract** for the window —
  wood arrives as a **gradual stream across weeks, not instant inventory**.

### 3.2 Core risks (the gameplay)

- **Receiving capacity**: a contracted inbound stream must be absorbed —
  unloading, classification, storage, throughput. Practically this makes
  Channel 2 a yard-era channel without any artificial gate.
- **Working-capital exposure**: payment obligations run across the full
  delivery window against the player's normal receivable lag. You have bought
  a river, not a pile; committing to a stream while overleveraged is a
  designed failure mode.
- Planning interlock: contracted inflow + yard throughput + outbound schedule
  form one loop with YARD_SORTING_DESIGN.md §5.

### 3.3 Interaction with sorting

A delivered stream of, e.g., "birch veneer logs 18+" is a **continuous
broad-spec input**: spec-guaranteed at the floor, internally varied above it.
Receiving classification and refinement (YARD_SORTING_DESIGN.md) convert the
stream into routed value; the valuation asymmetry applies — the same contract
is worth more to a bidder with refinement capability, and AI bidders price
accordingly. Nothing about the stream is "random mixed timber."

### 3.4 `[RESEARCH_REQUIRED]` for Channel 2

Exact bid structure (per-bracket price vectors vs other formats);
delivery-location rules (whose location, constraints, logistics ownership);
unsold-volume treatment (historic reserve/re-offer behavior is suggestive,
not current evidence); deposit/guarantee mechanics; contract tolerance and
penalty norms; how session competition actually behaves.

## 4. Channel 3 — longer-term cooperation

Large framework supply agreements absorbing a major share of LVM volume;
in-game, the channel Titans occupy and the player may eventually enter. Its
existence shapes the world even while inaccessible: contracted volume is
conserved and therefore absent from what smaller channels can offer. All
structure beyond this principle is `[RESEARCH_REQUIRED]`.

## 5. Gameplay loop (Channel 2, mid-game)

Watch the sales calendar → qualify (once) → evaluate concurrent offers against
yard capacity, cash horizon, and believed refinement value → bid → win a
window → receive the stream week by week (classification, sorting, routing) →
settle across the period → reputation/eligibility consequences from
performance. Auction sessions are natural auto-pause events; the calendar's
predictability rewards planning, unlike Channel 1's opportunistic rhythm.

## 6. Tuning values `[TUNABLE]`

Round cadence and offer counts; product mix per round; window lengths; volume
scale accessible to a mid-size player; eligibility requirements; AI
participation intensity; stream delivery pacing; price formation relative to
the assortment market state.

## 7. Research-required (consolidated)

Everything in §3.4; the existence and mechanics of any individual LVM
roadside-lot or cirsma spot channel for small buyers; Channel 3 framework
structure (volumes, terms, qualification); how LVM prices starting levels per
round; regional distribution of offered volumes.

## 8. Implementation milestones

1. **M1 — World effect only:** LVM exists as a conserved supply absorber
   (long-term contracted volume removed from the world's available pool). No
   player interaction.
2. **M2 — Calendar & eligibility:** published rounds visible in-game;
   qualification status obtainable; offers readable but Channel 2 bidding
   stubbed.
3. **M3 — Delivery auctions:** single-product bidding, contract award,
   gradual delivery stream into player receiving, payment schedule across the
   window.
4. **M4 — Multi-offer rounds & AI competition:** concurrent products, AI
   bidders with infrastructure-dependent valuations, public results feeding
   the intel layer.
5. **M5 — Stream integration & tuning:** full loop with yard throughput and
   working-capital stress; headless verification that overcommitment to
   streams is a real failure mode.
6. **M6 — Channel 3 skeleton:** framework agreements as a late-game unlock,
   pending research.

## 9. Postponed

Channel 3 detail; any roadside-lot/cirsma spot channel (pending research);
bid-vector UI depth; LVM relationship/performance scoring beyond eligibility;
delivery rescheduling negotiations; multi-window portfolio management;
standing-timber harvesting contracts from LVM.
