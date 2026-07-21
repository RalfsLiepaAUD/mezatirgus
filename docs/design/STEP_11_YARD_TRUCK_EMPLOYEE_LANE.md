# Step 11 — Yard, Truck, Driver, Employee, and Recurring Lane

Status: **IMPLEMENTED**. Scope is exactly `FIRST_FULL_SKELETON_PLAN.md` §11.

## Domain files

- `src/operations/types.ts` — `Yard`, `OwnedTruck`, `Driver`, `Employee`, `Lane`, `DispatchOrder`, `OperationsSnapshot`
- `src/operations/domain.ts` — `OperationsDomain` reducer with all event handlers and invariants
- `src/operations/commands.ts` — Command handlers: `CreateYard`, `AdjustYardCapacity`, `CreateTruck`, `CreateDriver`, `CreateEmployee`, `CreateLane`, `PauseLane`, `RetireLane`, `CreateDispatchOrder`, `ConfirmDispatchOrder`, `UnloadDispatchOrder`, `CompleteDispatchOrder`, `CancelDispatchOrder`, `ScheduleTruckMaintenance`, `CompleteTruckMaintenance`, `AssignDriverToTruck`, `UnassignDriverFromTruck`, `AssignEmployeeToYard`, `UnassignEmployee`, `SortBatchAtYard`, `PostOperationsCost`
- `src/operations/read-models.ts` — Defensive read models: `yardList`, `yardDetail`, `fleetList`, `driverList`, `employeeList`, `laneList`, `dispatchBoard`, `operationsSummary`

## Modified files

- `src/core/engine.ts` — added `OperationsDomain`, `operations` to `AuthoritativeCoreState`/`EngineInitialization`, registered operations commands, domain forwarding in `applyAndAppend`, stale-event guard for `DispatchOrderArrived`, entity ID observation during replay
- `src/core/constants.ts` — CORE_VERSION 0.11.0, SAVE_SCHEMA_VERSION 10, SNAPSHOT_SCHEMA_VERSION 10
- `src/finance/domain.ts` — handles `OperationsCostPosted` and `DispatchOrderCompleted` events (payable + journal)
- `src/inventory/domain.ts` — handles `DispatchOrderArrived` (location change), `DispatchOrderUnloaded` (custody restore), `DispatchOrderCompleted` (cost layer)
- `src/persistence/migrations.ts` — migration 9→10 adds empty `operations` snapshot
- `tests/operations.test.ts` — 30+ tests covering yard capacity, truck dispatch, driver assignment, lane stability, finance integration, save/load/replay, migration, and invariants

## Behaviour

### Yard
- Created at a valid routing location with integer capacity
- Tracks used capacity; rejects adjustments that exceed bounds
- `AdjustYardCapacity` delta may be positive (arrival) or negative (departure)

### Owned truck
- Created at a location with integer capacity
- Requires an assigned driver before dispatch
- Capacity enforced against load volume
- `ScheduleTruckMaintenance` / `CompleteTruckMaintenance` lifecycle

### Driver
- Created with wage; assigned to exactly one truck via `AssignDriverToTruck`
- Unassignment releases truck back to `IDLE`

### Employee
- Created with role (`YARD_WORKER`, `FOREMAN`, `ADMIN`) and wage
- Assigned to a yard via `AssignEmployeeToYard`

### Lane
- Links a truck+driver pair to a routed origin→destination
- Tracks `cleanRepetitions` and `repetitionsUntilStable` threshold (default 5)
- `repetitionsUntilStable` counts down each `LaneTripCompleted`; reaching 0 sets `isStable: true`
- Non-clean trips reset `cleanRepetitions` to 0
- `PauseLane` / `RetireLane` lifecycle

### Dispatch
- `CreateDispatchOrder` validates truck, driver, load, route, capacity, and location
- `ConfirmDispatchOrder` revalidates route, schedules `DispatchOrderArrived`
- Arrival moves load location; unload restores custody to owner company
- `CompleteDispatchOrder` creates payable, journal transaction, and cost layer through the finance system
- Lane trips auto-recorded on completion if order has `laneId`

### Finance integration
- Dispatch operating costs create payables with `TRANSPORT_COST` category
- Payables are settled through existing `PayablePaymentMade` command
- Cost layers attached to loads with `OPERATIONAL` category
- No direct cash mutation

### Migration
- Version 9→10 adds empty `operations` state to existing saves
- Existing Steps 1–10 behaviour preserved

## Known limitations
- sorting conduct tracking is structural only (no reputation consequences yet)
- auto-dispatch is placeholder (conservative manual dispatch only)
- truck maintenance is scheduled/completed via commands, not auto-triggered
- employee work is capacity tokens (no hourly tracking or time sheets)
- lane stability threshold is hardcoded at 5 in CreateLane command
- Step 12 was not started

## Version
CORE_VERSION = "0.11.0", SAVE_SCHEMA_VERSION = 10, SNAPSHOT_SCHEMA_VERSION = 10
