# MILL_SUPPLIER_RELATIONSHIP_DESIGN.md

Status: TARGET DESIGN — NOT YET IMPLEMENTED

Canonical for: the target design governing how mills evaluate and rank their
suppliers, the structured relationship state beyond a single reputation number,
relationship favours, reciprocity obligations, negotiation mechanics, and
exploit protections.

- **Implemented today**: the generic fictional buyer engine at
  `docs/systems/STEP_6_BUYERS_COMPATIBILITY_DEMAND_PRICE_CARDS_AND_MEASUREMENT.md`
  (`src/buyer/`), the supplier/offer/relationship engine at
  `docs/systems/STEP_7_SUPPLIERS_OFFERS_DOCUMENTS_RELATIONSHIPS_AND_INTEL.md`
  (`src/supplier/`), and the frame agreement engine at
  `docs/systems/STEP_12_FRAME_AGREEMENT.md` (`src/contracts/`). Buyer
  relationships today are implicit in price-card behaviour and gate outcomes;
  supplier relationships use warmth/trust/favour basis points. Frame agreements
  exist but are not wired to relationship consequences.
- **Target (not yet built)**: everything below — relative supplier comparison
  by mills, structured multi-dimensional relationship state, the full favour
  and reciprocity model, player-requested negotiation, misuse detection, and
  the staged implementation plan.
- **Research-required**: items already flagged as `[RESEARCH_REQUIRED]` in the
  body remain open; real-world mill-procurement practices are indicative, not
  determinative, and this document does not claim to replicate any real
  company's purchasing process.

Constrained by `DESIGN_DECISIONS.md`, `PROCUREMENT_DESIGN.md`,
`YARD_SORTING_DESIGN.md`, `REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md`, and the
as-built system reports. Buyer-side yard and market structure is the domain of
`REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md` — this document covers the
evaluation and relationship mechanics between mills and their suppliers (the
player, AI traders, and other sources).

---

## A. Relative supplier competition

### A.1 The evaluation principle [LOCKED]

Mills do not evaluate any single supplier in isolation. They compare each
supplier against the current set of active and recently active suppliers
serving that mill, on multiple dimensions. There is no permanently solvable
fixed allowance such as "the mill accepts exactly X% low grade without
consequence" — tolerance shifts with context.

### A.2 Evaluation dimensions

Mills evaluate suppliers on:

1. **Measured quality** — grade distribution of accepted deliveries over a
   rolling window; share of A, B, tara/C, brāķis by volume.
2. **Promised versus delivered quality** — how often the supplier's description
   matches the gate measurement. High variance erodes trust even if average
   quality is acceptable.
3. **Species and assortment fit** — does the supplier consistently deliver what
   the mill needs, or is a high share rejected as incompatible?
4. **Dimensional consistency** — within-grade dimensional variance. A supplier
   whose B-grade timber is consistently at the top of B (near-A recovery) is
   valued differently from one whose B-grade timber is at the bottom.
5. **Contamination and defect rates** — foreign material, rot, excessive
   sweep/crook in load portions.
6. **Delivery reliability** — does the supplier deliver when promised? Early,
   late, or missed windows affect mill production planning.
7. **Volume reliability** — does the supplier deliver the volume they commit?
   Consistent shortfall erodes trust.
8. **Documentation quality** — correctness and completeness of delivery notes,
   certification claims, origin documents.
9. **Measurement disputes** — frequency, severity, and outcome of disputes.
   A supplier who disputes every measurement is costly regardless of quality.
10. **Price** — the effective price paid after grading, downgrades, and
    measurement variance.
11. **Payment and commercial history** — how promptly does the supplier expect
    payment; are they demanding or flexible?
12. **Recent performance** — recent deliveries weighted more heavily than old
    history. A good supplier on a bad run is treated differently from a
    consistently poor one.
13. **Current mill hunger and stock** — a hungry mill tolerates more variance;
    a full mill cuts sharply.

### A.3 Context dependency [LOCKED]

The same timber may be treated differently by the same mill depending on:

- competing supplier quality (if all suppliers are delivering weak B, the mill
  may accept it; if one supplier delivers near-A, the rest face stricter
  comparison);
- mill stock and forward consumption (hungry → wider tolerance, full →
  stricter);
- urgent production needs (a specific order may force the mill to accept
  borderline material for a short window);
- recent trust (a single bad load after a year of clean deliveries is treated
  differently from a consistent pattern);
- contract terms (frame agreement obligations may force the mill to accept
  material it would refuse on the spot market);
- market conditions (weak end-product demand → mill may reduce intake and
  tighten specifications; strong demand → wider acceptance).

### A.4 Hard technical rejection rules

Technical rejection rules (species mismatch, assortment mismatch, diameter
outside mill capability, prohibited contamination) remain hard boundaries and
are **not** subject to contextual relaxation. A sawmill that cannot physically
cut oversized logs does not become able to do so because the mill is hungry.
These rules are the floor beneath the contextual evaluation.

---

## B. Consequences of supplier ranking

### B.1 Strong relative performance

A supplier consistently ranked highly across the evaluation dimensions may
receive:

- **More requested truckloads**: the mill actively calls the supplier for
  volume, rather than waiting for offers.
- **Greater intake allocation**: a larger share of the mill's limited daily or
  weekly intake capacity.
- **Higher chance of a requested price increase being accepted**: when the
  supplier asks for +€2/m³, the mill is more likely to agree.
- **Less aggressive downgrade on borderline material**: a 50-bp quality edge
  on a load goes to the trusted supplier rather than the marginal one.
- **Faster negotiation**: supply agreements and adjustments are concluded
  quickly rather than stalled.
- **Better payment terms**: the mill may pay a trusted supplier more promptly
  (or at least less late).
- **First call during supply shortages**: when the mill needs urgent volume,
  it calls preferred suppliers before posting a public request.
- **Access to contracts or preferred-supplier status**: eligibility for frame
  agreements and longer-term arrangements.

### B.2 Weak relative performance

A supplier consistently ranked low may experience:

- **Lower intake allocation**: the mill fills its daily intake quota from
  preferred suppliers first; the weak supplier's trucks may wait or be turned
  away.
- **Fewer requested trucks**: the mill stops calling; the supplier must send
  unsolicited load proposals.
- **Stricter inspection**: each load receives more scrutiny; borderline
  material is downgraded or refused.
- **More downgrades**: grading discretion favours the mill when the supplier's
  reputation is poor.
- **Worse terms**: the mill may delay payment or demand documentation that
  less-favoured suppliers must provide.
- **Reduced trust**: the mill may begin measuring every load at the gate rather
  than relying on supplier documents.
- **Rejection of requested price increases**: requests for higher prices are
  refused or ignored.
- **Loss of preferred status**: removal from any preferred-supplier list;
  exclusion from contract eligibility.

### B.3 Voluntarily offered price increases [LOCKED]

Mills should **not** voluntarily offer higher prices merely because the player
performs well. Price improvement follows the player's request and the mill's
evaluation of that request. The mill's default behaviour is to pay its current
published price; outperforming suppliers must negotiate to capture the value of
their superior service.

Exception: a mill that is losing supply to a competitor mill due to price
differential may raise its published rate to retain inflow — but this is a
market response (`REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md §F`), not a reward
for individual supplier performance.

---

## C. Relationship state

### C.1 Multi-dimensional structure [LOCKED at concept level]

Relationship between a mill and a supplier must not be a single magical
reputation number. The proposed structured relationship state includes the
following dimensions:

| Dimension | Range | Description |
|---|---|---|
| **Trust** | 0–10,000 bp | Belief that the supplier's claims about quality, volume, and delivery are honest. Earned slowly through consistent delivery of promised quality; lost quickly on a single bad-faith load. |
| **Reliability** | 0–10,000 bp | Belief that the supplier will deliver the right volume at the right time. Based on delivery punctuality, volume consistency, and communication. |
| **Quality confidence** | 0–10,000 bp | Specific confidence in the supplier's grade consistency and dimensional control. Improves with low-variance deliveries. |
| **Payment confidence** | 0–10,000 bp | Belief that the supplier will not demand unreasonable payment terms, dispute settlements, or pressure for early payment. |
| **Dispute history** | Integer counter + severity | Count and severity of measurement disputes. A few disputes may be healthy; frequent disputes dominate the relationship regardless of other dimensions. |
| **Reciprocity balance** | Integer (positive = mill owes supplier, negative = supplier owes mill) | Running balance of favours, concessions, and flexibility traded. Not monetary — a record of non-price accommodations. |
| **Recent interactions** | Ring buffer of recent events | Last N deliveries, disputes, favours, and communications. Recent events weight more heavily in evaluation than older ones. |
| **Long-term strategic value** | Subjective AI assessment | Mill's estimate of the supplier's future importance: potential volume growth, access to rare species, willingness to invest in relationship. |
| **Personal/contact relationship** | 0–10,000 bp per contact | Where specific contact persons exist (mill procurement manager ↔ supplier contact), an interpersonal relationship dimension operates alongside the company-level one. |

### C.2 Persistent reputation vs short-term memory

**[LOCKED]** Relationship state has two timescales:

- **Persistent reputation**: the underlying long-term assessment. Slow to
  change in either direction. A supplier with 2 years of clean deliveries
  retains a high trust baseline even after one bad load.
- **Short-term memory**: recency-weighted recent performance. A supplier whose
  last three loads were contaminated will be treated as suspect today,
  regardless of long-term reputation. Short-term memory decays back toward the
  persistent reputation baseline.

The decay rate from short-term memory toward persistent reputation is
`[TUNABLE]`.

### C.3 Integration with existing system

The existing `RelationshipState` (`STEP_7`) stores warmth and trust as basis
points, with favour tracking via `AddRelationshipEvent`. This design extends
that to multiple dimensions but does not replace the existing event-sourced
pattern. Each dimension changes through explicit `RelationshipDimensionChanged`
events with a reason code.

---

## D. Relationship favours

### D.1 The favour principle [LOCKED]

A trusted supplier may occasionally sell below the best available market price
when the player has a genuine urgent need. This is:

- **rare** — favours are not a regular procurement channel;
- **finite** — each favour has a defined volume and duration;
- **explicit** — both parties understand the concession and the implied
  obligation;
- **limited in volume** — the concession applies only to a defined quantity,
  not an open-ended agreement;
- **limited in price concession** — the discount is modest, not a free gift
  (`[TUNABLE]` typical range: 2–8% below market);
- **remembered by both parties** — the favour is recorded in both the
  supplier's and the player's relationship state;
- **unavailable for routine procurement** — the supplier will refuse a favour
  request for ordinary restocking.

### D.2 Eligible urgent needs [LOCKED at concept level]

The player may reasonably request a supplier favour for:

- completing an export contract where shortfall would trigger a penalty;
- avoiding a contract penalty under an existing frame agreement;
- filling a mill commitment where a promised volume cannot be sourced at
  market price;
- bridging a temporary cash shortage where the alternative is insolvency or
  serious operational damage;
- replacing a failed delivery where the original supplier defaulted.

Favour requests for any other reason should fail or carry relationship risk.
The supplier may ask why the concession is needed; the player's honesty or
evasion becomes part of the relationship record.

### D.3 Example

- Market price for birch veneer logs is €52/m³.
- The player is short of material for an export order; breaching the contract
  would cost a €10,000 penalty.
- The player approaches a supplier with trust ≥ 7,000 bp.
- The supplier may grant €50/m³ for a limited volume (e.g., 200 m³) with a
  stated repayment expectation.
- An explicit `FavourGranted` event records the terms.

### D.4 Supplier repayment expectations

The supplier granting a favour may later expect one or more of:

- acceptance of a difficult mixed lot that the supplier is struggling to sell;
- priority intake when the supplier has urgent volume;
- rapid payment (before the usual settlement window);
- transport assistance (e.g., the player arranges and pays haulage for the
  supplier's load);
- a future price concession when the player has ample stock and the supplier
  needs material;
- first refusal on the supplier's future offerings;
- help during weak market conditions (continuing to buy from the supplier
  when the player's own intake is reduced);
- another commercially meaningful favour.

These expectations are recorded as obligations on the receiving party. They are
not contractual debts — the supplier cannot sue. But a supplier whose
expectations are consistently ignored will stop granting favours and may
downgrade the relationship.

---

## E. Favour misuse

### E.1 Legitimate use [LOCKED]

Using relationship-discounted timber for the stated emergency purpose is
legitimate. If the player obtained timber at €50/m³ to complete an export
contract and uses it for that purpose, no misuse has occurred.

### E.2 Exploitation [LOCKED]

Immediately reselling relationship-discounted timber to a neighbouring
higher-price buyer without adding value is exploitation. The player obtained a
concession intended for an emergency and converted it into profit without
solving any real problem. This is distinct from legitimate arbitrage
(`REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md §D`) because the discounted price
depended on the relationship, not on market conditions or the player's skill.

### E.3 Possible consequences of discovered misuse

If the supplier discovers the exploitation, consequences may include:

- trust loss (large, one-sided drop in the trust dimension);
- cancelled future favours (the supplier marks the player as someone who
  abuses concessions);
- market-price-only treatment (the supplier will never again offer a discount,
  regardless of the player's need);
- worse payment terms (tighter settlement expectations);
- reduced offer priority (the player's offers are deprioritised behind other
  buyers);
- negative word-of-mouth (the supplier shares the experience with other
  suppliers; `ShareGossip` mechanic in `STEP_7`);
- relationship rupture (blacklist or near-blacklist; recovery is months of
  clean dealing).

### E.4 Discovery is not automatic [LOCKED]

The supplier does not automatically know what the player did with the timber.
Discovery may occur through:

- **Visible truck movement**: the supplier sees the player's trucks delivering
  to the higher-price yard.
- **Shared port or yard**: both parties use the same AI trader yard; the
  resale is observable.
- **Industry contacts**: the supplier hears from a mutual contact that the
  player resold the material.
- **Supplier inquiry**: the supplier asks where the timber went; the player
  may lie (with relationship risk if discovered) or tell the truth.
- **Public delivery records**: where delivery information is semi-public,
  the resale may be traceable.
- **Rumours**: gossip mechanics may carry information about the transaction.
- **Direct admission**: the player tells the supplier (voluntarily or under
  pressure).

The probability of discovery depends on the player's choices, the parties,
and the information channels. A transaction between two small operators in
different regions is less visible than one at a shared port yard.

---

## F. Player choices under constraint

### F.1 The choice set [LOCKED at concept level]

When the player is short of cash or timber for a contract, the available
choices include:

1. **Request a supplier favour** — relationship capital, limited availability.
2. **Borrow** — take a working-capital loan (`STEP_3_COMPANY_FINANCE_AND_BOOKS.md`)
   or draw on a credit facility; increases interest cost and leverage risk.
3. **Sell another batch cheaply** — accept a lower price on a different deal
   to raise cash quickly.
4. **Renegotiate** — ask the mill/buyer for extended terms, partial delivery,
   or a price adjustment.
5. **Accept a penalty** — pay the contractual penalty for under-delivery;
   preserves relationship with the buyer but costs cash and may count as a
   breach.
6. **Abandon the contract** — worse than a penalty; damages relationship with
   the buyer seriously; may trigger legal consequences; may affect reputation
   with other buyers.
7. **Source inferior or distant wood** — buy lower-grade or farther-away timber
   to fill the volume at lower cost; may affect quality compliance.
8. **Delay another operation** — postpone a different commitment to free cash
   or capacity; cascading effects.

### F.2 Relationships as emergency capital [LOCKED]

Relationships should function as emergency commercial capital, not infinite
discounts. A player who routinely calls in favours for ordinary deal-making is
misusing the mechanic — the same dimension as favour misuse (section E). The
supplier will notice and respond.

---

## G. Reciprocity accounting

### G.1 The favour/obligation record [LOCKED at concept level]

Propose an explicit favour/obligation model stored as a dedicated event-sourced
entity, not as a normal monetary payable. Each obligation contains:

| Field | Type | Notes |
|---|---|---|
| `obligation_id` | Stable ID | Unique identifier |
| `granting_party` | Company ID | The party that performed the favour |
| `receiving_party` | Company ID | The party that received the benefit |
| `economic_value` | Integer (minor units) | Estimated value of the concession, for relationship-weighting purposes only |
| `reason` | String code | Categorised reason (e.g., `EMERGENCY_VOLUME`, `PRICE_CONCESSION`, `TRANSPORT_ASSIST`) |
| `granted_timestamp` | Game time | When the favour was granted |
| `expiry_timestamp` | Game time | When the obligation is considered fulfilled or expired if not called in |
| `expected_repayment_type` | String code or null | What the granting party expects in return (e.g., `PRIORITY_INTAKE`, `FUTURE_CONCESSION`, `DIFFICULT_LOT_ACCEPTANCE`) or null if unspecified |
| `status` | `OPEN` / `FULFILLED` / `REFUSED` / `EXPIRED` | Current state |
| `fulfilled_event_id` | Event ID or null | Which event fulfilled the obligation |
| `relationship_impact` | Map of dimension → bp change | Recorded changes to relationship dimensions after fulfilment or refusal |
| `visibility_scope` | Visibility enum | PUBLIC, PARTY_VISIBLE, PRIVATE — who knows about this obligation |

### G.2 Accounting treatment

**[LOCKED]** A favour obligation is:
- **Not a financial payable**. It cannot be collected through the finance
  system, declared as income, or offset against a monetary debt.
- **Not tradeable**. The obligation belongs to the specific granting and
  receiving parties; it cannot be sold or transferred.
- **Not enforceable**. The granting party cannot compel performance; the
  consequence of non-fulfilment is relationship damage, not legal action.
- **Weighted by relationship context**. A €500 favour from a long-term trusted
  supplier carries more weight than a €500 favour from a little-known
  supplier.

### G.3 Balance tracking

The `reciprocity_balance` field in the relationship state tracks the running
total of economic_value across all OPEN obligations between the two parties.
A positive balance means the mill/supplier owes the player; a negative balance
means the player owes the mill/supplier. Large imbalances in either direction
affect willingness to grant new favours.

---

## H. Negotiation

### H.1 Player-requested negotiation [LOCKED at concept level]

The player may request negotiations with a mill or supplier on specific terms.
The scope includes:

- **Higher mill price**: request a rate increase for one or more compatible
  streams.
- **Temporary supplier discount**: request a below-market price for a specific
  volume (subject to the favour mechanics in §D).
- **Extended payment term**: request slower settlement from the player's
  buyers, or request faster payment to the player's suppliers.
- **Guaranteed intake**: request that the mill commit to accepting a minimum
  volume over a period.
- **Larger allocation**: request a greater share of the mill's limited intake
  capacity.
- **Quality tolerance**: request that the mill accept borderline material that
  might otherwise be downgraded or refused. This is distinct from asking for
  a lower standard — it is asking the mill to use its grading discretion.
- **Emergency volume**: request an urgent supply from a supplier outside normal
  channels (subject to favour mechanics).

### H.2 Negotiation outcome factors

The outcome of any player-requested negotiation depends on:

- **Leverage**: does the player have alternatives the counterparty values?
  Can the player walk away?
- **Alternatives**: what are the counterparty's other options? A mill with
  three other suppliers competing for its intake has strong alternatives.
- **Market competition**: how many other buyers/suppliers are active in this
  channel right now?
- **Urgency**: how quickly does the player need an answer? Fast deadlines
  favour the counterparty.
- **Relationship**: warm/trusted relationships increase the chance of
  acceptance for reasonable requests.
- **Past promises**: has the player made and kept commitments to this
  counterparty? Broken promises reduce willingness to accommodate.
- **Requested concession size**: a small ask (+€1/m³) is easier to grant than
  a large one (+€10/m³).
- **Counterparty cash and stock**: a cash-rich mill with low stock is more
  willing to negotiate on price; a cash-poor mill may extend payment terms but
  not raise price.
- **Credibility**: does the counterparty believe the player's stated reason? A
  player known for fabricating emergencies will be treated sceptically.

### H.3 Outcome range

Negotiation outcomes are not binary pass/fail. Possible results include:

- full acceptance (requested term granted);
- partial acceptance (reduced concession);
- counter-offer (different term proposed);
- conditional acceptance (concession granted if player accepts a reciprocal
  condition);
- deferred decision (counterparty needs to check stock, talk to management);
- refusal with reason;
- refusal with relationship consequence (the counterparty is offended or
  annoyed by the request).

### H.4 Integration

Negotiation requests and outcomes are event-sourced through the command/event
system. Each `NegotiationRequested` event carries the player's request, the
counterparty's response, the decision factors, and the relationship impact.
Outcomes do not directly modify prices — they modify the terms on which the
next offer, price card, or delivery is based.

---

## I. Exploit protections

### I.1 Prohibited patterns [LOCKED]

The following patterns are prevented by design:

1. **Permanent relationship discounts.** A favour is finite and expires. No
   supplier offers a perpetual below-market price.
2. **Repeatedly requesting emergency concessions.** A player who requests a
   favour every week is not experiencing genuine emergencies. The supplier's
   willingness declines rapidly with frequency. The `reciprocity_balance`
   and recent-event ring buffer together cap exploit attempts.
3. **Favour chains with no consequence.** Using a favour from Supplier A to
   generate profit, then asking Supplier B for another favour to repay
   Supplier A, creates a cycle of perpetual discount that the relationship
   model limits: per-supplier reciprocity balance prevents repeated favour
   requests from the same counterparty. Cross-supplier favour chains can be
   capped or exposed once regional relationship networks (M5) provide
   visibility across suppliers — until then, only per-supplier protection
   applies.
4. **Buying discounted timber solely for instant resale.** The favour misuse
   mechanic (§E) handles this. If the player is discovered, the consequence
   ladder applies. The player's stated reason for the favour is recorded; if
   subsequent events contradict it, the discovery system may activate.
5. **Reputation grinding through trivial transactions.** Small, repetitive
   trades that generate no meaningful profit or risk should not produce
   relationship gains. Relationship dimension changes have a materiality
   threshold: a transaction must exceed a minimum economic value or risk level
   to affect trust and reliability scores.
6. **Hidden arbitrary bonuses disconnected from events.** Every relationship
   change traces to an explicit event with a reason code. No silent RNG-driven
   relationship drift.

### I.2 Enforcement approach

Exploit protections are **emergent from the relationship model and its
event-sourced audit trail**, not a separate blacklist or rule list. The
dimensions, thresholds, and consequence curves make the prohibited patterns
uneconomic or self-limiting before they become problems. Explicit detection
(for misuse of favour-concession material) is the only case that requires
dedicated logic — and detection is probabilistic, not automatic.

---

## J. Implementation milestones

### M1 — Explicit relationship records and supplier ranking inputs
Extend the existing `RelationshipState` to the multi-dimensional model (trust,
reliability, quality confidence, payment confidence, dispute history, recent
interactions). Each dimension changes through explicit events with reason
codes. Mills internally rank suppliers on these dimensions. The existing
gate/price-card behaviour does not yet use the ranking. Headless-verifiable:
relationship dimensions change correctly on appropriate events; the supplier
ranking list is computable from the event log.

### M2 — Mill intake allocation and requested price negotiation
Wire supplier ranking to mill intake allocation: a higher-ranked supplier's
loads are accepted first when daily intake capacity is limited. Wire the
player's ability to request a price increase from a mill; outcome depends on
ranking, mill state, and context. Headless-verifiable: with limited daily
intake, a preferred supplier's load is accepted while a marginal supplier's
identical load is refused; a price increase request from a high-ranked supplier
is more likely to be accepted.

### M3 — Finite relationship favours and reciprocity obligations
Implement the favour request, grant, fulfilment, and refusal lifecycle. The
reciprocity obligation entity and balance tracking. Favours cannot be requested
for routine procurement; genuine emergency purpose is required (enforced by
purpose code matching against contract/order state). Headless-verifiable: a
player in genuine need can obtain a limited below-market volume; a player who
attempts routine procurement via favours is refused with relationship
consequence.

### M4 — Information propagation, rumours, and favour misuse discovery
Wire discovery channels for favour misuse. Implement the probabilistic
detection model. Integrate with `ShareGossip` from `STEP_7` for negative
word-of-mouth. Headless-verifiable: reselling favour-discounted timber to a
visible yard triggers a discovery attempt; if detected, trust drops sharply
and subsequent favour requests from that supplier are refused.

### M5 — Richer AI strategy and regional relationship networks
AI competitors use the same multi-dimensional relationship model and ranking
system. Regional relationship networks emerge: a supplier in Vidzeme who has
a poor experience shares it with other Vidzeme suppliers through gossip,
affecting the player's regional discovery share (`PROCUREMENT_DESIGN.md` §10).
Headless-verifiable: poor treatment of one supplier measurably reduces offer
volume from that region over time.

---

## Cross-document consistency

This document agrees with `REGIONAL_BUYER_AND_YARD_MARKET_DESIGN.md` on the
following principles:

- Ordinary suppliers maximise expected net value; relationship may alter the
  calculation but does not replace it.
- Relationship exceptions (favours, discounts, priority treatment) are rare,
  finite, and explicit — never the default operating mode.
- Capacity and intake limits are real constraints that affect what
  relationship benefits a supplier actually receives.
- Geography, transport cost, and real economic constraints determine
  feasibility; no artificial market-share allocation exists.
- Price is not the only economic term; payment delay, grading risk, and
  relationship value are equally real dimensions of a transaction.
- Real market values remain unresolved and require research; this document
  provides structural rules, not calibrated data.
