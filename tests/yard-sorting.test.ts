import { describe, expect, it } from 'vitest';
import { SimulationEngine, command } from '../src/core/engine.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';

const mk = () => new SimulationEngine({
  seed: 'yard-sort-m1',
  configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

const comp = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

function world() {
  const e = mk();
  go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
  go(e, 'L1', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
  go(e, 'Y', 'CreateYard', {
    companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    displayName: 'Test yard', totalCapacityMilliM3: 100_000,
    storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000,
  });
  go(e, 'DL', 'CreateDeal', {
    companyId: 'COMPANY-000001', counterpartyId: 'S',
    expectedVolumeMilliM3: 100_000, financeSourceIds: [], currency: 'EUR',
    description: 'Test deal',
  });
  go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
  go(e, 'LOT', 'CreateLot', {
    dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
    locationId: 'LOCATION-000001', originalVolumeMilliM3: 100_000, composition: comp,
    freshness: 'FRESH', certainty: 'ESTIMATED',
  });
  go(e, 'B', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 20_000, composition: comp });
  go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000001', volumes: [
    { label: 'A', volumeMilliM3: 8000 },
    { label: 'B', volumeMilliM3: 7000 },
    { label: 'C', volumeMilliM3: 4000 },
    { label: 'loss', volumeMilliM3: 1000 },
  ]});
  return e;
}

describe('Phase 2 Milestone 2 — Yard Sorting M1', () => {

  it('no yard rejects', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'DL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'S', expectedVolumeMilliM3: 10_000, financeSourceIds: [], currency: 'EUR', description: 'D' });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'C', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition: comp, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'B', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition: comp });
    go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000001', volumes: [{ label: 'A', volumeMilliM3: 9000 }, { label: 'loss', volumeMilliM3: 1000 }] });
    // No yard created — lacks sorting capability because no yard exists
    const before = e.auditFingerprint();
    const r = go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-999999', batchId: 'BATCH-000001' });
    expect(r.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('yard without sorting capability rejects', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'Y', 'CreateYard', { companyId: 'COMPANY-000001', locationId: 'LOCATION-000001', displayName: 'Y', totalCapacityMilliM3: 100_000, storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 0 });
    go(e, 'DL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'S', expectedVolumeMilliM3: 10_000, financeSourceIds: [], currency: 'EUR', description: 'D' });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'C', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition: comp, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'B', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition: comp });
    go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000001', volumes: [{ label: 'A', volumeMilliM3: 9000 }, { label: 'loss', volumeMilliM3: 1000 }] });
    const before = e.auditFingerprint();
    const r = go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001' });
    expect(r.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('batch at wrong location rejects', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'L2', 'CreateLocation', { displayName: 'Forest', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
    go(e, 'Y', 'CreateYard', { companyId: 'COMPANY-000001', locationId: 'LOCATION-000001', displayName: 'Y', totalCapacityMilliM3: 100_000, storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000 });
    go(e, 'DL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'S', expectedVolumeMilliM3: 10_000, financeSourceIds: [], currency: 'EUR', description: 'D' });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'C', locationId: 'LOCATION-000002', originalVolumeMilliM3: 10_000, composition: comp, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'B', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition: comp });
    go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000001', volumes: [{ label: 'A', volumeMilliM3: 9000 }, { label: 'loss', volumeMilliM3: 1000 }] });
    const before = e.auditFingerprint();
    const r = go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001' });
    expect(r.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('valid sorting consumes parent and creates children', () => {
    const e = world();
    const parent = e.inventory.batch('BATCH-000001')!;
    expect(parent.status).toBe('AVAILABLE');
    expect(parent.currentVolumeMilliM3).toBe(20_000);
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    // Parent depleted
    expect(e.inventory.batch('BATCH-000001')!.status).toBe('DEPLETED');
    expect(e.inventory.batch('BATCH-000001')!.currentVolumeMilliM3).toBe(0);
    expect(e.inventory.batch('BATCH-000001')!.certainty).toBe('SORTED');
    // Children created (8000, 7000, 4000, 1000)
    expect(e.inventory.batch('BATCH-000002')).toBeDefined();
    expect(e.inventory.batch('BATCH-000003')).toBeDefined();
    expect(e.inventory.batch('BATCH-000004')).toBeDefined();
  });

  it('deterministic children created with correct volumes', () => {
    const e = world();
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const c1 = e.inventory.batch('BATCH-000002')!;
    const c2 = e.inventory.batch('BATCH-000003')!;
    const c3 = e.inventory.batch('BATCH-000004')!;
    expect(c1.currentVolumeMilliM3).toBe(8000);
    expect(c2.currentVolumeMilliM3).toBe(7000);
    expect(c3.currentVolumeMilliM3).toBe(4000);
    // 1000 volume is loss not a batch
  });

  it('no empty children', () => {
    const e = world();
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const batches = e.inventory.snapshot().batches.filter(b => b.parentBatchIds.includes('BATCH-000001'));
    for (const b of batches) {
      expect(b.currentVolumeMilliM3).toBeGreaterThan(0);
    }
  });

  it('exact volume conservation including loss', () => {
    const e = world();
    const parentVolume = e.inventory.batch('BATCH-000001')!.currentVolumeMilliM3;
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const children = e.inventory.snapshot().batches.filter(b => b.parentBatchIds.includes('BATCH-000001'));
    const childSum = children.reduce((n, b) => n + b.currentVolumeMilliM3, 0);
    // Loss = 1000 (from recovery volumes); sum(children) + loss = parent
    expect(childSum).toBe(8000 + 7000 + 4000);
    expect(childSum + 1000).toBe(parentVolume);
  });

  it('parent cannot be sorted twice', () => {
    const e = world();
    go(e, 'S1', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const before = e.auditFingerprint();
    const r = go(e, 'S2', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    expect(r.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('child provenance correct', () => {
    const e = world();
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    for (const b of e.inventory.snapshot().batches) {
      if (b.parentBatchIds.includes('BATCH-000001')) {
        expect(b.ancestryDepth).toBeGreaterThan(0);
        expect(b.parentBatchIds).toContain('BATCH-000001');
        expect(b.rootLotId).toBe('LOT-000001');
      }
    }
  });

  it('freshness and ownership inherited', () => {
    const e = world();
    const parent = e.inventory.batch('BATCH-000001')!;
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    for (const b of e.inventory.snapshot().batches.filter(b => b.parentBatchIds.includes('BATCH-000001'))) {
      expect(b.freshness).toBe(parent.freshness);
      expect(b.ownerCompanyId).toBe(parent.ownerCompanyId);
      expect(b.custodyActorId).toBe(parent.custodyActorId);
      expect(b.locationId).toBe(parent.locationId);
    }
  });

  it('claim never upgraded — children inherit composition', () => {
    const e = world();
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    for (const b of e.inventory.snapshot().batches.filter(b => b.parentBatchIds.includes('BATCH-000001'))) {
      // Composition inherited from parent
      expect(b.composition.species[0]!.id).toBe('species.birch');
      expect(b.composition.assortment[0]!.id).toBe('assortment.sawlogs');
    }
  });

  it('cost basis conserved by volume share', () => {
    const e = world();
    // Add a cost layer to the parent
    go(e, 'CL', 'AddCostLayer', {
      attachedToType: 'BATCH', attachedToId: 'BATCH-000001',
      sourceObjectId: 'test', category: 'ACQUISITION', currency: 'EUR',
      totalMinor: 100_000, attributableVolumeMilliM3: 20_000,
      allocationMethod: 'VOLUME_PROPORTIONAL',
      provenanceReference: 'TEST',
    });
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    // Parent cost layer is ALLOCATED (the sorting cost layer stays ACTIVE)
    const parentLayers = e.inventory.snapshot().costLayers.filter(cl => cl.attachedToId === 'BATCH-000001' && cl.category !== 'OPERATIONAL');
    expect(parentLayers.every(cl => cl.status === 'ALLOCATED')).toBe(true);
    // Children have inherited cost layers
    for (const b of ['BATCH-000002', 'BATCH-000003', 'BATCH-000004'] as const) {
      const cls = e.inventory.snapshot().costLayers.filter(cl => cl.attachedToId === b);
      expect(cls.length).toBeGreaterThan(0);
      for (const cl of cls) {
        expect(cl.attributableVolumeMilliM3).toBeGreaterThan(0);
        expect(cl.totalMinor).toBeGreaterThan(0);
      }
    }
  });

  it('sorting cost posted once', () => {
    const e = world();
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const sortPayables = e.finance.snapshot().payables.filter(p => p.principalMinor > 0);
    expect(sortPayables.length).toBe(1);
    const sortTxns = e.finance.transactions().filter(t => t.description.includes('sorting'));
    expect(sortTxns.length).toBe(1);
  });

  it('insufficient capacity queues rather than completes', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'Y', 'CreateYard', { companyId: 'COMPANY-000001', locationId: 'LOCATION-000001', displayName: 'Y', totalCapacityMilliM3: 5_000, storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000 });
    go(e, 'DL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'S', expectedVolumeMilliM3: 100_000, financeSourceIds: [], currency: 'EUR', description: 'D' });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'C', locationId: 'LOCATION-000001', originalVolumeMilliM3: 100_000, composition: comp, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'B', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 20_000, composition: comp });
    go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000001', volumes: [{ label: 'A', volumeMilliM3: 10000 }, { label: 'B', volumeMilliM3: 9900 }, { label: 'loss', volumeMilliM3: 100 }] });
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    // Capacity exceeded → queued
    expect(e.operations.snapshot().sortJobs.some(sj => sj.batchId === 'BATCH-000001' && sj.status === 'QUEUED')).toBe(true);
    // No children created
    expect(e.inventory.batch('BATCH-000002')).toBeUndefined();
  });

  it('save/load/replay preserves queued state', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'Y', 'CreateYard', { companyId: 'COMPANY-000001', locationId: 'LOCATION-000001', displayName: 'Y', totalCapacityMilliM3: 5_000, storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000 });
    go(e, 'DL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'S', expectedVolumeMilliM3: 100_000, financeSourceIds: [], currency: 'EUR', description: 'D' });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'C', locationId: 'LOCATION-000001', originalVolumeMilliM3: 100_000, composition: comp, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'B', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 20_000, composition: comp });
    go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000001', volumes: [{ label: 'A', volumeMilliM3: 10000 }, { label: 'B', volumeMilliM3: 9900 }, { label: 'loss', volumeMilliM3: 100 }] });
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.operations.snapshot().sortJobs).toEqual(e.operations.snapshot().sortJobs);
  });

  it('save/load/replay preserves completed sort and children', () => {
    const e = world();
    go(e, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.inventory.snapshot()).toEqual(e.inventory.snapshot());
    expect(loaded.inventory.batch('BATCH-000002')!.currentVolumeMilliM3).toBe(8000);
  });

  it('deterministic behavior', () => {
    const a = world(); const b = world();
    go(a, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    go(b, 'S', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000001', conductType: 'ETHICAL' });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.inventory.snapshot()).toEqual(b.inventory.snapshot());
  });
});
