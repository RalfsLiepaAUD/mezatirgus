# Step 7 — Suppliers, Offers, Documents, Relationships, and Intel

Status: IMPLEMENTED. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §7. All suppliers, contacts, behavior, gossip, and intel are fictional.

## Entities and information boundary

The authoritative supplier domain contains Supplier, SupplierContact, Offer, DocumentSet, SupplierDocument, RelationshipState, and IntelItem. Stable namespaced IDs are used for every record. Supplier reliability traits and Offer truth remain authoritative hidden state. Ordinary supplier and Offer read models omit those fields and expose only known facts, bounded actor belief, validated documents, relationship state, and visibility-permitted intel.

An Offer’s truth contains actual volume, freshness, and configured composition. Actor belief separately stores a volume range, freshness belief, confidence in basis points, and information-source IDs. Belief never becomes exact merely because truth exists. A physical inspection is a valid source that narrows the range while retaining nonzero uncertainty. A freshness answer is a valid but fallible supplier source; its deterministic reliability draw and derived answer are stored in the immutable event and verified during replay.

## Offer lifecycle and expiry

Offers are `OPEN`, `ACCEPTED`, `REJECTED`, `EXPIRED`, or `FAILED_DOCUMENTS`. Creation schedules `OfferExpired` at the exact integer simulation second in `JOB_PROGRESS`. Expiry never fires early. An expiry event is stale-safe after rejection, acceptance, or document failure. Acceptance is valid only strictly before the expiry timestamp and is single-use.

Offer pricing uses integer minor units per m³. The effective rate stores an inspectable relationship adjustment derived from current warmth; consistent fast settlement can therefore improve a later offer without retroactively changing an existing one. There is no random price noise.

The volume basis is explicit:

- `AGREED_VOLUME` creates physical and provisional payable quantities from agreed Offer volume.
- `MILL_MEASURED_VOLUME_PLACEHOLDER` retains the same provisional skeleton chain but marks Batch certainty as estimated and preserves the future measurement-basis linkage.

## Documents

Each Offer creates one DocumentSet with explicit required document types. `AddDocument` stores type, issuer, reference, and exact validity interval. `ValidateDocumentSet` checks both presence and validity at current simulation time. Missing or invalid requirements produce `MISSING_OR_INVALID` plus the exact missing list.

Attempting to accept an unvalidated or incomplete set emits `OfferFailedForMissingDocuments` and terminally fails that Offer. It creates no Deal, inventory, commitment, payable, journal, or cash movement. A valid set permits acceptance.

## Commercial, inventory, and finance chain

One accepted Offer event stores the complete deterministic result:

`Offer → Deal → Lot → initial Batch → Commitment → Payable`.

The event is applied through the production supplier, inventory, and finance reducers. Deal/Lot/Batch preserve the Offer, supplier/contact, location, basis, composition, freshness/certainty, and ancestry links. The payable is:

`floor(offered milli-m³ × effective minor units/m³ ÷ 1000)`.

Acceptance recognizes a balanced acquisition-expense/accounts-payable journal and schedules the existing payable due/overdue events. It never changes cash directly. Settlement occurs only through the existing `RecordPayablePayment` finance command.

## Relationships, favors, and settlement consequences

Relationship warmth, trust, and favor use integer basis points clamped to 0–10,000. Every change is an explicit immutable event with a reason. After the payable is fully settled, `RecordSupplierSettlementOutcome` compares the exact payment timestamp with the payable due timestamp:

- on-time/fast settlement increases warmth and trust;
- late settlement decreases warmth and trust;
- the linked commitment becomes settled;
- the outcome can be recorded only once.

Favor can be gained through `AddRelationshipEvent`. `ShareGossip` requires and consumes an explicit favor amount while creating a sourced IntelItem. No relationship or favor changes silently.

## Intel and gossip

Every IntelItem stores subject, source, summary, confidence basis points, visibility, timestamp, causal event references, kind, and event provenance. Ordinary feeds include only `PUBLIC` and `PLAYER_VISIBLE` items. `PRIVATE_SOURCE` truth is retained authoritatively but excluded from the player feed. Read models return defensive copies and consume no RNG.

## Commands and events

Commands: `CreateSupplier`, `CreateSupplierContact`, `CreateOffer`, `AskFreshnessQuestion`, `InspectOffer`, `AddDocument`, `ValidateDocumentSet`, `AcceptOffer`, `RejectOffer`, `ExpireOffer`, `RecordSupplierSettlementOutcome`, `AddRelationshipEvent`, `CreateIntelItem`, and `ShareGossip`.

Events: `SupplierCreated`, `SupplierContactCreated`, `OfferCreated`, `OfferFreshnessAnswered`, `OfferInspectionRecorded`, `DocumentAdded`, `DocumentSetValidated`, `OfferAccepted`, `OfferRejected`, `OfferExpired`, `OfferFailedForMissingDocuments`, `SupplierSettlementRecorded`, `RelationshipChanged`, `FavorChanged`, `IntelItemCreated`, and `GossipShared`.

## Persistence, replay, and CLI

Core version is 0.7.0 and save/snapshot schema version is 6. Migration 5→6 adds deterministic empty supplier state and rechecksums the snapshot without discarding Steps 1–6. Supplier state, truth/belief separation, documents, scheduled expiries, commercial links, relationships, intel, RNG state, and all nested IDs are authoritative and replayed through production reducers.

`pnpm supplier:demo` demonstrates missing-document failure, uncertain belief, freshness question, inspection, document validation, acceptance, Deal/Lot/Batch/Payable creation, explicit settlement consequences, favor-funded gossip, save/load, and matching replay checksums.

## Known limitations and Step 8 exclusion

Step 7 uses one-way Offer terms, one deterministic inspection rule, one freshness question, simple relationship-adjusted pricing, coarse document types, and a placeholder mill-measured basis. It does not implement bargaining, supplier distress, legal-document interpretation, adaptive contact dialogue, automatic future Offer generation, or generalized social graphs.

No hired logistics, carrier market, transport job, payload pricing, truck capacity, or dispatch queue from Step 8 was started.
