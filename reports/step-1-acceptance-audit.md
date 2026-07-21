# Implementation Step 1 Acceptance Audit

Status: Step 1 configuration audit only. Step 2 has not started.

## Requirement-to-test matrix

| # | Requested check | Production-path test |
|---:|---|---|
| 1 | Complete valid configuration | `accepts the complete valid configuration` |
| 2 | Duplicate IDs | `rejects duplicate IDs` |
| 3 | Missing references | `rejects missing references` |
| 4 | Missing schema version | `rejects a missing file schema version` |
| 5 | Missing configuration version | `rejects a missing configuration version` |
| 6 | Invalid integer units | `rejects invalid integer units` |
| 7 | Floating-point money | `rejects floating-point money` |
| 8 | Floating-point timber volume | `rejects floating-point timber volume` |
| 9 | Missing provenance | `rejects missing provenance` |
| 10 | Invalid provenance category | `rejects an invalid provenance category` |
| 11 | VERIFIED missing source or locator | `rejects VERIFIED provenance without a source file`; `rejects VERIFIED provenance without a locator` |
| 12 | PLACEHOLDER not tunable | `rejects PLACEHOLDER provenance that is not tunable` |
| 13 | UNCERTAIN not research-required | `rejects UNCERTAIN provenance that is not research-required` |
| 14 | ASSUMED neither tunable nor research-required | `rejects ASSUMED provenance that is neither tunable nor research-required` |
| 15 | Invalid species-assortment compatibility | `rejects invalid species-assortment compatibility` |
| 16 | Missing buyer product reference | `rejects a missing buyer product reference` |
| 17 | Generic wood | `rejects generic wood` |
| 18 | Every buyer accepts every assortment | `rejects every buyer accepting every assortment` |
| 19 | Invalid percentage | `rejects an invalid percentage` |
| 20 | Proportions do not total 10000 basis points | `rejects required proportions not totaling 10000 basis points` |
| 21 | Prohibited negative values | `rejects prohibited negative values` |
| 22 | Missing scenario references | `rejects missing scenario references` |
| 23 | Deterministic hash stability | `produces a stable deterministic hash` |
| 24 | Object-key order does not affect hash | `ignores object-key order when hashing` |
| 25 | Whitespace does not affect hash where applicable | `ignores JSON whitespace where applicable` |
| 26 | Numeric change changes hash | `changes the hash when a numeric value changes` |
| 27 | Provenance change changes hash | `changes the hash when provenance changes` |
| 28 | Display-name change preserves references | `preserves relational validity when display names change` |
| 29 | Complete UTF-8 round trip | `round-trips the complete UTF-8 set` |
| 30 | Provenance manifest includes all weak assumptions | `puts every used weak assumption in the provenance manifest report` |
| 31 | Configuration modules have no React dependency | `keeps configuration modules free of React dependencies` |

Supplemental acceptance tests cover three-business-day auction semantics, both assumed bid increments, all location regions/roles, three distinct supplier archetypes, independent finance concepts, and nested provenance exposure.

## Required data coverage checklist

| File | Step 1 concept present | Evidence |
|---|---|---|
| `manifest.json` | Yes | Bundle/version/file registry and provenance catalog |
| `species.json` | Yes | Six explicit timber species; no generic wood |
| `assortments.json` | Yes | Five explicit assortments with compatible species IDs |
| `quality.json` | Yes | Grades, diameter brackets, tara reasons, certainty states, composition |
| `locations.json` | Yes | Latvia regions, role-tagged roadside/yard/buyer/port, external Europe |
| `buyers.json` | Yes | Four fictional specialized buyer archetypes and acceptance rules |
| `suppliers.json` | Yes | Three fictional, commercially distinct supplier archetypes |
| `transport.json` | Yes | Efficient and small-trader tiers, rates, distance, early default |
| `seasons.json` | Yes | Four date windows and provenance-tagged behavioral modifiers |
| `auctions.json` | Yes | Deposit, allowed increments, extension, semantic deadlines, penalty, tolerance, transfer, results |
| `finance.json` | Yes | Difficulty cash, loan, revolving credit, discount, buyer/supplier terms, VAT treatment |
| `markets.json` | Yes | Species-assortment reference-rate anchors |
| `forests.json` | Yes | Fictional asset, estimated volume, composition, regeneration state |
| `ports.json` | Yes | Fictional port terminal and capacity |
| `scenario_first_full.json` | Yes | Connected starter references including external destination |

## Scope confirmation

No runtime gameplay, UI, React application, or Step 2 feature was added. These changes remain configuration schemas, validation, seed records, provenance reporting, and acceptance tests for Implementation Step 1.