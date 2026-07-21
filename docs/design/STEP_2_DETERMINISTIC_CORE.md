# Step 2 Deterministic Core

Status: Implementation Step 2 complete. This document describes infrastructure only; Step 3 finance and all gameplay systems remain unimplemented.

## Clock and tick model

The canonical tick is **3,600 game seconds (one game hour)**. The choice is technical, centralized in `src/core/constants.ts`, and versioned as tick model version 1. It is coarse enough for a 90-day headless run (2,160 ticks) while retaining useful future job/event boundaries.

At normal speed, one wall second converts to 6,048 game seconds. Therefore five wall minutes convert to 1,814,400 game seconds: exactly 21 game days or 504 ticks. Conversion uses integer arithmetic and carries a serialized remainder; it never uses frame time or floating-point accumulation.

| Speed | Multiplier | Game seconds per wall second |
|---|---:|---:|
| `1X` | 1 | 6,048 |
| `3X` | 3 | 18,144 |
| `FAST` | 10 | 60,480 |

Speed changes only wall-time-to-tick conversion. Direct fixed-tick and advance-until APIs produce the same simulation output at every selected speed. Normal advancement while paused is a no-op. A deliberate `force` option exists only for headless/test advancement. Time is monotonic, uses safe integers, and rejects negative, backward, and overflowed values. `advanceUntil` accepts exact integer-second timestamps.

## Stable phases and processing boundaries

Each canonical hour is an outer processing window. The clock stops at every queued timestamp inside that hour, processes all phases there, and then continues to the hour boundary. The named phases are:

1. `COMMANDS`
2. `FINANCIAL_SETTLEMENTS`
3. `JOB_PROGRESS`
4. `PHYSICAL_STATE`
5. `BUYER_CONSUMPTION`
6. `CAPACITY_AND_CONTRACTS`
7. `MARKET_DRIVERS`
8. `PRICE_CARD_PUBLICATION`
9. `AI_PERCEPTION_AND_DECISION`
10. `INTEL_REPORTING_AND_AUTOPAUSE`
11. `INVARIANT_CHECKS_AND_SNAPSHOT`

Only command, diagnostic, and core invariant/persistence infrastructure has behavior in Step 2. Scheduled timestamps are exact integer game seconds: they are never rounded and never fire early. At each exact timestamp, all phases run in order before advancement continues. `ClockAdvanced` is the boundary marker and sorts before other events at that timestamp.

Events sharing a timestamp are ordered by:

1. game timestamp;
2. phase number;
3. actor ID followed by sorted target IDs;
4. persistent insertion sequence;
5. event ID.

No object-map iteration order participates in scheduling.

## Commands and events

The core is authoritative. CLI callers submit versioned command envelopes containing command ID/type, issued time, requested execution time, actor, payload, schema version, and optional causal metadata. Handlers are explicitly registered.

Step 2 handlers are limited to `SetSpeed`, `PauseSimulation`, `ResumeSimulation`, `ScheduleDiagnosticEvent`, and headless/test-only `AdvanceSimulation`. Invalid commands return a structured code/message and are checked to have caused no authoritative-state mutation. Accepted commands emit immutable domain events. No gameplay command exists yet.

Domain events include stable ID, type, game time, phase, actor/targets, causal parent, schema version, visibility, payload, insertion sequence, and SHA-256 checksum. Visibility is `PUBLIC`, `PLAYER_PRIVATE`, `ACTOR_PRIVATE`, or `DEBUG_ONLY`. The log is append-only; callers receive defensive copies. Future corrections must be compensating events.

## Deterministic RNG

Named streams use a 64-bit SplitMix64 sequence. Each stream's initial state is derived independently from SHA-256 of `seed + stream name`; streams are created lazily, so adding or inspecting an unrelated stream cannot perturb existing streams. State and draw count are serialized as hexadecimal state plus integer count.

Reserved future stream names are:

`core`, `market`, `buyer`, `supplier`, `transport`, `auction`, `competitor`, `forest`, `measurement`, and `events`.

Reporting and diagnostics read snapshots only and consume no draws. Simulation source contains no `Math.random` usage.

## Persistence, snapshots, and replay

Development saves are inspectable UTF-8 JSON. The version-1 save envelope contains:

- save schema version and core version;
- configuration bundle version and hash;
- scenario ID and seed;
- current game time, pause state, and selected speed;
- entity-counter state;
- named RNG stream states and draw counts;
- event insertion counter;
- snapshot sequence;
- checksummed snapshot state;
- immutable events after the snapshot;
- optional command history;
- player-preferences placeholder;
- expected authoritative-state checksum;
- save checksum and optional migration history.

Snapshots include their schema version, sequence, creation time, event-log index, complete authoritative core state, and checksum. Compatibility and checksum are validated before restore. Replay starts from the snapshot and returns the engine produced by applying later immutable events through the same production reducer. Stored final state is used only as a validation target. Replay observes event IDs to reconstruct persistent counters, reconstructs insertion order and queue consumption, and must match the saved clock, counters, RNG state, and authoritative checksum. Random outcomes are stored in domain-event payloads. For events explicitly marked as RNG-derived, replay advances the named stream and verifies the regenerated draw against that stored material; events without that marker consume no draw. This preserves auditability while restoring exact stream position.

The current-version migration path is a no-op. A deterministic version-0-to-1 hook demonstrates ordered migration, records migration history, preserves prior keys, and fails if a migration discards an existing field. Future/unknown versions and old versions without a registered path fail clearly.

Canonical JSON recursively sorts object keys. SHA-256 checksums cover authoritative state, each event excluding its own hash, the save envelope excluding its own checksum, and snapshots excluding their own checksum. UI state, host timers, display caches, and other transient projections are absent.

## CLI diagnostics

```text
pnpm sim:demo
pnpm sim:replay
pnpm sim:inspect-save
```

The demo validates Step 1 configuration, creates an empty deterministic world, schedules UTF-8/RNG diagnostic events, advances time, proves pause behavior, writes `reports/step-2-demo-save.json`, loads it, replays post-snapshot events, and prints matching checksums. Replay and inspection accept an optional save path as their first argument.

## Acceptance coverage

`tests/core.test.ts` contains 53 production-path tests covering the original 32 checks and the focused Step 2 audit. `tests/config.test.ts` retains all 38 approved Step 1 checks. The suite covers deterministic seeds/events/state, RNG independence/restoration, pause/resume/speed behavior, fixed ticks, scheduling/order, command rejection atomicity, immutable logs, causal/visibility persistence, snapshots/replay, counters, canonical checksums, read-only diagnostics, source RNG policy, migrations, UTF-8, a deterministic 90-day run, speed invariance, and Step 1 regression validation.

## Known Step 2 limitations

- The world intentionally contains no gameplay entities or economic behavior.
- Only JSON persistence exists; no binary format or storage optimization is attempted.
- Snapshot cadence is a centralized placeholder (`168` ticks) but automatic snapshot triggering is deferred.
- Calendar/business-day gameplay execution is deferred; Step 2 time is canonical game seconds/ticks.
- Auto-pause hooks have a named future phase but no gameplay trigger logic.
- Migration version 0 exists only to prove the interface and deterministic preservation rule.
## Authoritative checksum boundary

The authoritative state checksum contains exactly:

- seed;
- configuration bundle version;
- configuration hash;
- scenario ID;
- clock state: exact game timestamp, pause/running state, selected speed, and wall-conversion remainder;
- every namespaced entity counter;
- every instantiated RNG stream state and draw count;
- every queued scheduled event, including payload, exact timestamp, phase, IDs, visibility, cause, and insertion sequence;
- the persistent event insertion counter.

Excluded fields are:

- domain-event history, because it is immutable historical evidence covered by its own event-log checksum and is not queried to calculate future state;
- command history, because it is optional audit input and replay uses accepted events;
- snapshot sequence/checksum/index, because these describe persistence packaging, not simulation outcomes;
- save checksum, migration history, and player preferences, because they validate or describe the envelope;
- diagnostics and display/read-model objects, because they are derived copies;
- host timers, UI state, and caches, which are never serialized as authority.

All fields used for future simulation decisions are included directly: exact clock state, seed/config/scenario identity, counters, RNG states, queue contents, and insertion order. Event history remains separately integrity-protected.

## Focused audit guarantees

- Rehashing a changed post-snapshot state event produces a different replayed state checksum; removing one does likewise.
- Invalid same-timestamp reordering fails the production ordering check.
- Earlier and later compatible snapshots replay to the same final checksum.
- Rejected commands are fingerprinted across authoritative state, event log, snapshot sequence, and command history; several rejection paths prove deep equality before/after.
- Event IDs use the persistent `event` counter. Other entity types have independent counter namespaces. Replay observes event IDs and nested scheduled IDs, so the next generated ID cannot collide.
- Version-0 migration verifies the old checksum, preserves unknown fields/counters, records its deterministic migration, recalculates the version-1 checksum, restores, and replays.
- Queue inputs and outputs are defensive copies. Log events are hash-checked, deeply frozen internally, and returned as copies.
- There is no gameplay cancellation or replacement command yet. Queue removal is limited to normal firing and replay consumption; future cancellation must be an explicit command and immutable event.