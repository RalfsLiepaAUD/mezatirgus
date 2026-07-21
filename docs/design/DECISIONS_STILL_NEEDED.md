# Decisions Still Needed

## Scope

This file contains unresolved items only. Questions already locked by `DESIGN_DECISIONS.md` are excluded. Research verification and balance tuning are separated from product-owner choices.

## 1. Blocking before any implementation

**None.**

Implementation Step 1—configuration schemas, stable IDs, units, provenance validation, and the placeholder/research-gap manifest—is unblocked by product-owner decisions.

## 2. Blocking before a later system

**None currently.**

Forest regeneration obligations, the load-aggregation ceiling, and player-side grading/measurement agency are locked in `DESIGN_DECISIONS.md`.

## 3. Research-required

These require evidence, not product-owner preference. Until verified, use centralized assumptions.

### 3.1 Exact prepared-roundwood auction mechanics
Why: affects deposits, increments, extensions, deadlines, penalties, tolerance, and transfer. Systems: auctions, finance, ownership, AI, documents. Default: corrected-v2 assumptions labeled `ASSUMED/RESEARCH_REQUIRED`. Change cost: configuration only.

### 3.2 Standing-timber permit, title, and responsibility by channel
Why: determines permit holder, harvest start, and compliance risk. Systems: auctions, forests, documents, harvesting. Default: configurable per channel with valid permit required. Change cost: low-to-moderate migration.

### 3.3 Latvian production and trade matrices
Why: supply and assortment calibration. Systems: markets, suppliers, competitors. Default: normalized `PLACEHOLDER` distribution until direct official extraction. Change cost: configuration only.

### 3.4 Stumpage, contractor, and spot-haulage rates
Why: forest valuation and small-trader logistics. Systems: harvest estimates, offers, transport, AI. Default: sourced national anchors plus explicit placeholder decomposition; LVM formula is only an efficient floor. Change cost: configuration only.

### 3.5 Port handling and sea-charter distributions
Why: export netback and working-capital risk. Systems: ports, chartering, export, finance. Default: fictional scenario quotes labeled `PLACEHOLDER`. Change cost: configuration only.

### 3.6 Certification cost and period-specific status
Why: access, premiums, and overhead. Systems: documents, buyers, forests, export. Default: scoped corrected-reference assumption and deferred overhead. Change cost: low-to-moderate data migration.

### 3.7 Destination-specific export document rules
Why: route/date-specific phytosanitary and customs gates. Systems: export, documents, ports. Default: intra-EU first skeleton; verified rule packs later. Change cost: low.

## 4. Tunable during playtesting

| Item | Starting treatment |
|---|---|
| Starting cash/difficulty | €30k normal within locked €25k–€40k range |
| Credit unlock pace | Several settled deals and clean payment history |
| Quality/estimation | Locked structure; tune distributions |
| Buyer hunger/gate/measurement caps | Fictional archetypes with bounded seeded variation |
| Payment timing/instant pay | Buyer-specific 2–30 days; about €5/m³ discount where offered |
| Relationships | Slow gain, asymmetric damage, evidence-based recovery |
| Sorting/yard/degradation | €2–4/m³ sorting anchor plus explicit loss |
| Transport utilization | Preserve spot versus efficient-floor separation |
| Contracts | Tune tolerance, bonus, and penalty |
| Market regimes | Tune drivers/duration so strategies vary |
| Aggregation stability threshold | Tune clean-repetition count; aggregation remains opt-in |
| Misconduct detection | Tune detection, memory, and consequences; agency remains locked |
| Regeneration | Tune/research timing and cost; obligation structure remains locked |
| Competitors | Skeleton one; target 8–12 plus cloud |

## 5. Safe placeholders for the first skeleton

| Placeholder | Treatment |
|---|---|
| Technical stack | Choose for deterministic core, tests, UI, and headless runs |
| Tick/snapshot interval | Fixed tick plus scheduled timestamps |
| Fictional names/locations | No one-to-one real profiles |
| Sparse Latvia graph | Small explicit node/edge network |
| Price coefficients | Documented causal model |
| Loan terms | Conservative fictional product |
| Harvest decomposition | Sourced totals with labeled components |
| Generic scheduled obligations | One-path scheduled/due/settled/overdue entity |
| Lane repetition count | Centralized threshold |
| Employee/yard/port values | Fictional labeled values |
| Charter/test cargo | Fictional quote; test scale labeled |
| Auto-dispatch | Replaceable player-known heuristic |
| UI | Tables, forms, debug views |
