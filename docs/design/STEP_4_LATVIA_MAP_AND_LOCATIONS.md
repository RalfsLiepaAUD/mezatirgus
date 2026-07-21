# Implementation Step 4 — Latvia Map and Expansion-Ready Locations

Status: COMPLETE

## Scope
Implements only the Step 4 location graph and deterministic routing skeleton: locations, directed route edges, access classes/states, exact distance and travel time, scheduled closures/reopenings, defensive read models, persistence, replay, and a headless demo. Step 5 physical timber objects are deferred.

## Entities and lifecycle
Location uses deterministic LOCATION IDs, schema version 1, ACTIVE/INACTIVE status, integer microdegree coordinates when supplied, country/region, roles, timestamps, and source IDs. RouteEdge uses deterministic EDGE IDs, schema version 1, explicit endpoints, PAVED/GRAVEL/FOREST_ROAD/SEA access class, OPEN/BLOCKED/CLOSED access state, integer metres, integer simulation seconds, timestamps, and source IDs. Edges are directed; symmetric travel requires two records.

## Commands and events
CreateLocation emits LocationCreated. CreateRouteEdge emits RouteEdgeCreated. SetRouteEdgeAccess emits RouteEdgeAccessChanged. ScheduleRouteEdgeAccess emits RouteEdgeAccessScheduled containing an exact scheduled RouteEdgeAccessChanged event. Validation happens before IDs or mutation. Duplicate routing event IDs fail before reducer mutation. A stale access event requesting the current state is an authoritative recorded no-op and does not alter the edge timestamp.

## Routing and phases
Routing uses deterministic shortest travel time, then stable edge-ID tie-breaking. Only OPEN edges participate. Missing endpoints and disconnected graphs return NO_ROUTE; there is no teleport fallback. Scheduled access changes execute in JOB_PROGRESS, the existing phase closest to access/travel work.

## Units
Coordinates are integer microdegrees, distance is integer metres, travel is exact integer simulation seconds. No floating-point physical quantity, money, rate, or percentage arithmetic is used.

## Finance boundary
Step 4 inspection and access changes create no commercial obligation or financial consequence. They therefore create no commitment, payable, receivable, revenue, expense, or cash posting. Transport quotes and fees belong to a later logistics step. VAT and tax are intentionally absent.

## Persistence and migration
RoutingSnapshot is authoritative and checksummed: applied event IDs, locations, and edges. Save and snapshot schemas are version 3; core is 0.4.0. Migration 2→3 adds an empty routing snapshot, updates snapshot integrity, preserves unknown fields, and derives the migrated final checksum through replay. Scheduled access events, counters, IDs, and exact timestamps survive save/load.

## Read models and demo
locationList, schematicGraph, and routeDetail are defensive derived projections and consume no RNG. Run `pnpm map:demo` for creation, valid/invalid routing, scheduled blocking, stale-event handling, save/load, and replay.

## Known limitations and deferred systems
The graph is sparse and schematic. Route values are placeholder inputs until a later data-calibration pass. Public holidays, live seasonal-rule generation, transport jobs, quotes/costs, vehicles, roads with capacity, UI/React, and geographic rendering are deferred. Step 5 Deal/AcquisitionLot/TimberLot/TimberBatch/Load inventory is not started.
