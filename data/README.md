Configuration data for the simulation lives here. This directory is already
populated — the files below are the actual data bundle loaded and validated
by `src/config/*` (run `pnpm validate:config` to check it).

- `manifest.json` — bundle/version/file registry and provenance catalog
- `species.json` — species definitions (birch, spruce, pine, aspen, alder, oak)
- `assortments.json` — assortment definitions (veneer logs, sawlogs, pulpwood, energy wood, reject)
- `quality.json` — grades, diameter brackets, tara reasons, certainty states
- `locations.json` — Latvia location graph (roadside/yard/buyer/port nodes, external Europe destination)
- `buyers.json` — fictional buyer archetypes and compatibility/acceptance rules
- `suppliers.json` — fictional supplier archetypes
- `transport.json` — hired-transport tiers, rates, distance defaults
- `seasons.json` — season windows and behavioral modifiers
- `auctions.json` — auction mechanics assumptions (deposits, increments, deadlines)
- `finance.json` — starting cash, loan/credit terms, buyer/supplier payment terms, VAT treatment
- `markets.json` — species/assortment reference-rate anchors
- `forests.json` — forest asset fixtures
- `ports.json` — port terminal and capacity
- `scenario_first_full.json` — connected starter scenario references

Every numeric or behavioral value in these files carries a provenance record
(source, category — VERIFIED/RESEARCH_UPDATED/FIRST_HAND/DESIGN_INFERENCE/
TUNABLE/PLACEHOLDER/ASSUMED/UNCERTAIN — confidence, tunable/research-required
flags). `reports/provenance-manifest.md` is the generated traceability report
over this data; it is produced by `pnpm report:provenance` — do not hand-edit
it, and do not regenerate it as a side effect of unrelated changes.
