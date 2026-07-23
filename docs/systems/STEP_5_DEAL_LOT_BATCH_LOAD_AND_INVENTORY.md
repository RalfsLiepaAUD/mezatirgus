# Step 5 — Deal, Lot, Batch, Load, and Inventory

Status: IMPLEMENTED. This document describes `FIRST_FULL_SKELETON_PLAN.md` §5, “Deal-lot-batch-load spine and inventory.” It does not expand the locked product direction.

## Scope and meanings

`Deal` is the commercial ancestry root. `Lot` is one acquired or controlled parcel under a Deal. `Batch` is the central physically coherent inventory object. `Load` is an allocation container for a movement or delivery unit; it is not a truck or transport job. Reservations, load allocations, composition vectors, lineage, and cost layers are authoritative records rather than read-model calculations.

Every entity has a schema version and deterministic namespaced ID: `DEAL-`, `LOT-`, `BATCH-`, `LOAD-`, `RESERVATION-`, `ALLOCATION-`, and `COST-`. UI labels are never keys.

## Lifecycle states

- Deal: `PROPOSED`, `ACTIVE`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELLED`, `CLOSED`.
- Lot: `AVAILABLE`, `PARTIALLY_ALLOCATED`, `FULLY_ALLOCATED`, `DEPLETED`, `CANCELLED`, `CLOSED`.
- Batch: `AVAILABLE`, `PARTIALLY_RESERVED`, `FULLY_RESERVED`, `PARTIALLY_LOADED`, `FULLY_LOADED`, `DEPLETED`, `SPLIT`, `MERGED`, `CANCELLED`, `CLOSED`.
- Load: `PLANNED`, `ALLOCATED`, `READY`, `MOVED`, `UNLOADED`, `CANCELLED`, `DEPLETED`, `CLOSED`.
- Reservation: `ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED`, `FAILED`.
- Allocation: `ACTIVE`, `FINALIZED`, `RELEASED`, `DEPLETED`.

Only transitions exercised by the Step 5 skeleton have commands. Inactive split/merged parents remain immutable lineage records.

## Units and physical representation

Authoritative timber volume is a nonnegative safe integer in thousandths of a cubic metre. Checked helpers reject underflow and overflow. Money and attributed cost use integer minor units. Composition shares use 10,000 basis points. Authoritative logic performs no floating-point money, volume, or share arithmetic.

A nonzero Batch has species, assortment, and quality vectors, each totaling 10,000. Category IDs are validated against the current Step 1 configured IDs. Freshness is `FRESH`, `AGING`, or `DEGRADED`; certainty progresses from `UNKNOWN` through claimed, estimated, inspected, sorted, and measured states. These states describe information quality, not a universal real-world grading claim.

The configured `quality.birch.a`, `quality.birch.b`, `quality.birch.tara_c`, and `quality.birch.brakis` categories allow A, B, tara/C, and brāķis to remain embedded in a mixed Batch. Tara may also be represented as an explicit separated child in a full split. In both paths, physical volume is conserved. Brāķis denotes the configured reject category only; it is not generalized beyond that provenance.

## Ownership, custody, and location

Owner, physical custodian, and current location are independent fields. Ownership and custody require explicit transfer events. Neither transfer moves timber. A move changes only location and movement metadata; it preserves owner, custody, composition, and volume.

All active locations must exist in the Step 4 routing domain. A Step 5 move is immediate at the command timestamp and is accepted only when Step 4 returns an open route. The event stores route edge IDs, integer distance, and integer travel time. A blocked, closed, or disconnected route rejects atomically. No carrier capacity, pricing, truck, driver, dispatch, or transport job is introduced.

## Reservations and allocations

An active Reservation removes its exact volume from availability but not from physical stock. A Reservation can be released once, expire at an exact scheduled simulation second, or be consumed by an exact matching load allocation. Scheduled expiry uses `JOB_PROGRESS`; a later stale expiry event is a reducer no-op.

An Allocation links one source Batch to one Load and retains source ancestry. A Batch may feed several Loads and a Load may receive several compatible Batches, but available plus valid reserved capacity is checked before event identity is consumed. Releasing an active allocation restores source availability; a finalized or released allocation cannot be released again.

## Split and merge rules

Step 5 uses a full explicit-child split: two or more positive child volumes must sum exactly to the active parent’s current volume. The parent becomes `SPLIT` and non-allocatable. Children inherit owner, custody, location, freshness, certainty, and the unchanged composition vector. This preserves every embedded share, including A, B, tara, and brāķis. A separated tara operation is represented by an explicitly sized child while total physical volume remains exact.

Active cost layers are divided in proportion to child volume with `BigInt` numerator arithmetic. Integer floors are calculated first; remaining minor units are assigned by descending fractional remainder, then child input order. The event stores every child and allocated layer, so replay never recomputes historical rounding.

Merge requires at least two distinct active Batches with the same root Lot, owner, custodian, location, no active reservation, and no active/finalized load allocation. Sources become `MERGED` and non-allocatable. The merged volume is the exact sum. Differing composition vectors use volume-weighted integer basis points; fractional remainder is assigned by descending remainder and then first configured category order. Source cost layers become allocated lineage records and exact inherited layers are attached to the merged Batch. Events store the complete calculated result.

## Depletion and conservation

Batch depletion may consume only unreserved and unallocated current volume, once per emitted event. Load depletion is separately bounded by its unreconciled allocated quantity. Conservation reports count active leaf Batches only, preventing split/merge ancestors from duplicating physical stock. The principal identity is recognized volume = current leaf volume + depleted leaf volume; reserved and allocated quantities partition current volume and never add physical stock.

## Cost layers and finance boundary

Cost layers are non-destructive attribution records on Deals, Lots, Batches, or Loads. They contain a category, EUR minor units, attributable volume, allocation method, source object, optional parent layer, optional existing finance source, and provenance reference. Supported skeleton categories include acquisition, operational/handling placeholders, transport/financing attribution placeholders, adjustment, and inherited cost.

If supplied, a finance source must be an existing Step 3 commitment, payable, receivable, or journal transaction. Adding, splitting, merging, or moving cost layers never posts a journal transaction, changes cash, creates revenue, creates a receivable, applies tax, or silently reverses finance. Read models keep attributed physical cost distinct from cash paid, payable recognized, committed, and forecast values; unavailable finance aggregates are explicitly `null` rather than invented.

## Commands, events, and phases

Production handlers cover Deal creation/activation/cancellation/closure; Lot and initial Batch creation; Reservation creation/release/expiry; Batch split and merge; Load creation; load allocation/release/finalization; Batch and Load movement; unload and depletion; owner/custody transfer; and cost-layer attribution.

Accepted commands emit immutable events through the core envelope. Principal events are `DealCreated`, `DealActivated`, `DealCancelled`, `DealClosed`, `LotCreated`, `BatchCreated`, `BatchSplit`, `BatchesMerged`, `InventoryReservationCreated`, `InventoryReservationReleased`, `InventoryReservationExpired`, `LoadCreated`, `BatchAllocatedToLoad`, `LoadAllocationReleased`, `LoadAllocationFinalized`, `BatchMoved`, `LoadMoved`, `LoadUnloaded`, `BatchDepleted`, `LoadDepleted`, `OwnershipTransferred`, `CustodyTransferred`, and `CostLayerAdded`.

Commercial control events use `COMMANDS`; physical mutations use `PHYSICAL_STATE`; scheduled expiry uses `JOB_PROGRESS`. The existing engine clock and ordering rules remain the sole time authority. Validation completes before IDs or insertion positions are reserved, preserving rejected-command atomicity.

## Persistence, migration, replay, and checksums

Core version is 0.5.0 and save/snapshot schema version is 4. Migration 3→4 adds one deterministic empty Inventory snapshot and recomputes the snapshot checksum without dropping Step 1–4 fields. Inventory state, scheduled expiries, lineage, allocations, reservations, cost layers, exact calculated remainders, and all counter namespaces are authoritative and included in the state checksum.

Replay applies the original immutable Step 5 events through `InventoryDomain.apply`. It observes IDs embedded in creation, split, and merge payloads so the next entity cannot collide. Duplicate inventory event application fails before mutation. No Step 5 event consumes RNG.

## Read models and CLI

Plain TypeScript read models provide:

- Deal tree with Lots, Batches, Loads, Reservations, Allocations, ancestry, and both reconciliations;
- inventory grid exposing owner, custodian, location, lifecycle, total/available/reserved/allocated volume, compositions, freshness, certainty, attributed cost, and unavailability reasons;
- recursive Batch ancestry;
- volume-weighted Load composition;
- inventory reconciliation with checksum;
- cost-layer reconciliation with checksum.

Every read model snapshots or clones authoritative data and consumes no RNG. `pnpm inventory:demo` uses production commands/events to exercise reservation, split, embedded categories, merge/rejection, two Loads, double-allocation rejection, route movement/blocking, unload, depletion, reconciliation, save, load, and replay.

## Known limitations and Step 6 exclusions

Step 5 deliberately uses diagnostic Deal/Lot creation and immediate manual route movement. Partial splits use an explicit remainder child rather than retaining volume in the parent. Composition categories are basis-point vectors rather than individual logs. Load unloading is a lifecycle marker; transport execution and receiving workflows remain later work. Cost read models expose unavailable ledger-category breakdowns as `null`.

No buyer, buyer demand, price card, mill measurement, buyer payment, sale receivable, supplier offer/negotiation, dispute, transport job, truck, carrier price, yard machinery, harvesting, auction, React UI, or other Step 6 behavior was started.
