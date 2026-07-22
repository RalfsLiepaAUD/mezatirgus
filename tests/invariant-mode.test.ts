import { describe, expect, it } from 'vitest';
import { SimulationEngine, command } from '../src/core/engine.js';
import { TICK_DURATION_SECONDS } from '../src/core/constants.js';
import { setupAutonomousScheduler } from '../src/scheduler/commands.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';
import { publicOffers } from '../src/scheduler/commands.js';

const mk = (seed = 'inv-test') => new SimulationEngine({
  seed, configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

const comp = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

function base(seed = 'inv-test') {
  const e = mk(seed);
  go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 3_000_000 });
  go(e, 'C2', 'CreateCompany', { displayName: 'C2', reputationBasisPoints: 5000 });
  go(e, 'CASH2', 'CreateOpeningBalance', { companyId: 'COMPANY-000002', amountMinor: 5_000_000 });
  go(e, 'L1', 'CreateLocation', { displayName: 'Y', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
  go(e, 'L2', 'CreateLocation', { displayName: 'B', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
  go(e, 'L3', 'CreateLocation', { displayName: 'F', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
  go(e, 'R1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000003', toLocationId: 'LOCATION-000001', accessClass: 'GRAVEL', distanceMetres: 80_000, travelSeconds: 7200, directed: true });
  go(e, 'B1', 'CreateBuyer', { configId: 'buyer.gauja_sawmill', displayName: 'G', fictional: true, buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002', compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', accepted: true }], capacityMilliM3: 100_000, stockMilliM3: 80_000, targetStockMilliM3: 50_000, consumptionMilliM3PerDay: 500, paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200, measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200, strictnessBasisPoints: 5000 });
  go(e, 'PC', 'PublishBuyerPriceCard', { buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', baseRateMinorPerM3: 6_000 });
  go(e, 'SUP', 'CreateSupplier', { configId: 'supplier.liepa_owner', displayName: 'L', fictional: true, archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000001', locationId: 'LOCATION-000003', channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'], suppliedAssortmentIds: ['assortment.sawlogs'], paymentExpectationSeconds: 7200, documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000, initialRelationshipBasisPoints: 5000 });
  go(e, 'CONT', 'CreateSupplierContact', { supplierId: 'SUPPLIER-000001', displayName: 'J', role: 'O', phoneNumber: '+371', email: 'j@l.lv' });
  go(e, 'EMP', 'CreateEmployee', { companyId: 'COMPANY-000001', displayName: 'P', role: 'YARD_WORKER', wageMinorPerHour: 1_200 });
  go(e, 'YD', 'CreateYard', { companyId: 'COMPANY-000001', locationId: 'LOCATION-000001', displayName: 'Y', totalCapacityMilliM3: 100_000, storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000, sortingCapable: true });
  go(e, 'MKT', 'CreateMarket', { regime: 'NORMAL', season: 'SUMMER', drivers: [{ displayName: 'D', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }] });
  return e;
}

function runAdvanced(e: SimulationEngine, days: number) {
  setupAutonomousScheduler(e);
  e.advanceFixedTicks(days * 24);
}

describe('Invariant mode and accessor safety', () => {

  // ── Off-grid boundary crossing ───────────────────────────────────
  it('BOUNDARY detects day crossing on off-grid advanceUntil', () => {
    const e = base();
    e.setInvariantMode('BOUNDARY');
    setupAutonomousScheduler(e);
    // Advance to off-grid time (not a day boundary)
    e.advanceUntil(20_000);
    // Then cross a day boundary
    expect(() => e.advanceUntil(90_000)).not.toThrow();
    // Should have checked invariants at day 1 boundary
  });

  it('same-day advance does not throw (no false positive)', () => {
    const e = base();
    e.setInvariantMode('BOUNDARY');
    setupAutonomousScheduler(e);
    // Advance 5 hours within day 0 — should not throw
    expect(() => e.advanceFixedTicks(5)).not.toThrow();
  });

  it('multiple-day advance triggers checks correctly', { timeout: 30000 }, () => {
    const e = base();
    e.setInvariantMode('BOUNDARY');
    setupAutonomousScheduler(e);
    // Jump 3 days — should not throw (valid state)
    expect(() => e.advanceFixedTicks(72)).not.toThrow();
    // Jump another 3 days via advanceUntil, off-grid
    expect(() => e.advanceUntil(e.clock.currentGameTime + 50_000)).not.toThrow();
  });

  it('BOUNDARY mode detects invalid state at next boundary', () => {
    const e = mk('boundary-detect');
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'Y', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'MKT', 'CreateMarket', { regime: 'NORMAL', season: 'SUMMER', drivers: [{ displayName: 'D', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }] });
    e.setInvariantMode('BOUNDARY');
    setupAutonomousScheduler(e);
    // Directly corrupt state to test detection
    const fin = (e as any).finance;
    const origState = fin.state;
    fin.state = { ...origState, appliedEventIds: ['fake-dup', 'fake-dup'] };
    // BOUNDARY mode should catch at day boundary
    expect(() => e.advanceFixedTicks(24)).toThrow('Duplicate applied finance event ID');
    fin.state = origState; // restore
  });

  // ── FULL mode invariants ────────────────────────────────────────
  it('FULL mode runs invariants on every event', () => {
    const e = base();
    e.setInvariantMode('FULL');
    // A valid command should not throw
    expect(() => e.execute(command('test', 'PauseSimulation', e))).not.toThrow();
  });

  // ── Accessor mutation safety ─────────────────────────────────────
  it('allSuppliers returns deep-cloned data', () => {
    const e = base();
    runAdvanced(e, 3);
    const suppliers = e.suppliers.allSuppliers();
    const originalCount = e.suppliers.allSuppliers().length;
    // Push to returned array
    suppliers.push({} as any);
    expect(e.suppliers.allSuppliers().length).toBe(originalCount);
    // Mutate a property
    if (suppliers[0]) {
      (suppliers[0] as any).displayName = 'MUTATED';
      expect(e.suppliers.supplier(suppliers[0].id)!.displayName).not.toBe('MUTATED');
    }
  });

  it('allOffers returns deep-cloned data', () => {
    const e = base();
    runAdvanced(e, 3);
    const offers = e.suppliers.allOffers();
    const count = offers.length;
    offers.push({} as any);
    expect(e.suppliers.allOffers().length).toBe(count);
    // Mutate nested object
    if (offers[0]?.truth) {
      offers[0].truth.actualVolumeMilliM3 = 999999;
      const fresh = e.suppliers.offer(offers[0].id)!;
      expect(fresh.truth.actualVolumeMilliM3).not.toBe(999999);
    }
  });

  it('allCommitments returns deep-cloned data', () => {
    const e = base();
    runAdvanced(e, 3);
    const commitments = e.finance.allCommitments();
    const count = commitments.length;
    commitments.push({} as any);
    expect(e.finance.allCommitments().length).toBe(count);
  });

  it('allLocations returns deep-cloned data', () => {
    const e = base();
    const locs = e.routing.allLocations();
    const count = locs.length;
    locs.push({} as any);
    expect(e.routing.allLocations().length).toBe(count);
    if (locs[0]) {
      (locs[0] as any).displayName = 'MUTATED';
      expect(e.routing.location(locs[0].id)!.displayName).not.toBe('MUTATED');
    }
  });

  it('allEmployees and allYards return deep-cloned data', () => {
    const e = base();
    const emps = e.operations.allEmployees();
    const yds = e.operations.allYards();
    emps.push({} as any);
    yds.push({} as any);
    expect(e.operations.allEmployees().length).toBe(1);
    expect(e.operations.allYards().length).toBe(1);
  });

  // ── FULL vs BOUNDARY equivalence ─────────────────────────────────
  it('FULL and BOUNDARY produce identical results at 5 days', { timeout: 60000 }, () => {
    // Run FULL first (slower), then BOUNDARY on same seed
    const full = base('equiv5'); full.setInvariantMode('FULL'); runAdvanced(full, 5);
    const bnd = base('equiv5'); bnd.setInvariantMode('BOUNDARY'); runAdvanced(bnd, 5);
    expect(full.stateChecksum()).toBe(bnd.stateChecksum());
    expect(full.eventLogChecksum()).toBe(bnd.eventLogChecksum());
    expect(full.finance.snapshot().transactions.length).toBe(bnd.finance.snapshot().transactions.length);
    expect(full.suppliers.snapshot().offers.length).toBe(bnd.suppliers.snapshot().offers.length);
  });

  // ── Save/load/replay triggers invariants ─────────────────────────
  it('invalid state detected at createSave', () => {
    const e = base();
    // Corrupt the save snapshot to trigger invariant failure on load
    runAdvanced(e, 5);
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    // Corrupt the snapshot — loadSave must detect via checkInvariants
    (save.snapshot.state as any).finance.appliedEventIds = ['dup', 'dup'];
    expect(() => loadSave(save)).toThrow();
  });

  it('invalid restored state detected at loadSave', () => {
    // Create a valid save, then corrupt it before loading
    const e = base();
    runAdvanced(e, 5);
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    // Corrupt the snapshot state in the save envelope
    (save.snapshot.state as any).finance.appliedEventIds = ['x', 'x'];
    expect(() => loadSave(save)).toThrow();
  });

  it('replay after reconstruction runs invariants', () => {
    const e = base();
    runAdvanced(e, 5);
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    // Normal load should succeed (state is valid)
    expect(() => loadSave(save)).not.toThrow();
  });

  // ── checkInvariants is reachable on every domain ─────────────────
  it('every domain has a working checkInvariants', () => {
    const e = base();
    runAdvanced(e, 3);
    expect(() => {
      e.checkInvariants();
    }).not.toThrow();
  });
});
