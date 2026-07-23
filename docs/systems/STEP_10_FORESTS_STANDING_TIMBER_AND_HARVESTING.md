# Step 10 — Forests, Standing Timber, and Harvesting

Status: IMPLEMENTED. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §10. Forests, contractors, and commercial records are fictional.

The authoritative forest domain contains `ForestParcel`, `HarvestRight`, `HarvestPlan`, `HarvestJob`, and generic `ScheduledObligation` records. Forest truth stores standing volume, composition, recovery, and uncertainty. Ordinary read models omit truth and expose only bounded belief, permit/access state, rights, plans, jobs, and obligations. Survey improves belief while retaining a nonzero range.

Plans require a current right-to-harvest, valid company, integer requested volume/cost/duration, and an active directed forest-to-roadside route. Starting additionally requires a valid or unnecessary permit and atomically revalidates the exact route and remaining standing volume. Draft plans create no job, inventory, commitment, or payable.

Confirmed start draws once from the named `forest` RNG stream. The immutable start event stores draw, recovery adjustment, realized roadside volume, residues/losses, remaining standing volume, inventory identities, finance identities, and exact completion. Rejected starts consume no RNG. Cancellation releases the harvesting commitment and makes completion plus its nested deadlines stale.

Completion removes the planned standing volume and satisfies:

`original standing = completed removals + remaining standing`

`removed standing = realized roadside timber + residues/losses`

One standing harvest remains one Deal and one Lot. Realized volume is split deterministically into species-specific roadside Batches using integer largest-remainder allocation; Batch totals equal Lot volume. Owner remains the rights-holder company, custody is the fictional contractor, and location is the roadside endpoint. Nothing teleports before completion.

Start creates one harvesting-cost commitment. Completion creates one linked Payable, balanced expense/payable journal, and Lot cost layer. Cash changes only through existing payable settlement. Final harvest advances regeneration to `REFORESTATION_DUE` and schedules a generic reforestation obligation.

Core version is 0.10.0; save/snapshot schema is 9. Migration 8→9 adds empty forest state while retaining Steps 1–9. Hidden truth, beliefs, stored RNG, pending results, deadlines, inventory/finance links, and counters are checksummed and replayed through production reducers.

Known limitations: abstract harvesting contractor and permit, one route, aggregate species/assortment/quality vectors, coarse residue recovery, no seasons or machines, and reforestation settlement/regeneration progress remain later work.

Step 11 (yard, truck, driver, employee, lane, dispatch) was implemented separately — see `STEP_11_YARD_TRUCK_EMPLOYEE_LANE.md`.
