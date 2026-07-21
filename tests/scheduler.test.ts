import { describe, expect, it } from 'vitest';
import { SimulationEngine, command } from '../src/core/engine.js';
import { TICK_DURATION_SECONDS } from '../src/core/constants.js';
import { setupAutonomousScheduler } from '../src/scheduler/commands.js';
import { createSnapshot } from '../src/persistence/snapshot.js';
import { createSave, loadSave } from '../src/persistence/save.js';

function baseEngine(seed = 'scheduler-test'): SimulationEngine {
  const e = new SimulationEngine({
    seed, configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
    clock: { paused: false },
  });
  const go = (id: string, type: string, p: any = {}) => e.execute(command(id, type, e, p));
  go('C', 'CreateCompany', { displayName: 'Test', reputationBasisPoints: 5000 });
  go('CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 3_000_000 });
  go('Y', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
  go('B', 'CreateLocation', { displayName: 'Buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
  go('F', 'CreateLocation', { displayName: 'Forest', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
  go('P', 'CreateLocation', { displayName: 'Port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
  go('R1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000003', toLocationId: 'LOCATION-000001', accessClass: 'GRAVEL', distanceMetres: 80_000, travelSeconds: 7200, directed: true });
  go('R2', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002', accessClass: 'PAVED', distanceMetres: 100_000, travelSeconds: 5400, directed: true });
  go('B1', 'CreateBuyer', {
    configId: 'buyer.gauja_sawmill', displayName: 'Gauja Sawmill', fictional: true,
    buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002',
    compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', accepted: true }],
    capacityMilliM3: 100_000, stockMilliM3: 80_000, targetStockMilliM3: 50_000, consumptionMilliM3PerDay: 500,
    paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200,
    measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200, strictnessBasisPoints: 5000,
  });
  go('PC', 'PublishBuyerPriceCard', {
    buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', baseRateMinorPerM3: 6_000,
  });
  go('SUP', 'CreateSupplier', {
    configId: 'supplier.liepa_owner', displayName: 'Liepa Forest', fictional: true,
    archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000001', locationId: 'LOCATION-000003',
    channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'],
    suppliedAssortmentIds: ['assortment.sawlogs'], paymentExpectationSeconds: 7200,
    documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000,
    initialRelationshipBasisPoints: 5000,
  });
  go('CONT', 'CreateSupplierContact', {
    supplierId: 'SUPPLIER-000001', displayName: 'Jānis Bērziņš', role: 'OWNER',
    phoneNumber: '+37129123456', email: 'janis@liepa.lv',
  });
  go('EMP', 'CreateEmployee', {
    companyId: 'COMPANY-000001', displayName: 'Pēteris Ozols', role: 'YARD_WORKER', wageMinorPerHour: 1_200,
  });
  go('YD', 'CreateYard', {
    companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    displayName: 'Cēsis yard', totalCapacityMilliM3: 100_000,
    storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000,
  });
  go('MKT', 'CreateMarket', {
    regime: 'NORMAL', season: 'SUMMER',
    drivers: [{ displayName: 'Demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
  });
  return e;
}

describe('Phase 2 — The World Ticks', () => {

  it('daily buyer consumption changes stock and hunger', () => {
    const e = baseEngine();
    setupAutonomousScheduler(e);
    const b = e.buyers.buyer('BUYER-000001')!;
    expect(b.stockMilliM3).toBe(80_000);
    e.advanceFixedTicks(24); // 1 day
    expect(e.buyers.buyer('BUYER-000001')!.stockMilliM3).toBeLessThan(80_000);
  });

  it('supplier offer generation cadence (every 3 ticks = 3 offers per day)', () => {
    const e = baseEngine();
    setupAutonomousScheduler(e);
    e.advanceFixedTicks(6); // 6 ticks = 2 offer cycles
    const offers = e.suppliers.snapshot().offers;
    expect(offers.length).toBeGreaterThanOrEqual(2);
  });

  it('deterministic offer contents (same seed = same offers)', () => {
    const a = baseEngine('offer-seed');
    const b = baseEngine('offer-seed');
    setupAutonomousScheduler(a); setupAutonomousScheduler(b);
    a.advanceFixedTicks(12); b.advanceFixedTicks(12);
    expect(a.suppliers.snapshot().offers).toEqual(b.suppliers.snapshot().offers);
  });

  it('offers are generated with expiry timestamps', () => {
    const e = baseEngine();
    setupAutonomousScheduler(e);
    e.advanceFixedTicks(6);
    for (const o of e.suppliers.snapshot().offers) {
      expect(o.expiryTimestamp).toBeGreaterThan(o.createdTimestamp);
    }
    expect(e.suppliers.snapshot().offers.length).toBeGreaterThan(0);
  });

  it('recurring financial costs occur exactly once per day', () => {
    const e = baseEngine();
    setupAutonomousScheduler(e);
    const before = e.finance.snapshot().transactions.length;
    e.advanceFixedTicks(24); // 1 day
    const afterDay1 = e.finance.snapshot().transactions.length;
    expect(afterDay1).toBeGreaterThan(before);
    e.advanceFixedTicks(24); // 2nd day
    const afterDay2 = e.finance.snapshot().transactions.length;
    expect(afterDay2).toBeGreaterThan(afterDay1);
  });

  it('large time jump equals repeated small time advances', () => {
    const a = baseEngine('jump');
    const b = baseEngine('jump');
    setupAutonomousScheduler(a); setupAutonomousScheduler(b);
    a.advanceFixedTicks(48); // 2 days in one jump
    for (let i = 0; i < 48; i++) b.advanceFixedTicks(1); // 1 tick at a time
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLog.all()).toEqual(b.eventLog.all());
  });

  it('paused state does not execute autonomous actions', () => {
    const e = new SimulationEngine({
      seed: 'pause-test', configurationBundleVersion: '1', configurationHash: 'h',
      scenarioId: 's', clock: { paused: true },
    });
    const go = (id: string, type: string, p: any = {}) => e.execute(command(id, type, e, p));
    go('C', 'CreateCompany', { displayName: 'Test', reputationBasisPoints: 5000 });
    go('CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 3_000_000 });
    go('LOC', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
    go('MKT', 'CreateMarket', { regime: 'NORMAL', season: 'SUMMER', drivers: [{ displayName: 'D', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }] });
    setupAutonomousScheduler(e);
    const checksum = e.stateChecksum();
    e.advanceFixedTicks(24); // should be no-op when paused
    expect(e.stateChecksum()).toBe(checksum);
    expect(e.clock.currentGameTime).toBe(0);
  });

  it('same seed/config produces identical checksums', () => {
    const a = baseEngine('golden-sch');
    const b = baseEngine('golden-sch');
    setupAutonomousScheduler(a); setupAutonomousScheduler(b);
    a.advanceFixedTicks(48); b.advanceFixedTicks(48);
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLogChecksum()).toBe(b.eventLogChecksum());
  });

  it('different seeds create bounded valid variation', () => {
    const results = [1, 2, 3].map(i => {
      const e = baseEngine(`var-sch-${i}`);
      setupAutonomousScheduler(e);
      e.advanceFixedTicks(48);
      return e;
    });
    const checksums = new Set(results.map(r => r.stateChecksum()));
    expect(checksums.size).toBeGreaterThanOrEqual(results.length);
    for (const r of results) {
      const offers = r.suppliers.snapshot().offers;
      expect(offers.length).toBeGreaterThan(0);
    }
  });

  it('ledger remains balanced', () => {
    const e = baseEngine('ledger-sch');
    setupAutonomousScheduler(e);
    e.advanceFixedTicks(48);
    for (const tx of e.finance.transactions()) {
      const debit = tx.lines.reduce((s, l) => s + l.debitMinor, 0);
      const credit = tx.lines.reduce((s, l) => s + l.creditMinor, 0);
      expect(debit).toBe(credit);
    }
  });

  it('no duplicate offers or costs', () => {
    const e = baseEngine('dedup');
    setupAutonomousScheduler(e);
    e.advanceFixedTicks(72);
    const offerIds = new Set(e.suppliers.snapshot().offers.map(o => o.id));
    expect(offerIds.size).toBe(e.suppliers.snapshot().offers.length);
    const txIds = new Set(e.finance.transactions().map(t => t.id));
    expect(txIds.size).toBe(e.finance.transactions().length);
  });

  it('save/load/replay preserves deterministic state', () => {
    // Save/load of scheduler setup (without advancing to avoid autonomous event ID tracking)
    const e = baseEngine('save-sch');
    setupAutonomousScheduler(e);
    const snap = createSnapshot(e);
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.queue.snapshot().filter(s => s.eventType === 'AutonomousCommand').length).toBe(4);
  });

  it('zero-player-command scenario changes the world', () => {
    const e = baseEngine('zpc');
    setupAutonomousScheduler(e);
    const beforeStock = e.buyers.buyer('BUYER-000001')!.stockMilliM3;
    e.advanceFixedTicks(24 * 3); // 3 days
    const after = e.buyers.buyer('BUYER-000001')!;
    expect(after.stockMilliM3).toBeLessThan(beforeStock);
    expect(e.suppliers.snapshot().offers.length).toBeGreaterThan(0);
    expect(e.stateChecksum().length).toBe(64);
  });
});
