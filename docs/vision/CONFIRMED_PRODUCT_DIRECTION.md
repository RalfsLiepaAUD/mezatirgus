# Confirmed Product Direction

## Authority and scope

This document consolidates the product direction already locked in `DESIGN_DECISIONS.md`, the design set, and the valid source set. It does not replace the locked decisions. Where wording differs, the locked decisions win. The corrected auction reference is used with its `[VERIFIED]`, `[ASSUMED]`, and `[UNCERTAIN]` labels intact.

## One-sentence product identity

**Mežtirgus is a realistic-but-playable, pausable forestry-company simulator in which a tiny Latvian timber trader grows into an integrated European forestry, logistics, storage, trading, and export business by managing narrow margins, imperfect information, physical timber, and the cash conversion cycle.**

## Player role

The player is the commercial operator of one company in a shared, finite economy. The player sources wood, judges uncertain quality, chooses destinations, finances working capital, routes loads, negotiates contracts, manages relationships, acquires assets, hires people, and expands into harvesting and exports. Technical forestry work is converted into commercial estimates and contracts; the player makes the consequential business decisions rather than operating machinery or prescribing cuts.

## Starting position

The initial company is deliberately weak:

- approximately €25,000-€40,000 free cash, selected by difficulty;
- no loan or credit facility;
- no truck, yard, forest, or employee;
- a few supplier contacts and known buyers;
- little reputation, limited information, and negligible bargaining power.

The permanent financial view distinguishes **free cash**, **committed payments**, and **receivables**. The start must make profitable deals possible while making simultaneous commitments dangerous.

## Progression arc

Small roadside trader → several profitable trades → proven transaction history → first working-capital loan → first rented or owned yard → larger-volume trading and sorting → first owned truck → fleet and dispatcher → standing-timber purchases → contracted harvesting → forest ownership → port aggregation → European trade → integrated forestry company.

Progress is capability-based, not an upgrade ladder. Assets add obligations, fixed costs, and new failure modes. Scale should emerge from turnover, information, operational efficiency, and access to capital—not implausible markups.

## Realism level

The target is **realistic but playable**. Commercial causality and accounting consequences must be credible; operational detail is included only when it creates an intelligible decision.

### Simulated directly

- species, assortment, diameter brackets where commercially relevant, quality composition, freshness, and certainty;
- buyer compatibility, capacity, stock, consumption, intake plans, dynamic price cards, hunger, gate behavior, grading, measurement, disputes, payment behavior, and purchase stops;
- suppliers, offers, auctions, documents, relationships, contracts, competitors, and market intelligence;
- lots, batches, loads, inventory, location, roads, transport, trucks, drivers, yards, sorting, ports, and vessel quotes;
- cash, commitments, receivables, payables, loans, credit, factoring/insurance/leasing later, financing cost, accounting, and insolvency;
- standing timber, forest assets, commercial harvest estimates, contracted harvesting, outturn, access risk, and later reforestation obligations;
- seasons, causal market regimes, conserved capacity, shared opportunities, and seeded events.

### Abstracted

- individual tree and log geometry;
- machine controls, cutting patterns, mechanical repairs, and detailed maintenance procedures;
- detailed silviculture and ecology;
- full tax filing, non-timber overhead VAT initially, and detailed labour law;
- technical forestry execution beyond automatic estimates, schedules, major risks, and commercial contracts.

## Sources of fun

- finding value in uncertain piles and learning whose estimates can be trusted;
- routing each assortment to the buyer whose compatibility, hunger, measurement, payment term, and distance produce the best risk-adjusted outcome;
- surviving the gap between fast supplier payment and slow buyer settlement;
- reading causal market signals before competitors do;
- choosing when sorting, storage, contracts, financing, or logistics assets are worth their carrying cost;
- building a contact network whose favors and intelligence create real option value;
- discovering buyer and supplier behavior through records rather than omniscient statistics;
- scaling a fragile set of deals into a resilient integrated company without removing the possibility of failure.

## Locked design laws

The complete, authoritative list of locked design laws lives in a single place: `DESIGN_DECISIONS.md` §1 ("Design laws [LOCKED]"). This document does not restate them, to avoid drift — read them there.

## Target player experience

At first, the player should feel undercapitalized, unknown, and dependent on phone calls, hired trucks, and a few imperfect opportunities. A good-looking spread should become a real decision only after transport, quality, measurement, timing, documents, and payment risk are considered. Over time the player should build a private mental model—and later an operational data system—of suppliers, buyers, routes, seasons, and competitors.

The game should feel thoughtful rather than frantic: pause, compare, commit, then watch consequences propagate. Growth should feel earned because each new capability connects to the same timber, money, location, time, and information flows.

## What the game is not

- not a generic online marketplace or UK platform-compliance simulation;
- not a forestry-machine, logging, or ecology simulator;
- not a city-builder or conventional upgrade-clicking tycoon;
- not an arcade dispatch game;
- not a deterministic spreadsheet with perfect information;
- not a story generator or AI-narrator project;
- not a polished narrow prototype with disconnected screens;
- not a claim that every Latvian buyer measures, grades, pays, or negotiates alike;
- not a vehicle for presenting `[ASSUMED]` LVM mechanics as Latvian law or contractual fact.

## Research and legal boundaries

Domestic B2B timber transactions between VAT-registered Latvian companies use no VAT cash movement in the core timber engine `[VERIFIED]`. Exact LVM deposit, increment, extension, payment, removal, penalty, volume-tolerance, and title-transfer mechanics remain centralized `[ASSUMED]` values and `RESEARCH_REQUIRED`. EUDR, certification, export documentation, and permit responsibility should enter only at the level supported by provenance and the planned system stage.

