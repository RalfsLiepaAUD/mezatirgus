import type { CommandEnvelope, CommandResult } from '../core/commands.js';
import type { ScheduledEvent } from '../core/events.js';
import type { SimulationEngine } from '../core/engine.js';
import { SimulationPhase } from '../core/phases.js';
import type { CostLayer, Load } from '../inventory/types.js';
import type { JournalTransaction, Payable } from '../finance/types.js';
import type { DispatchOrder, Driver, Employee, Lane, OwnedTruck, Yard } from './types.js';

const reject = (c: CommandEnvelope, code: string, message: string): CommandResult => ({
  accepted: false, commandId: c.commandId, code, message,
});

const int = (x: unknown, min = 0) => Number.isSafeInteger(x) && Number(x) >= min;

function emit(e: SimulationEngine, c: CommandEnvelope, type: string, payload: Record<string, unknown>) {
  const i = e.reserveEventIdentity();
  return e.emitReservedEvent(i, {
    eventType: type, phase: SimulationPhase.COMMANDS, actorId: c.actorId,
    targetIds: [], parentCauseId: c.commandId, visibility: 'PLAYER_PRIVATE', payload,
  });
}

function scheduled(e: SimulationEngine, type: string, time: number, payload: Record<string, unknown>, cause: string): ScheduledEvent {
  const i = e.reserveEventIdentity();
  return {
    eventId: i.eventId, eventType: type, scheduledGameTime: time,
    phase: SimulationPhase.JOB_PROGRESS, actorId: 'actor.operations',
    targetIds: [], parentCauseId: cause, schemaVersion: 1,
    visibility: 'PLAYER_PRIVATE', payload,
    insertionSequence: i.insertionSequence,
  };
}

function journalTx(e: SimulationEngine, id: string, eventId: string, companyId: string,
  amount: number, counterpartyId: string, sources: string[], desc: string, category: string): JournalTransaction {
  const a = e.finance.snapshot().accounts;
  const debit = a.find(x => x.companyId === companyId && x.code === 'OPERATING_EXPENSE')!;
  const credit = a.find(x => x.companyId === companyId && x.code === 'ACCOUNTS_PAYABLE')!;
  return {
    id, timestamp: e.clock.currentGameTime, eventId, companyId,
    description: desc, schemaVersion: 1, sourceObjectIds: sources,
    lines: [
      { accountId: debit.id, debitMinor: amount, creditMinor: 0, currency: 'EUR', category,
        counterpartyId, memo: desc, ruleReference: 'STEP_11_OPERATIONS_RULES' },
      { accountId: credit.id, debitMinor: 0, creditMinor: amount, currency: 'EUR', category,
        counterpartyId, memo: desc, ruleReference: 'STEP_11_OPERATIONS_RULES' },
    ],
  };
}

export function registerOperationsCommands(e: SimulationEngine) {
  // ── Yard ────────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateYard', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    const loc = e.routing.location(String(p.locationId));
    if (!company || !loc || loc.status !== 'ACTIVE' || !String(p.displayName) ||
        !int(p.totalCapacityMilliM3, 1) || !int(p.storageCostMinorPerTickPerM3) ||
        !int(p.sortingCostMinorPerM3))
      return reject(c, 'INVALID_YARD', 'Invalid yard or missing references');

    const yard: Yard = {
      id: e.ids.next('yard', 'YARD'),
      companyId: company.id,
      locationId: loc.id,
      displayName: String(p.displayName),
      totalCapacityMilliM3: Number(p.totalCapacityMilliM3),
      usedCapacityMilliM3: 0,
      storageCostMinorPerTickPerM3: Number(p.storageCostMinorPerTickPerM3),
      sortingCostMinorPerM3: Number(p.sortingCostMinorPerM3),
      status: 'ACTIVE',
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'YardCreated', { yard });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('AdjustYardCapacity', c => {
    const y = e.operations.yard(String(c.payload.yardId));
    const delta = Number(c.payload.deltaMilliM3);
    if (!y || !Number.isSafeInteger(delta) || delta === 0) return reject(c, 'INVALID_ADJUSTMENT', 'Invalid yard or delta');
    const newUsed = y.usedCapacityMilliM3 + delta;
    if (newUsed < 0 || newUsed > y.totalCapacityMilliM3)
      return reject(c, 'CAPACITY_EXCEEDED', 'Yard capacity would be exceeded');
    const x = emit(e, c, 'YardCapacityAdjusted', { yardId: y.id, deltaMilliM3: delta });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Truck ───────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateTruck', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    const loc = e.routing.location(String(p.locationId));
    if (!company || !loc || loc.status !== 'ACTIVE' || !String(p.displayName) ||
        !int(p.capacityMilliM3, 1))
      return reject(c, 'INVALID_TRUCK', 'Invalid truck or missing references');

    const truck: OwnedTruck = {
      id: e.ids.next('truck', 'TRUCK'),
      companyId: company.id,
      displayName: String(p.displayName),
      capacityMilliM3: Number(p.capacityMilliM3),
      status: 'IDLE',
      currentLocationId: loc.id,
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'TruckCreated', { truck });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('ScheduleTruckMaintenance', c => {
    const t = e.operations.truck(String(c.payload.truckId));
    const due = Number(c.payload.maintenanceDueTimestamp);
    if (!t || t.status !== 'IDLE' || !int(due) || due <= e.clock.currentGameTime)
      return reject(c, 'INVALID_MAINTENANCE_SCHEDULE', 'Truck must be idle');
    const x = emit(e, c, 'TruckMaintenanceScheduled', { truckId: t.id, maintenanceDueTimestamp: due });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('CompleteTruckMaintenance', c => {
    const t = e.operations.truck(String(c.payload.truckId));
    if (!t) return reject(c, 'INVALID_TRUCK', 'Truck not found');
    // Allow completing maintenance even if status hasn't been explicitly set
    const x = emit(e, c, 'TruckMaintenanceCompleted', { truckId: t.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Driver ──────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateDriver', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    if (!company || !String(p.displayName) || !int(p.wageMinorPerHour))
      return reject(c, 'INVALID_DRIVER', 'Invalid driver');

    const driver: Driver = {
      id: e.ids.next('driver', 'DRIVER'),
      companyId: company.id,
      displayName: String(p.displayName),
      wageMinorPerHour: Number(p.wageMinorPerHour),
      status: 'AVAILABLE',
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'DriverCreated', { driver });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('AssignDriverToTruck', c => {
    const d = e.operations.driver(String(c.payload.driverId));
    const t = e.operations.truck(String(c.payload.truckId));
    if (!d || !t || d.status !== 'AVAILABLE' || t.assignedDriverId)
      return reject(c, 'INVALID_ASSIGNMENT', 'Driver or truck unavailable');
    const x = emit(e, c, 'DriverAssigned', { driverId: d.id, truckId: t.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('UnassignDriverFromTruck', c => {
    const d = e.operations.driver(String(c.payload.driverId));
    if (!d || !d.assignedTruckId) return reject(c, 'INVALID_UNASSIGNMENT', 'Driver not assigned');
    const x = emit(e, c, 'DriverUnassigned', { driverId: d.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Employee ────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateEmployee', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    if (!company || !String(p.displayName) || !int(p.wageMinorPerHour) ||
        !['YARD_WORKER', 'FOREMAN', 'ADMIN'].includes(String(p.role)))
      return reject(c, 'INVALID_EMPLOYEE', 'Invalid employee');

    const emp: Employee = {
      id: e.ids.next('employee', 'EMPLOYEE'),
      companyId: company.id,
      displayName: String(p.displayName),
      role: p.role as Employee['role'],
      wageMinorPerHour: Number(p.wageMinorPerHour),
      status: 'AVAILABLE',
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'EmployeeCreated', { employee: emp });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('AssignEmployeeToYard', c => {
    const emp = e.operations.employee(String(c.payload.employeeId));
    const y = e.operations.yard(String(c.payload.yardId));
    if (!emp || !y || emp.status !== 'AVAILABLE')
      return reject(c, 'INVALID_ASSIGNMENT', 'Employee or yard unavailable');
    const x = emit(e, c, 'EmployeeAssigned', { employeeId: emp.id, yardId: y.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('UnassignEmployee', c => {
    const emp = e.operations.employee(String(c.payload.employeeId));
    if (!emp || !emp.assignedYardId) return reject(c, 'INVALID_UNASSIGNMENT', 'Employee not assigned');
    const x = emit(e, c, 'EmployeeUnassigned', { employeeId: emp.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Lane ────────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateLane', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    const truck = e.operations.truck(String(p.truckId));
    const driver = e.operations.driver(String(p.driverId));
    const origin = e.routing.location(String(p.originLocationId));
    const dest = e.routing.location(String(p.destinationLocationId));
    if (!company || !truck || !driver || !origin || !dest ||
        driver.assignedTruckId !== truck.id || truck.assignedDriverId !== driver.id)
      return reject(c, 'INVALID_LANE', 'Invalid references or truck/driver mismatch');

    let route;
    try { route = e.routing.route(origin.id, dest.id); }
    catch { return reject(c, 'NO_ROUTE', 'No active route exists'); }

    if (!String(p.displayName)) return reject(c, 'INVALID_LANE', 'Display name required');
    const threshold = int(p.stabilityThreshold, 1) ? Number(p.stabilityThreshold) : 5;

    const lane: Lane = {
      id: e.ids.next('lane', 'LANE'),
      companyId: company.id,
      displayName: String(p.displayName),
      truckId: truck.id,
      driverId: driver.id,
      originLocationId: origin.id,
      destinationLocationId: dest.id,
      routeEdgeIds: route.edgeIds,
      distanceMetres: route.distanceMetres,
      travelSeconds: route.travelSeconds,
      status: 'ACTIVE',
      cleanRepetitions: 0,
      repetitionsUntilStable: threshold,
      isStable: false,
      totalTrips: 0,
      totalVolumeMilliM3: 0,
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'LaneCreated', { lane });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('PauseLane', c => {
    const l = e.operations.lane(String(c.payload.laneId));
    if (!l || l.status !== 'ACTIVE') return reject(c, 'INVALID_LANE_STATE', 'Lane must be active');
    const x = emit(e, c, 'LanePaused', { laneId: l.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('RetireLane', c => {
    const l = e.operations.lane(String(c.payload.laneId));
    if (!l || l.status === 'RETIRED') return reject(c, 'INVALID_LANE_STATE', 'Lane already retired');
    const x = emit(e, c, 'LaneRetired', { laneId: l.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Dispatch ────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateDispatchOrder', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    const truck = e.operations.truck(String(p.truckId));
    const driver = e.operations.driver(String(p.driverId));
    const load = e.inventory.load(String(p.loadId));
    const destLoc = e.routing.location(String(p.destinationLocationId));

    if (!company || !truck || !driver || !load || !destLoc ||
        driver.assignedTruckId !== truck.id || truck.assignedDriverId !== driver.id ||
        truck.status !== 'IDLE' || driver.status !== 'ASSIGNED' ||
        load.ownerCompanyId !== company.id)
      return reject(c, 'INVALID_DISPATCH_ORDER', 'Invalid references or truck/driver not available');

    // Check no active job for this load from any transport system
    if (e.transport.activeJobForLoad(load.id))
      return reject(c, 'LOAD_ALREADY_IN_TRANSIT', 'Load already has an active transport job');
    if (e.operations.activeDispatchForLoad(load.id))
      return reject(c, 'LOAD_ALREADY_DISPATCHED', 'Load already has an active dispatch order');

    // Validate volume fits truck capacity
    const volume = load.totalAllocatedVolumeMilliM3;
    if (volume <= 0 || volume > truck.capacityMilliM3)
      return reject(c, 'VOLUME_EXCEEDS_CAPACITY', 'Load volume exceeds truck capacity or is zero');

    // Validate origin matches load location
    if (load.currentLocationId !== truck.currentLocationId)
      return reject(c, 'LOCATION_MISMATCH', 'Truck and load must be at same location');

    let route;
    try { route = e.routing.route(load.currentLocationId, destLoc.id); }
    catch { return reject(c, 'NO_ROUTE', 'No active route exists'); }

    const laneId = p.laneId !== undefined ? String(p.laneId) : undefined;
    if (laneId) {
      const lane = e.operations.lane(laneId);
      if (!lane || lane.status !== 'ACTIVE')
        return reject(c, 'INVALID_LANE', 'Lane not found or not active');
      // Verify the route matches lane
      if (lane.originLocationId !== load.currentLocationId ||
          lane.destinationLocationId !== destLoc.id)
        return reject(c, 'LANE_ROUTE_MISMATCH', 'Dispatch does not match lane route');
    }

    const order: DispatchOrder = {
      id: e.ids.next('dispatch_order', 'DISPATCH'),
      companyId: company.id,
      truckId: truck.id,
      driverId: driver.id,
      loadId: load.id,
      originLocationId: load.currentLocationId,
      destinationLocationId: destLoc.id,
      routeEdgeIds: route.edgeIds,
      volumeMilliM3: volume,
      distanceMetres: route.distanceMetres,
      travelSeconds: route.travelSeconds,
      status: 'PLANNED',
      cleanTrip: true,
      ...(laneId ? { laneId } : {}),
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };

    const x = emit(e, c, 'DispatchOrderCreated', { order });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('ConfirmDispatchOrder', c => {
    const order = e.operations.dispatchOrder(String(c.payload.orderId));
    if (!order || order.status !== 'PLANNED')
      return reject(c, 'INVALID_DISPATCH', 'Order must be in PLANNED state');

    const truck = e.operations.truck(order.truckId)!;
    const driver = e.operations.driver(order.driverId)!;
    const load = e.inventory.load(order.loadId);

    if (!load || load.currentLocationId !== order.originLocationId)
      return reject(c, 'LOAD_MOVED', 'Load is no longer at origin');
    if (truck.currentLocationId !== order.originLocationId)
      return reject(c, 'TRUCK_MOVED', 'Truck is no longer at origin');
    if (truck.status !== 'IDLE' || driver.status !== 'ASSIGNED')
      return reject(c, 'NOT_AVAILABLE', 'Truck or driver not available');

    // Revalidate route
    let route;
    try { route = e.routing.route(order.originLocationId, order.destinationLocationId); }
    catch { return reject(c, 'NO_ROUTE', 'Route no longer available'); }
    if (route.edgeIds.join('|') !== order.routeEdgeIds.join('|'))
      return reject(c, 'ROUTE_CHANGED', 'Route changed since planning');

    // Calculate travel cost (simplified: distance-based + base)
    const costPerKm = 150; // minor per km
    const km = Math.floor((order.distanceMetres + 999) / 1000);
    const operatingCostMinor = 10_000 + km * costPerKm;

    // Schedule arrival
    const arrivalTimestamp = e.clock.currentGameTime + order.travelSeconds;

    const scheduledEvents: ScheduledEvent[] = [
      scheduled(e, 'DispatchOrderArrived', arrivalTimestamp, {
        orderId: order.id, loadId: order.loadId, toLocationId: order.destinationLocationId,
      }, c.commandId),
    ];

    const x = emit(e, c, 'DispatchOrderConfirmed', {
      orderId: order.id,
      truckId: truck.id,
      driverId: driver.id,
      loadId: load.id,
      arrivalTimestamp,
      operatingCostMinor,
      scheduledEvents,
    });

    // Update truck and driver state via inventory
    // The truck is now dispatched
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('UnloadDispatchOrder', c => {
    const order = e.operations.dispatchOrder(String(c.payload.orderId));
    const load = order ? e.inventory.load(order.loadId) : undefined;
    if (!order || order.status !== 'ARRIVED' || !load ||
        load.currentLocationId !== order.destinationLocationId)
      return reject(c, 'INVALID_UNLOAD', 'Arrived order required at destination');

    const x = emit(e, c, 'DispatchOrderUnloaded', {
      orderId: order.id,
      loadId: order.loadId,
      truckId: order.truckId,
      driverId: order.driverId,
      ownerCompanyId: order.companyId,
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('CompleteDispatchOrder', c => {
    const order = e.operations.dispatchOrder(String(c.payload.orderId));
    if (!order || order.status !== 'UNLOADED' || order.payableId)
      return reject(c, 'INVALID_COMPLETION', 'Unloaded unpaid order required');

    const truck = e.operations.truck(order.truckId)!;
    const driver = e.operations.driver(order.driverId)!;
    const load = e.inventory.load(order.loadId);

    // Calculate cost: distance + time based
    const km = Math.floor((order.distanceMetres + 999) / 1000);
    const operatingCostMinor = 10_000 + km * 150;

    const payableId = e.ids.next('payable', 'PAYABLE');
    const journalId = e.ids.next('journal', 'JOURNAL');
    const costLayerId = e.ids.next('cost_layer', 'COST');
    const identity = e.reserveEventIdentity();
    const dueTimestamp = e.clock.currentGameTime + 3600;

    const payable: Payable = {
      id: payableId,
      companyId: order.companyId,
      counterpartyId: order.companyId, // internal cost attribution
      principalMinor: operatingCostMinor,
      currency: 'EUR',
      createdTimestamp: e.clock.currentGameTime,
      dueTimestamp,
      status: 'COMMITTED',
      amountPaidMinor: 0,
      sourceEventId: identity.eventId,
      sourceObjectIds: [order.id, order.loadId, order.truckId, order.driverId],
    };

    const tx = journalTx(e, journalId, identity.eventId, order.companyId,
      operatingCostMinor, order.companyId,
      [order.id, order.loadId, order.truckId], 'Owned transport operating cost',
      'TRANSPORT_COST');

    const costLayer: CostLayer = {
      id: costLayerId,
      attachedToType: 'LOAD',
      attachedToId: order.loadId,
      sourceObjectId: order.id,
      category: 'OPERATIONAL',
      currency: 'EUR',
      totalMinor: operatingCostMinor,
      attributableVolumeMilliM3: order.volumeMilliM3,
      allocationMethod: 'DIRECT',
      createdTimestamp: e.clock.currentGameTime,
      financeSourceId: payableId,
      provenanceReference: 'STEP_11_OPERATIONS_RULES',
      status: 'ACTIVE',
    };

    const scheduledEvents: ScheduledEvent[] = [
      scheduled(e, 'PayableBecameDue', dueTimestamp, { payableId }, c.commandId),
      scheduled(e, 'PayableBecameOverdue', dueTimestamp + 1, { payableId }, c.commandId),
    ];

    const costEvent = e.emitReservedEvent(identity, {
      eventType: 'DispatchOrderCompleted',
      phase: SimulationPhase.FINANCIAL_SETTLEMENTS,
      actorId: c.actorId,
      targetIds: [order.id],
      parentCauseId: c.commandId,
      visibility: 'PLAYER_PRIVATE',
      payload: {
        orderId: order.id,
        loadId: order.loadId,
        truckId: order.truckId,
        driverId: order.driverId,
        operatingCostMinor,
        payable,
        transaction: tx,
        costLayer,
        scheduledEvents,
      },
    });

    // Record lane trip if part of a lane
    if (order.laneId) {
      const lane = e.operations.lane(order.laneId);
      if (lane) {
        emit(e, c, 'LaneTripCompleted', {
          laneId: lane.id,
          orderId: order.id,
          volumeMilliM3: order.volumeMilliM3,
          cleanTrip: order.cleanTrip,
        });
      }
    }

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [costEvent.eventId] };
  });

  e.registerCommandHandler('CancelDispatchOrder', c => {
    const order = e.operations.dispatchOrder(String(c.payload.orderId));
    if (!order || ['COMPLETED', 'CANCELLED'].includes(order.status))
      return reject(c, 'INVALID_CANCELLATION', 'Order cannot be cancelled');
    const x = emit(e, c, 'DispatchOrderCancelled', { orderId: order.id, loadId: order.loadId });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Sorting ─────────────────────────────────────────────────────────
  e.registerCommandHandler('SortBatchAtYard', c => {
    const p = c.payload;
    const batch = e.inventory.batch(String(p.batchId));
    const yard = e.operations.yard(String(p.yardId));
    if (!batch || !yard || batch.locationId !== yard.locationId)
      return reject(c, 'INVALID_SORTING', 'Batch must be at yard location');
    if (batch.certainty === 'SORTED' || batch.certainty === 'MEASURED')
      return reject(c, 'ALREADY_SORTED', 'Batch already sorted or measured');

    const cost = yard.sortingCostMinorPerM3;
    const totalCost = Number(BigInt(batch.currentVolumeMilliM3) * BigInt(cost) / 1000n);
    if (!Number.isSafeInteger(totalCost))
      return reject(c, 'COST_OVERFLOW', 'Sorting cost overflow');

    // The sorting event records the change; inventory domain will handle certainty update
    const conductType = p.conductType === 'OPPORTUNISTIC' ? 'OPPORTUNISTIC' : 'ETHICAL';
    const x = emit(e, c, 'YardSortingRecorded', {
      yardId: yard.id,
      batchId: batch.id,
      sortingCostMinor: totalCost,
      conductType,
    });

    // Also emit a conduct event
    emit(e, c, 'YardSortingConductRecorded', {
      yardId: yard.id,
      batchId: batch.id,
      conductType,
      gameTime: e.clock.currentGameTime,
    });

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Operating Cost Posting ──────────────────────────────────────────
  e.registerCommandHandler('PostOperationsCost', c => {
    const p = c.payload;
    const companyId = String(p.companyId);
    const amount = Number(p.amountMinor);
    const category = String(p.category);
    const description = String(p.description);

    if (!e.finance.company(companyId) || !int(amount, 1))
      return reject(c, 'INVALID_COST', 'Invalid company or amount');

    const payableId = e.ids.next('payable', 'PAYABLE');
    const journalId = e.ids.next('journal', 'JOURNAL');
    const identity = e.reserveEventIdentity();
    const dueTimestamp = e.clock.currentGameTime + 3600;

    const payable: Payable = {
      id: payableId,
      companyId,
      counterpartyId: companyId,
      principalMinor: amount,
      currency: 'EUR',
      createdTimestamp: e.clock.currentGameTime,
      dueTimestamp,
      status: 'COMMITTED',
      amountPaidMinor: 0,
      sourceEventId: identity.eventId,
      sourceObjectIds: [],
    };

    const tx = journalTx(e, journalId, identity.eventId, companyId,
      amount, companyId, [], description, category);

    const scheduledEvents: ScheduledEvent[] = [
      scheduled(e, 'PayableBecameDue', dueTimestamp, { payableId }, c.commandId),
      scheduled(e, 'PayableBecameOverdue', dueTimestamp + 1, { payableId }, c.commandId),
    ];

    const costEvent = e.emitReservedEvent(identity, {
      eventType: 'OperationsCostPosted',
      phase: SimulationPhase.FINANCIAL_SETTLEMENTS,
      actorId: c.actorId,
      targetIds: [],
      parentCauseId: c.commandId,
      visibility: 'PLAYER_PRIVATE',
      payload: {
        companyId,
        amountMinor: amount,
        category,
        description,
        payable,
        transaction: tx,
        scheduledEvents,
      },
    });

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [costEvent.eventId] };
  });
}
