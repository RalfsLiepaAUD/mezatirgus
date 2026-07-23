# REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md

Status: TARGET DESIGN — NOT YET IMPLEMENTED

Canonical for: the target regional buyer market, physical AI trader yards, strict
supplier choice, arbitrage boundaries, net millback concept, and player
information layer for Latvian/Estonian/Lithuanian roundwood trade.

- **Implemented today**: the generic fictional buyer/price-card/measurement engine
  at `docs/systems/STEP_6_BUYERS_COMPATIBILITY_DEMAND_PRICE_CARDS_AND_MEASUREMENT.md`
  (`src/buyer/`), which creates one buyer at a single location with a price card,
  gate behaviour, and measurement. That is the current as-built authority for what
  actually runs today. A single fictional AI competitor exists at
  `docs/systems/STEP_9_AUCTIONS_AND_FIRST_COMPETITOR.md`.
- **Target (not yet built)**: everything below — the multi-buyer regional market,
  physical AI-traded yards, strict destination choice, arbitrage guards, net
  millback calculations, capacity-responsive pricing, and tiered player
  information. None of this is implemented.
- **Research-required**: all `[RESEARCH_REQUIRED]` markers below remain open.
  Real Latvian, Estonian, and Lithuanian buyer geographies, prices, capacities,
  and terms must be researched before tuning; this document provides the
  structural rules, not calibrated data.

Constrained by `DESIGN_DECISIONS.md`, `PROCUREMENT_DESIGN.md`,
`YARD_SORTING_DESIGN.md`, and the as-built system reports. Mills, mill-supplier
relationships, and mill-side ranking are the domain of
`MILL_SUPPLIER_RELATIONSHIP_DESIGN.md` — this document covers the buyer and trader
yard as a market-facing entity, not the internal buyer evaluation logic.

---

## A. Regional market structure

### A.1 Target buyer population

The full game should eventually contain **roughly 30–50 buyer entities** across
Latvia, Estonia, and Lithuania. A smaller subset is economically relevant for any
given timber batch: a typical forest or roadside location should usually have
access to:

- at least one viable low-grade outlet;
- at least one normal sawlog or industrial buyer;
- at least one premium, specialist, aggregation, or export route.

This does not mean every forest must be profitable or easy. Remote or poorly
compatible locations may have only one viable outlet, forcing lower prices or
longer hauls.

### A.2 Buyer categories [LOCKED at concept level]

Buyer categories, each with distinct compatibility rules, price-card behaviour,
and capacity profiles:

1. **Sawmills** — conifer and/or hardwood; normal sawlog range; some take
   pulpwood fractions; varying diameter and quality tolerance.
2. **Veneer and plywood mills** — specific species and diameter requirements;
   premium-paying for A-grade; strict grading; strong seasonality for birch
   veneer.
3. **Pulpwood and chip buyers** — broad species acceptance; lower price; high
   volume; lower grading strictness.
4. **Pallet and packaging producers** — intermediate quality tolerance; often
   take lower grades that sawmills reject; weaker price but consistent offtake.
5. **Biomass and energy buyers** — lowest price; accept almost any species;
   strong seasonal intake (winter); compete with pulp at the low end.
6. **Specialist processors** — niche dimensional or species requirements;
   small volume; best price for exact match; zero tolerance for deviation.
7. **Ports and exporters** — aggregate for sea shipment; take broad
   assortments; pay at export-netback level; require document packages and
   minimum volumes.
8. **Aggregators and timber traders** — buy and resell; operate their own
   yards; compete with direct mill delivery on convenience, scale, or
   immediate payment.

### A.3 Compatible count per location

A buyer is compatible with a given batch when its species, assortment,
diameter bracket, quality grade, and document requirements are accepted under
its current published rules. Compatibility is not universal — a veneer mill
does not buy pulpwood, and a pallet mill may not pay the veneer premium.

**[LOCKED]** Compatibility is a buyer-specific trait, not a table of universal
truth.

### A.4 Cross-border access

Estonian and Lithuanian buyers exist in the game world. Cross-border trade
adds:

- longer transport distances and costs;
- possible document differences `[RESEARCH_REQUIRED]`;
- currency handled as EUR (same currency zone);
- relationship building from zero;
- potential price arbitrage where domestic outlets are saturated.

Cross-border does not imply universal access: the player must discover and
build relationships with foreign buyers just as with domestic ones.

---

## B. Physical AI trader yards

### B.1 Definition

Major AI timber traders and suppliers operate real physical yards in the game
world. These are not abstract "market-maker" entities — they have a location, a
physical stock, and a gate. The same AI company may act in multiple roles:
- as a **competitor** bidding against the player for offers and auction lots;
- as a **buyer** purchasing compatible timber at its yard;
- as a **supplier** selling from its own inventory or forest assets;
- as an **auction bidder** at prepared-roundwood and standing-timber auctions;
- as a **yard operator** offering storage, sorting, or intake services;
- as a **downstream contract holder** with mill or export commitments.

**[LOCKED]** An AI company is a single economic entity with a single ledger.
Its multi-role behaviour must be internally consistent: it does not buy from
itself at inflated prices or sell to itself to manufacture volume.

### B.2 Yard attributes

Each physical AI yard carries the following attributes:

| Attribute | Type | Notes |
|---|---|---|
| Location | Location ID | On the existing route graph |
| Owner company | Company ID | The AI company that controls it |
| Accepted species | Species ID[] | Only these species pass the gate |
| Accepted assortments | Assortment ID[] | Only these assortments |
| Accepted dimension range | min/max diameter, length | Optional; if absent, accepts all within assortment norms |
| Accepted quality grades | Grade ID[] | May restrict to e.g. "B or above only" |
| Public buy-price list | Map of (species × assortment × grade) → rate | Visible to all companies |
| Total capacity | m³ | Maximum physical storage |
| Current stock | m³ | Occupied volume |
| Intake status | OPEN / LIMITED / PAUSED / FULL | Publicly stated |
| Payment terms | Days to payment | May differ from mill norms |
| Grading strictness | Basis points | How aggressively the yard grades against its published list |
| Downstream buyer relationships | Contract list | The yard's own sales commitments |
| Transport options | Carrier contracts or owned fleet | Affects pickup/delivery logistics |
| Operating hours / intake schedule | Time window | Weekday daytime typical; some 24/7 |

### B.3 Stock and gate behaviour

**[LOCKED]** The AI yard's public buy-price list is a **calculated output** from
its own downstream contracts, current stock, intake flow, and cash position. It
is never a static constant.

Intake status transitions:
- Stock < 60% capacity → `OPEN`: actively buying at published rates.
- Stock 60–85% → `LIMITED`: may restrict by species, assortment, or daily
  quota.
- Stock 85–95% → `PAUSED`: buying only from priority/contracted suppliers.
- Stock > 95% → `FULL`: no intake; gate refuses compatible loads.

These thresholds are `[TUNABLE]`.

**[LOCKED]** The yard gate checks compatibility against its published rules and
status. A load matching all criteria is accepted at the published rate minus any
grading variance. A load exceeding capacity, of the wrong species, or with
missing documents is refused — the same gate logic as player-to-mill delivery
(`STEP_6_BUYERS_COMPATIBILITY_DEMAND_PRICE_CARDS_AND_MEASUREMENT.md`).

### B.4 Player delivery to AI yards

The player's inventory (batches, loads) must be deliverable to any compatible AI
yard via the existing transport and dispatch systems. Delivery to an AI yard
follows the same flow as delivery to a mill:

1. Player builds a load of timber matching the yard's compatibility rules.
2. Player dispatches via hired carrier, own truck, or transport lane.
3. Load arrives at the yard gate; yard applies its current intake status and
   grading.
4. Gate decision: accept (at published rate less grading variance), reprice, or
   refuse.
5. Accepted volume posts as a receivable through the existing finance pipeline.

**[LOCKED]** AI yard payment terms follow the same buyer-specific settlement
model as mill payments — they are not instant or automatically favourable.

---

## C. Strict supplier choice

### C.1 The canonical rule [LOCKED]

No rational independent supplier may sell to a lower-net-paying buyer while a
higher compatible buyer under equivalent effective delivery conditions still has
available demand.

"Rational independent supplier" means a supplier whose objective is to maximise
the net value received for its timber, subject to non-price constraints. The
small-trader cloud and purely abstract market actors are not individual
rational suppliers — they follow aggregate absorption rules as documented in
`PROCUREMENT_DESIGN.md`.

### C.2 Expected net value

Supplier destination choice is based on **expected net value**, not advertised
purchase price alone. Expected net value includes:

- advertised purchase price (€/m³ at the gate);
- seller-paid transport cost (or buyer-provided pickup value);
- expected downgrade or rejection risk (grading strictness × past experience);
- measurement trust (historical bias);
- payment delay (time value of money, working-capital cost);
- capacity and intake availability (risk of refusal after transport);
- contractual obligation (existing commitment);
- convenience (distance, paperwork, operating hours);
- relationship value (warmth, trust, past favours);
- certainty of acceptance (intake status, documentation ease).

### C.3 Zero-sprinkle rule [LOCKED]

**Illustrative example:** with equal logistics, grading, payment terms, and
available capacity:
- a yard paying €52/m³ receives the compatible flow;
- a yard paying €50/m³ receives zero;

Volume must not be sprinkled between both for balance or artificial market
share. The lower-price yard may receive supply only when a real economic reason
exists, such as:

- the higher-price yard reaches capacity (stock limit or intake pause);
- intake quota fills (daily or weekly limit reached);
- buyer pauses purchasing (seasonal, cash-driven, or strategic);
- payment is materially slower (time-value gap exceeds price gap);
- grading is stricter (expected net gap disappears after grading risk);
- seller has a binding contract (volume is committed elsewhere);
- lower-price buyer collects from roadside (no haul cost for seller);
- relationship value or an explicit favour changes the decision;
- higher-price buyer cannot accept the assortment mix or quality.

**[LOCKED]** The zero-sprinkle rule applies to rational independent suppliers
only. The small-trader cloud, LVM internal flows, and abstract market
absorption are not subject to this rule — they follow their documented aggregate
rules.

**[LOCKED]** This is not the same as "the player's company always gets the best
price." The player is a single company among many; supplier rationality applies
to all competing companies equally.

---

## D. Arbitrage protection

### D.1 The forbidden case [LOCKED]

The game must not permit effortless same-location arbitrage where:

- the player buys from an independent supplier for €50/m³;
- a neighbouring yard publicly buys the same compatible wood for €52/m³;
- all effective terms (transport, grading, payment delay, capacity, access) are
  equivalent;
- the player can immediately resell to the yard, adding zero economic value.

This is forbidden because it reduces procurement to an automatic money-printing
machine and eliminates the cash conversion cycle tension that is the game's core
(`DESIGN_DECISIONS.md §1.1`).

### D.2 Legitimate arbitrage

Legitimate arbitrage should require solving one or more of the following:

- **Geography**: the player's source pile and the higher-paying yard are far
  apart; the player must transport, taking on cost and risk.
- **Transport**: no direct route, poor access, or expensive carrier; the
  arbitrage spread must cover real haul cost.
- **Aggregation**: the player must collect from multiple small piles to make a
  truckload — each additional stop costs time, transport, and complexity.
- **Sorting**: the player must separate higher-value fractions from mixed
  material (yard sorting; see `YARD_SORTING_DESIGN.md`).
- **Contract access**: the higher-price is available only under a frame
  agreement the player has not yet earned.
- **Payment timing**: the higher-price buyer pays in 30 days; the lower-price
  source demands cash on pickup — the player's working capital may not bridge
  the gap.
- **Stale price information**: the public price list may be hours or days old;
  the player who checks the latest rate before committing has real information
  value.
- **Intake limits**: the yard will buy €52/m³ only for the first 200 m³ this
  week; the player who knows this and queues first gets the spread.
- **Quality uncertainty**: the player's estimate of the pile's true composition
  may show that after grading and rejection risk, the expected net is below
  €52/m³.
- **Relationship risk**: selling to the higher-price yard damages a valuable
  supplier relationship that the low-price yard represents.
- **Storage**: the player holds the wood across a price-gap period; storage
  cost, degradation risk, and capital cost erode the spread.
- **Market movement**: the price could move before the player completes the
  round-trip.

### D.3 Enforcement

Arbitrage protection is **emergent from existing game mechanics**, not a
separate rule. The constraints listed in D.2 map onto transport cost, yard
sorting economics, gate grading, payment terms, cash commitments, and
relationship consequences — all of which are already designed or implemented
in other subsystems. If the simulation correctly models these, arbitrage can
occur only where it is economically justified.

**[LOCKED]** No separate "anti-arbitrage tax" or artificial margin check may be
introduced. If a player discovers a genuine value gap that survives real
transport, grading, payment, and capacity costs, that gap is legitimate trade,
not an exploit.

**[LOCKED]** A separate anti-arbitrage rule **does** apply to
relationship-discounted timber; that rule lives in
`MILL_SUPPLIER_RELATIONSHIP_DESIGN.md` §E (favour misuse), not here.

---

## E. Net millback

### E.1 Definition

Net millback is a conceptual decision metric, not a mandatory UI display or a
hardcoded formula. It is the player's estimate of the real net revenue per
cubic metre from sending a given batch to a given destination:

> buyer revenue
> − transport (direct haul cost or allocated lane cost)
> − handling (yard gate cost, port handling, loading/unloading fees)
> − sorting and sorting loss (if yard sorting is required)
> − financing cost (payment delay × working-capital cost rate)
> − expected downgrade or rejection loss (grading strictness × historical
    variance)
> − other deal-specific costs (documentation, certification, inspection,
    commissions)

### E.2 Status [LOCKED at concept level, TUNABLE coefficients]

The net millback formula is a **player-side analytical tool**, not a simulation
rule. The simulation computes each cost component independently through the
existing finance, transport, yard, and buyer systems. The net millback
calculation aggregates them for the player's decision support.

- The set of cost components is locked — no component may be silently omitted
  from the player's side of the calculation.
- The exact coefficients (€/km transport, €/m³ handling, working-capital cost
  rate) are tunable and sourced from research.
- The calculation must handle uncertainty: many components are estimates until
  the deal completes. The display should distinguish estimated from confirmed
  figures.
- AI companies may use analogous calculations internally, with their own belief
  distributions.

### E.3 Decision use

The player uses net millback to:
- compare multiple buyer destinations for the same batch;
- decide whether sorting adds net value;
- choose between direct delivery and yard routing;
- assess whether a contract or frame agreement is net-positive.

The pre-commitment netback panel described in `YARD_SORTING_DESIGN.md` §4
should extend to all destinations, not only yard-sort decisions.

---

## F. Capacity and market response

### F.1 Price and intake responsiveness [LOCKED]

Buy prices and intake availability must respond to changing conditions.
Buyers are not static price constants. Responsiveness factors include:

- **Yard stock**: low stock → higher price to attract supply; high stock →
  lower price or pause.
- **Downstream demand**: the buyer's own mill/contract sales volume — strong
  demand → willing to pay more; weak demand → lower price.
- **Contracts**: committed delivery volumes must be fulfilled; a buyer with a
  full contract book may reduce spot intake.
- **Processing capacity**: sawline, veneer line, or chipper capacity limits
  daily consumption; above this, wood piles up as stock.
- **Regional competition**: if other buyers in the region raise prices, the
  buyer may follow to retain inflow; if competitors drop, the buyer may follow
  down.
- **Recent inflow**: a surge of deliveries may fill stock rapidly, triggering a
  price or intake response.
- **Seasonal effects**: spring thaw reduces harvest outflow → buyers may raise
  prices to attract what is available; winter glut depresses prices.
- **Market regime**: regime transitions change aggregate demand pressure
  (`STEP_14_MARKETS_SEASONS_OBSERVATIONS.md`).
- **Cash position of AI company**: an AI buyer that has overcommitted on
  purchases may pause intake or delay payment. An AI company with strong cash
  may accelerate payment to secure supply. Companies can become distressed
  (`DESIGN_DECISIONS.md §1.9`).

### F.2 Buyer actions

A buyer may take any of the following actions, each driven by the above factors:

- **Raise prices**: increase the public price-card rate for one or more
  compatible streams.
- **Lower prices**: decrease the rate.
- **Pause intake**: set intake status to PAUSED or FULL; refuse new deliveries.
- **Limit daily or weekly volume**: accept only a defined volume per period,
  then refuse.
- **Prioritise contracted suppliers**: honour frame-agreement deliveries before
  accepting spot loads.
- **Reject incompatible timber**: enforce compatibility rules more strictly
  when stock is high; relax when stock is low. This is distinct from universal
  grading strictness — a buyer may accept borderline material when hungry and
  reject it when full.

### F.3 Simulation approach

Buyer pricing and intake decisions are **causal**, driven by observable state
variables. They are not random events. Each action should trace to a specific
trigger: "Began paying €2/m³ more because stock dropped below 1,000 m³ and
two competitor mills raised their sawlog bid."

The price-card calculation pipeline (`STEP_6_BUYERS_COMPATIBILITY_DEMAND_PRICE_CARDS_AND_MEASUREMENT.md`)
already supports causal inputs. This design extends that pipeline with
additional input terms for stock, competition, cash, and regime.

---

## G. Player information

### G.1 Information tiers

Define what the player can observe about each buyer and AI yard. Information
separates into two tiers:

**Perfect public information** (accurate, no uncertainty, available without
inspection):
- buyer/yard name, location, location on route graph;
- public buy-price list (current published rates);
- stated intake status (OPEN / LIMITED / PAUSED / FULL);
- stated operating hours or intake schedule;
- payment terms as declared (days to payment);
- species, assortment, and quality compatibility as declared.

**Uncertain or estimated information** (may differ from ground truth; confidence
varies):
- actual grading strictness (learned through delivery experience, gossip, or
  employee knowledge);
- real payment speed vs stated terms (observed by tracking receivable aging);
- actual stock level (estimated from price movement, intake behaviour, or
  relationship);
- capacity (estimated from delivery history, facility scale, or industry
  knowledge);
- measurement bias or reputation (built from historical variance between
  player estimate and buyer measurement);
- cash position or distress signals (inferred from behaviour: delayed payments,
  sudden intake pause, price drop);
- downstream contract position (guessed from volume patterns, market rumours);
- relationship state (tracked per company, per the
  `RelationshipState`/`IntelItem` system);
- market rumours (gossip-origin uncertain claims, subject to the existing
  `ShareGossip` mechanics in `STEP_7`).

### G.2 Progression

Information availability should improve over time:
- A new, unknown buyer shows only the perfect public information.
- After the first delivery, the player gains a record of that buyer's gate
  behaviour, grading outcome, and payment speed.
- After several deliveries, trend data becomes available (average grading
  variance, typical payment lag, seasonal intake patterns).
- Through employee knowledge, relationship favours, or gossip, the player may
  learn about a buyer's cash position, downstream contracts, or strategic
  intentions.

**[LOCKED]** Information is separate layers: world truth, actor-private truth,
and player-visible intel (`DESIGN_DECISIONS.md §12`). The player never gets
direct access to buyer private state.

### G.3 False or stale information

Price lists may be stale (published hours or days ago; the current gate rate
may differ). Intake status may change between the player's route planning and
the truck's arrival. These are not bugs — they are the designed information
friction that rewards current knowledge and punishes assumption.

---

## H. Future research

The following items are `[RESEARCH_REQUIRED]`. Until evidence is acquired, use
centralised `[PLACEHOLDER]` or `[ASSUMED]` values flagged with this marker.

- **H.1 Actual Latvian regional buyer geography**: names, types, locations, and
  approximate capacities of real sawmills, veneer mills, and pulp buyers in
  each region (Vidzeme, Latgale, Kurzeme, Zemgale). This is needed for the
  30–50 buyer target. Until researched, use fictional archetypes with
  plausible regional distribution.
- **H.2 Estonia/Lithuania cross-border economics**: price differences, document
  requirements, transport costs, and typical trade flows between the Baltic
  states. Does material volume move across borders today, and under what
  conditions?
- **H.3 Common 3.1 m assortment demand**: what share of Latvian roundwood
  trade uses the 3.1 m length assortment; which buyers demand it; how does it
  affect price and compatibility?
- **H.4 Realistic payment terms** by buyer type and scale: do small sawmills
  pay faster or slower than large mills? What is the distribution of payment
  delays in Latvian domestic trade?
- **H.5 Realistic yard capacities** for timber traders and aggregators:
  typical stock levels, throughput, and storage duration for Latvia.
- **H.6 Actual transport economics**: spot haulage rates per km for timber
  trucks; typical payload; seasonal variation; empty-backhaul cost.
- **H.7 Real company roles and locations**: which timber traders operate
  physical yards; which aggregators exist; which export ports handle roundwood;
  which sawmills also trade logs. This does not mean copying real company
  data into the game — the research informs archetype calibration.
- **H.8 Buyer processing capacity distributions**: typical daily consumption
  volumes for small/medium/large sawmills in Latvia.

---

## Implementation milestones

### M1 — Multiple fictional buyers (regional expansion)
Extend the world to contain 8–15 fictional buyers across 2–3 Latvian regions,
each with distinct location, compatibility rules, price cards, and capacity.
Buyer behaviour follows the existing `STEP_6` engine. Headless-verifiable:
player delivers identical loads to different buyers and receives different
prices and gate outcomes.

### M2 — Physical AI trader yards
Implement one AI-controlled physical yard as a buyer entity with stock tracking,
intake status, and gate logic. The same AI company may act as competitor in
auctions. Headless-verifiable: AI yard accepts loads up to capacity then
refuses; AI yard pays published rate minus grading variance.

### M3 — Strict supplier destination choice
Wire the zero-sprinkle rule in supplier AI destination logic (or in its
equivalent for the procurement supply model when implemented). The small-trader
cloud continues to follow aggregate absorption. Headless-verifiable: a Pile
offered at €50 is taken by a €52 buyer, not sprinkled; the €50 buyer gets
supply only when the €52 buyer reaches a constraint.

### M4 — Net millback panel
Build a player-side analytical display (UI or debug) showing net millback
components per batch × destination. No simulation changes — pure read-model
projection.

### M5 — Causal price and intake response
Wire full price-card responsiveness to stock, competition, cash, and regime
for all buyer entities. Buyers raise/lower prices and pause intake based on
their internal state. Headless-verifiable: an AI mill with low stock pays more;
a yard with full stock pauses.

### M6 — Player information system
Implement the two-tier information model (perfect public vs uncertain estimated)
for buyers and AI yards. Deliverable: first-visit buyer shows public rates;
after-delivery shows historical grading variance. Information degrades if
stale. Headless-verifiable: two identical buyers with different private traits
produce different player-visible information after repeated deliveries.

### M7 — Regional expansion and tuning
Extend to 30–50 buyers across Latvia, Estonia, and Lithuania. Tune
responsiveness, information degradation, and cross-border economics.
Headless verification that regions with few buyers are harder to profit in
and that no automatic arbitrage loophole exists.

---

## Cross-document consistency

This document agrees with `MILL_SUPPLIER_RELATIONSHIP_DESIGN.md` on the
following principles:

- Ordinary suppliers maximise expected net value; the zero-sprinkle rule is
  the default.
- Relationships may alter expected net value (favours, trust, long-term
  preference), but such exceptions are rare and explicit.
- Capacity and intake limits matter more than price alone in determining actual
  flow.
- Geography and transport cost are real economic constraints.
- No artificial market-share allocation exists — volume follows net value.
- Price is not the only economic term; payment delay, grading risk, and
  relationship value are equally real.
- Real market values remain unresolved and require research; this document
  provides structural rules, not calibrated data.
