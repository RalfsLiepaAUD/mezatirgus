import { command, SimulationEngine } from '../core/engine.js';
import { createSave, loadSave } from '../persistence/save.js';
import { createSnapshot } from '../persistence/snapshot.js';
import { operationsSummary, dispatchBoard } from '../operations/read-models.js';
import { financeHeader } from '../finance/read-models.js';

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.pulpwood', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

function go(e: SimulationEngine, id: string, type: string, p: any = {}) {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) console.error(`  ✗ ${type}: ${r.message}`);
  return r;
}

console.log('═══════════════════════════════════════════');
console.log('  Step 11 — Operations Demo');
console.log('═══════════════════════════════════════════\n');

// ── Setup ──────────────────────────────────────────────────────────
console.log('◆ Setting up company, locations, and route...');
const e = new SimulationEngine({
  seed: 'operations-demo-' + Date.now(),
  configurationBundleVersion: '1',
  configurationHash: 'demo',
  scenarioId: 'demo',
  clock: { paused: false },
});

go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 5_000_000 });

go(e, 'L1', 'CreateLocation', {
  displayName: 'Cēsis yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'],
});
go(e, 'L2', 'CreateLocation', {
  displayName: 'Rīga buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'],
});
go(e, 'R', 'CreateRouteEdge', {
  fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002',
  accessClass: 'PAVED', distanceMetres: 100_000, travelSeconds: 7200, directed: true,
});

// ── Create assets ──────────────────────────────────────────────────
console.log('◆ Creating yard, truck, driver, employee...');
go(e, 'Y', 'CreateYard', {
  companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
  displayName: 'Cēsis yard', totalCapacityMilliM3: 100_000,
  storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000, sortingCapable: true,
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

// ── Create inventory ───────────────────────────────────────────────
console.log('◆ Creating timber inventory at yard...');
go(e, 'DEAL', 'CreateDeal', {
  companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
  currency: 'EUR', expectedVolumeMilliM3: 30_000, description: 'Birch pulpwood', financeSourceIds: [],
});
go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
go(e, 'LOT', 'CreateLot', {
  dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
  locationId: 'LOCATION-000001', originalVolumeMilliM3: 100_000, composition,
  freshness: 'FRESH', certainty: 'ESTIMATED',
});
go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 40_000, composition });
go(e, 'LOAD', 'CreateLoad', {
  ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
  originLocationId: 'LOCATION-000001',
});
go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });

// ── Adjust yard capacity ──────────────────────────────────────────
go(e, 'ADJ', 'AdjustYardCapacity', { yardId: 'YARD-000001', deltaMilliM3: 10_000 });

// ── Dispatch ────────────────────────────────────────────────────────
console.log('◆ Dispatching owned truck Cēsis→Rīga...');
go(e, 'DO', 'CreateDispatchOrder', {
  companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
  loadId: 'LOAD-000001', destinationLocationId: 'LOCATION-000002',
});

go(e, 'DC', 'ConfirmDispatchOrder', { orderId: 'DISPATCH-000001' });
console.log('   Truck dispatched, travelling 100 km...');

// ── Advance to arrival ────────────────────────────────────────────
e.advanceUntil(7200);
console.log('   Truck arrived at destination');

// ── Unload and complete ───────────────────────────────────────────
go(e, 'U', 'UnloadDispatchOrder', { orderId: 'DISPATCH-000001' });
go(e, 'DONE', 'CompleteDispatchOrder', { orderId: 'DISPATCH-000001' });

const dispatchCost = e.operations.dispatchOrder('DISPATCH-000001')!.operatingCostMinor!;
console.log(`   Dispatch completed, operating cost: €${(dispatchCost / 100).toFixed(2)}`);

// ── Lane ────────────────────────────────────────────────────────────
console.log('\n◆ Creating recurring lane Cēsis→Rīga...');
go(e, 'LN', 'CreateLane', {
  companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
  originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
  displayName: 'Cēsis→Rīga pulpwood', stabilityThreshold: 3,
});

// Complete 3 clean trips for lane stability using fresh batches
for (let i = 0; i < 3; i++) {
  const batchSuffix = i + 2;
  const loadSuffix = i + 2;
  const orderNum = i + 2;
  // Create new batch from the lot
  go(e, `B${i}`, 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
  // Create and allocate load
  go(e, `L${i}`, 'CreateLoad', {
    ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
    originLocationId: 'LOCATION-000001',
  });
  go(e, `A${i}`, 'AllocateBatchToLoad', { batchId: `BATCH-00000${batchSuffix}`, loadId: `LOAD-00000${loadSuffix}`, volumeMilliM3: 10_000 });
  // Create, confirm, complete dispatch
  go(e, `DO${i}`, 'CreateDispatchOrder', {
    companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
    loadId: `LOAD-00000${loadSuffix}`, destinationLocationId: 'LOCATION-000002', laneId: 'LANE-000001',
  });
  go(e, `DC${i}`, 'ConfirmDispatchOrder', { orderId: `DISPATCH-00000${orderNum}` });
  e.advanceUntil(7200 * (i + 1) + 7200);
  go(e, `U${i}`, 'UnloadDispatchOrder', { orderId: `DISPATCH-00000${orderNum}` });
  go(e, `DN${i}`, 'CompleteDispatchOrder', { orderId: `DISPATCH-00000${orderNum}` });
}
console.log('   Lane achieved stable status after 3 clean trips');

// ── Post operating cost ────────────────────────────────────────────
console.log('\n◆ Posting yard storage cost...');
go(e, 'COST', 'PostOperationsCost', {
  companyId: 'COMPANY-000001', amountMinor: 25_000,
  category: 'YARD_STORAGE', description: 'Yard storage cost week 1',
});

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('  Operations Summary');
console.log('═══════════════════════════════════════════');

for (const line of operationsSummary(e)) console.log(`  ${line}`);

const header = financeHeader(e, 'COMPANY-000001');
console.log(`  Cash balance: €${(header.cashBalanceMinor / 100).toFixed(2)}`);

const lane = e.operations.lane('LANE-000001');
if (lane) {
  console.log(`\n  Lane "${lane.displayName}":`);
  console.log(`    Status: ${lane.status}`);
  console.log(`    Trips: ${lane.totalTrips}`);
  console.log(`    Volume: ${(lane.totalVolumeMilliM3 / 1000).toFixed(1)} m³`);
  console.log(`    Stable: ${lane.isStable}`);
}

// ── Save/Load check ─────────────────────────────────────────────────
const save = createSave(e, createSnapshot(e));
const loaded = loadSave(save);
console.log(`\n  Save/load checksum match: ${loaded.stateChecksum() === e.stateChecksum() ? '✓' : '✗'}`);
console.log(`  Core version: ${save.coreVersion}`);
console.log(`  Save schema: ${save.saveSchemaVersion}`);
console.log('═══════════════════════════════════════════\n');
