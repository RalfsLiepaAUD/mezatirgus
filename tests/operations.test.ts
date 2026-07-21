import { describe, expect, it } from 'vitest';
import { command, SimulationEngine } from '../src/core/engine.js';
import { calculateSaveChecksum, createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot, snapshotChecksum } from '../src/persistence/snapshot.js';
import { operationsSummary, yardList, fleetList, driverList, employeeList, laneList, dispatchBoard } from '../src/operations/read-models.js';

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.pulpwood', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

const mk = () => new SimulationEngine({
  seed: 'operations-step-11',
  configurationBundleVersion: '1',
  configurationHash: 'h',
  scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

function world() {
  const e = mk();
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
  go(e, 'LOC1', 'CreateLocation', { displayName: 'Cēsis yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
  go(e, 'LOC2', 'CreateLocation', { displayName: 'Rīga buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
  go(e, 'ROAD', 'CreateRouteEdge', {
    fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002',
    accessClass: 'PAVED', distanceMetres: 100_000, travelSeconds: 7200, directed: true,
  });
  go(e, 'Y', 'CreateYard', {
    companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    displayName: 'Cēsis yard', totalCapacityMilliM3: 100_000,
    storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000,
  });
  go(e, 'T', 'CreateTruck', {
    companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    displayName: 'Volvo FH16', capacityMilliM3: 35_000,
  });
  go(e, 'D', 'CreateDriver', {
    companyId: 'COMPANY-000001', displayName: 'Jānis Bērziņš', wageMinorPerHour: 1_500,
  });
  go(e, 'EMP', 'CreateEmployee', {
    companyId: 'COMPANY-000001', displayName: 'Pēteris Ozols', role: 'YARD_WORKER', wageMinorPerHour: 1_200,
  });
  go(e, 'AD', 'AssignDriverToTruck', { driverId: 'DRIVER-000001', truckId: 'TRUCK-000001' });
  go(e, 'AE', 'AssignEmployeeToYard', { employeeId: 'EMPLOYEE-000001', yardId: 'YARD-000001' });

  // Create a deal with a large lot — allocate only partial volume to the first load
  go(e, 'DEAL', 'CreateDeal', {
    companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
    currency: 'EUR', expectedVolumeMilliM3: 100_000, description: 'operations test', financeSourceIds: [],
  });
  go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
  go(e, 'LOT', 'CreateLot', {
    dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
    locationId: 'LOCATION-000001', originalVolumeMilliM3: 100_000, composition,
    freshness: 'FRESH', certainty: 'ESTIMATED',
  });
  go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 30_000, composition });
  go(e, 'LOAD', 'CreateLoad', {
    ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
    originLocationId: 'LOCATION-000001',
  });
  go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });

  return e;
}

describe('Step 11 — yard, truck, driver, employee, and recurring lane', () => {

  // ── Yard ──────────────────────────────────────────────────────────
  it('creates a yard with deterministic ID and capacity tracking', () => {
    const e = world();
    expect(e.operations.yard('YARD-000001')).toMatchObject({
      displayName: 'Cēsis yard',
      totalCapacityMilliM3: 100_000,
      usedCapacityMilliM3: 0,
      status: 'ACTIVE',
    });
  });

  it('rejects invalid yard creation atomically', () => {
    const e = mk(), before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateYard', {}).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('adjusts yard capacity and prevents over-capacity', () => {
    const e = world();
    go(e, 'ADJ1', 'AdjustYardCapacity', { yardId: 'YARD-000001', deltaMilliM3: 30_000 });
    expect(e.operations.yard('YARD-000001')!.usedCapacityMilliM3).toBe(30_000);
    const before = e.auditFingerprint();
    expect(go(e, 'ADJ2', 'AdjustYardCapacity', { yardId: 'YARD-000001', deltaMilliM3: 80_000 }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
    go(e, 'ADJ3', 'AdjustYardCapacity', { yardId: 'YARD-000001', deltaMilliM3: -30_000 });
    expect(e.operations.yard('YARD-000001')!.usedCapacityMilliM3).toBe(0);
  });

  // ── Truck ─────────────────────────────────────────────────────────
  it('creates a truck with deterministic ID', () => {
    const e = world();
    expect(e.operations.truck('TRUCK-000001')).toMatchObject({
      displayName: 'Volvo FH16',
      capacityMilliM3: 35_000,
      status: 'IDLE',
      currentLocationId: 'LOCATION-000001',
    });
  });

  it('rejects invalid truck creation atomically', () => {
    const e = mk(), before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateTruck', {}).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('truck maintenance lifecycle', () => {
    const e = world();
    go(e, 'M', 'ScheduleTruckMaintenance', { truckId: 'TRUCK-000001', maintenanceDueTimestamp: 1000 });
    // The maintenance event is recorded; completion returns to IDLE
    go(e, 'MC', 'CompleteTruckMaintenance', { truckId: 'TRUCK-000001' });
    // After completion, truck should be IDLE
    expect(e.operations.truck('TRUCK-000001')!.status).toBe('IDLE');
  });

  // ── Driver ────────────────────────────────────────────────────────
  it('creates driver with deterministic ID (assigned to truck in world)', () => {
    const e = world();
    expect(e.operations.driver('DRIVER-000001')).toMatchObject({
      displayName: 'Jānis Bērziņš',
      wageMinorPerHour: 1_500,
      status: 'ASSIGNED',
    });
  });

  it('assigns driver to truck', () => {
    const e = world();
    expect(e.operations.driver('DRIVER-000001')).toMatchObject({
      status: 'ASSIGNED', assignedTruckId: 'TRUCK-000001',
    });
    expect(e.operations.truck('TRUCK-000001')!.assignedDriverId).toBe('DRIVER-000001');
  });

  it('unassigns driver from truck', () => {
    const e = world();
    go(e, 'UA', 'UnassignDriverFromTruck', { driverId: 'DRIVER-000001' });
    expect(e.operations.driver('DRIVER-000001')).toMatchObject({
      status: 'AVAILABLE', assignedTruckId: undefined,
    });
    expect(e.operations.truck('TRUCK-000001')!.assignedDriverId).toBeUndefined();
  });

  // ── Employee ──────────────────────────────────────────────────────
  it('creates employee with role and wage', () => {
    const e = world();
    expect(e.operations.employee('EMPLOYEE-000001')).toMatchObject({
      displayName: 'Pēteris Ozols',
      role: 'YARD_WORKER',
      wageMinorPerHour: 1_200,
      status: 'ASSIGNED',
      assignedYardId: 'YARD-000001',
    });
  });

  it('unassigns employee from yard', () => {
    const e = world();
    go(e, 'UE', 'UnassignEmployee', { employeeId: 'EMPLOYEE-000001' });
    expect(e.operations.employee('EMPLOYEE-000001')!.status).toBe('AVAILABLE');
  });

  // ── Dispatch order ────────────────────────────────────────────────
  it('creates dispatch order for owned truck+driver', () => {
    const e = world();
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    expect(e.operations.dispatchOrder('DISPATCH-000001')).toMatchObject({
      status: 'PLANNED',
      originLocationId: 'LOCATION-000001',
      destinationLocationId: 'LOCATION-000002',
      volumeMilliM3: 10_000,
    });
  });

  it('rejects dispatch order when load exceeds truck capacity', () => {
    const e = world();
    // Create a larger load
    go(e, 'BIGLOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000001', originalVolumeMilliM3: 50_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BIGBATCH', 'CreateInitialBatch', { lotId: 'LOT-000002', volumeMilliM3: 50_000, composition });
    go(e, 'BIGLOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000001',
    });
    go(e, 'BIGALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000002', loadId: 'LOAD-000002', volumeMilliM3: 50_000 });
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000002', destinationLocationId: 'LOCATION-000002',
    }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('rejects dispatch when truck and load not at same location', () => {
    const e = world();
    // Create load at a different location
    go(e, 'LOC3', 'CreateLocation', { displayName: 'Valmiera yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
    go(e, 'OTHERLOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000003',
    });
    go(e, 'OTHERALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000002', volumeMilliM3: 30_000 });
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000002', destinationLocationId: 'LOCATION-000002',
    }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('confirms dispatch, schedules arrival, and moves load', () => {
    const e = world();
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'DC', 'ConfirmDispatchOrder', { orderId: 'DISPATCH-000001' });
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.status).toBe('CONFIRMED');
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.plannedArrivalTimestamp).toBe(7200);
    // Load is still at origin
    expect(e.inventory.load('LOAD-000001')!.currentLocationId).toBe('LOCATION-000001');
    // Advance to arrival time
    e.advanceUntil(7200);
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.status).toBe('ARRIVED');
    // Load moved to destination
    expect(e.inventory.load('LOAD-000001')!.currentLocationId).toBe('LOCATION-000002');
  });

  it('confirm revalidates route and rejects if route is blocked', () => {
    const e = world();
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'BLOCK', 'SetRouteEdgeAccess', { edgeId: 'EDGE-000001', accessState: 'BLOCKED' });
    const before = e.auditFingerprint();
    expect(go(e, 'DC', 'ConfirmDispatchOrder', { orderId: 'DISPATCH-000001' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('cannot create dispatch for load already in hired transport', () => {
    const e = world();
    go(e, 'CAR', 'CreateCarrier', {
      configId: 'transport.small_trader_spot', displayName: 'Vidzemes Kravas',
      fictional: true, capacityMilliM3: 35_000, baseCalloutMinor: 10_000,
      distanceRateMinorPerKm: 100, volumeRateMinorPerM3: 400,
      pickupDelaySeconds: 600, paymentTermsSeconds: 3600,
      disruptionChanceBasisPoints: 0, disruptionDelaySeconds: 0, disruptionSurchargeMinor: 0,
    });
    go(e, 'Q', 'RequestCarrierQuote', {
      carrierId: 'CARRIER-000001', loadId: 'LOAD-000001',
      destinationLocationId: 'LOCATION-000002', expiryTimestamp: 100_000, urgencyBasisPoints: 0,
    });
    go(e, 'QA', 'AcceptCarrierQuote', { quoteId: 'QUOTE-000001' });
    go(e, 'J', 'CreateTransportJob', { quoteId: 'QUOTE-000001' });
    go(e, 'JA', 'AllocateLoadToTransportJob', { jobId: 'JOB-000001' });
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('unload and complete dispatch order creates payable and cost layer', () => {
    const e = world();
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'DC', 'ConfirmDispatchOrder', { orderId: 'DISPATCH-000001' });
    e.advanceUntil(7200);
    go(e, 'U', 'UnloadDispatchOrder', { orderId: 'DISPATCH-000001' });
    expect(e.inventory.load('LOAD-000001')).toMatchObject({
      status: 'UNLOADED',
      ownerCompanyId: 'COMPANY-000001',
    });
    // Complete creates payable
    const cashBefore = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
    go(e, 'DONE', 'CompleteDispatchOrder', { orderId: 'DISPATCH-000001' });
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.status).toBe('COMPLETED');
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.operatingCostMinor).toBeGreaterThan(0);
    // Cost should exist as a cost layer on the load
    expect(e.inventory.load('LOAD-000001')!.costLayerIds.length).toBeGreaterThan(0);
    // Cash unchanged (payable created, not paid)
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBe(cashBefore);
  });

  it('cancels dispatch before confirmation without movement or cost', () => {
    const e = world();
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'CX', 'CancelDispatchOrder', { orderId: 'DISPATCH-000001' });
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.status).toBe('CANCELLED');
    expect(e.inventory.load('LOAD-000001')!.currentLocationId).toBe('LOCATION-000001');
    expect(e.finance.snapshot().payables).toHaveLength(0);
  });

  it('cancellation after dispatch makes arrival stale', () => {
    const e = world();
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'DC', 'ConfirmDispatchOrder', { orderId: 'DISPATCH-000001' });
    go(e, 'CX', 'CancelDispatchOrder', { orderId: 'DISPATCH-000001' });
    e.advanceUntil(7200);
    // Arrival should be stale (order was cancelled)
    expect(e.operations.dispatchOrder('DISPATCH-000001')!.status).toBe('CANCELLED');
    expect(e.inventory.load('LOAD-000001')!.currentLocationId).toBe('LOCATION-000001');
    expect(e.finance.snapshot().payables).toHaveLength(0);
  });

  // ── Lane ──────────────────────────────────────────────────────────
  it('creates a lane with stability threshold', () => {
    const e = world();
    go(e, 'LN', 'CreateLane', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
      displayName: 'Cēsis→Rīga',
    });
    expect(e.operations.lane('LANE-000001')).toMatchObject({
      displayName: 'Cēsis→Rīga',
      status: 'ACTIVE',
      cleanRepetitions: 0,
      isStable: false,
      distanceMetres: 100_000,
    });
  });

  it('rejects lane with invalid truck/driver references', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateLane', {
      companyId: 'COMPANY-000001', truckId: 'NO', driverId: 'NO',
      originLocationId: 'NO', destinationLocationId: 'NO', displayName: 'bad',
    }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('lane trip recording increments counters and achieves stability', () => {
    const e = world();
    go(e, 'LN', 'CreateLane', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
      displayName: 'Cēsis→Rīga', stabilityThreshold: 3,
    });
    // Use original world load for first trip, create new batches for trips 2+3
    // First dispatch order (i=0) uses LOAD-000001
    // Subsequent trips create new batches from the lot
    for (let i = 0; i < 3; i++) {
      let loadId: string;
      if (i === 0) {
        loadId = 'LOAD-000001';
      } else {
        // Create a new batch from the underyling lot
        const lot = e.inventory.lot('LOT-000001')!;
        const avail = lot.availableVolumeMilliM3;
        const batchVol = Math.min(10_000, avail);
        if (batchVol <= 0) break; // no more volume
        const idSuffix = i + 1;
        go(e, `B${i}`, 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: batchVol, composition });
        const batchId = `BATCH-00000${idSuffix}`;
        loadId = `LOAD-00000${idSuffix}`;
        go(e, `L${i}`, 'CreateLoad', {
          ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
          originLocationId: 'LOCATION-000001',
        });
        go(e, `A${i}`, 'AllocateBatchToLoad', { batchId, loadId, volumeMilliM3: batchVol });
      }
      const orderNum = i + 1;
      const orderId = `DISPATCH-00000${orderNum}`;
      go(e, `DO${i}`, 'CreateDispatchOrder', {
        companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
        loadId, destinationLocationId: 'LOCATION-000002', laneId: 'LANE-000001',
      });
      go(e, `DC${i}`, 'ConfirmDispatchOrder', { orderId });
      e.advanceUntil(7200 * (i + 1) + 100);
      go(e, `U${i}`, 'UnloadDispatchOrder', { orderId });
      go(e, `DN${i}`, 'CompleteDispatchOrder', { orderId });
    }
    expect(e.operations.lane('LANE-000001')).toMatchObject({
      totalTrips: 3,
      cleanRepetitions: 3,
      isStable: true,
    });
    expect(e.operations.lane('LANE-000001')!.totalVolumeMilliM3).toBe(30_000);
  });

  // ── Pause/Retire lane ─────────────────────────────────────────────
  it('pauses and retires a lane', () => {
    const e = world();
    go(e, 'LN', 'CreateLane', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
      displayName: 'Cēsis→Rīga',
    });
    go(e, 'PL', 'PauseLane', { laneId: 'LANE-000001' });
    expect(e.operations.lane('LANE-000001')!.status).toBe('PAUSED');
    go(e, 'RL', 'RetireLane', { laneId: 'LANE-000001' });
    expect(e.operations.lane('LANE-000001')!.status).toBe('RETIRED');
  });

  // ── Sorting ───────────────────────────────────────────────────────
  it('records sorting event for batch at yard location', () => {
    const e = world();
    // Batch is at LOCATION-000001 which is the yard location
    go(e, 'SORT', 'SortBatchAtYard', {
      yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL',
    });
    // Sorting event was emitted
    expect(e.eventLog.all().some(x => x.eventType === 'YardSortingRecorded')).toBe(true);
  });

  // ── Finance integration ───────────────────────────────────────────
  it('posting operating cost creates payable through finance', () => {
    const e = world();
    go(e, 'COST', 'PostOperationsCost', {
      companyId: 'COMPANY-000001', amountMinor: 50_000,
      category: 'YARD_STORAGE', description: 'Yard storage cost',
    });
    // Payable should exist through finance
    const payable = e.finance.snapshot().payables.find(p => p.principalMinor === 50_000);
    expect(payable).toBeDefined();
    expect(payable!.status).toBe('COMMITTED');
    // Journal transaction exists
    expect(e.finance.snapshot().transactions.length).toBeGreaterThan(0);
  });

  // ── Save/load/replay ─────────────────────────────────────────────
  it('save/load/replay preserves operations state and checksums', () => {
    const e = world(), snap = createSnapshot(e);
    go(e, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'DC', 'ConfirmDispatchOrder', { orderId: 'DISPATCH-000001' });
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    loaded.advanceUntil(7200);
    e.advanceUntil(7200);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.operations.snapshot()).toEqual(e.operations.snapshot());
    expect(loaded.ids.next('yard', 'YARD')).toBe('YARD-000002');
  });

  it('migrates version 9 while preserving Steps 1–10', () => {
    const legacy = world(), save: any = createSave(legacy, createSnapshot(legacy));
    delete save.snapshot.state.operations;
    save.snapshot.snapshotSchemaVersion = 9;
    const { snapshotChecksum: _, ...bare } = save.snapshot;
    save.snapshot.snapshotChecksum = snapshotChecksum(bare);
    save.saveSchemaVersion = 9;
    save.coreVersion = '0.10.0';
    const { saveChecksum: __, ...saveBare } = save;
    save.saveChecksum = calculateSaveChecksum(saveBare);
    const loaded = loadSave(save);
    expect(loaded.forests.snapshot()).toEqual(legacy.forests.snapshot());
    expect(loaded.operations.snapshot()).toEqual({
      appliedEventIds: [], yards: [], trucks: [], drivers: [],
      employees: [], lanes: [], dispatchOrders: [],
    });
  });

  // ── Read models are defensive ─────────────────────────────────────
  it('read models are defensive and RNG-free', () => {
    const e = world();
    const rng = e.rng.snapshot();
    const yl = yardList(e);
    const fl = fleetList(e);
    const dl = driverList(e);
    const el = employeeList(e);
    const ll = laneList(e);
    yl[0]!.displayName = 'bad';
    fl[0]!.displayName = 'bad';
    dl[0]!.displayName = 'bad';
    el[0]!.displayName = 'bad';
    expect(yardList(e)[0]!.displayName).toBe('Cēsis yard');
    expect(fleetList(e)[0]!.displayName).toBe('Volvo FH16');
    expect(driverList(e)[0]!.displayName).toBe('Jānis Bērziņš');
    expect(employeeList(e)[0]!.displayName).toBe('Pēteris Ozols');
    expect(e.rng.snapshot()).toEqual(rng);
  });

  // ── Determinism ───────────────────────────────────────────────────
  it('same seed and commands produce identical checksums', () => {
    const a = world(), b = world();
    go(a, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(b, 'DO', 'CreateDispatchOrder', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
    });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLogChecksum()).toBe(b.eventLogChecksum());
  });

  // ── Invariant checks ──────────────────────────────────────────────
  it('no double assignment of same driver', () => {
    const e = world();
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'AssignDriverToTruck', { driverId: 'DRIVER-000001', truckId: 'TRUCK-000001' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('rejects atomic paths and contains no Step 12 state', () => {
    const e = world();
    const s: any = e.authoritativeState();
    expect(s.contracts).toBeUndefined();
    expect(s.exports).toBeUndefined();
    expect(s.markets).toBeUndefined();
    expect(s.operations).toBeDefined();
    expect(s.operations.yards).toHaveLength(1);
  });

  it('operations summary is printable', () => {
    const e = world();
    const summary = operationsSummary(e);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.some(l => l.includes('Yards'))).toBe(true);
    expect(summary.some(l => l.includes('Fleet'))).toBe(true);
  });
});
