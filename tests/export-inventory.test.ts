import { describe, expect, it } from 'vitest';
import { SimulationEngine, command } from '../src/core/engine.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';

const mk = () => new SimulationEngine({
  seed: 'export-inv',
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

function setup(e: SimulationEngine) {
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
  go(e, 'LOC1', 'CreateLocation', { displayName: 'Port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
  go(e, 'LOC2', 'CreateLocation', { displayName: 'Dest', countryCode: 'NL', regionCode: 'NL', roles: ['PORT'] });
  go(e, 'SEA', 'CreateRouteEdge', {
    fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002',
    accessClass: 'SEA', distanceMetres: 1_500_000, travelSeconds: 172_800, directed: true,
  });
  go(e, 'EB', 'CreateExportBuyer', {
    configId: 'buyer.export_europe', displayName: 'Rotterdam Timber', fictional: true,
    buyerType: 'EXPORT_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002',
    paymentTermsSeconds: 30_000,
  });
  go(e, 'Q', 'CreateExportQuote', {
    portLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
    rateMinorPerM3: 8_000, handlingCostMinor: 50_000, documentationCostMinor: 10_000,
    expiryTimestamp: 500_000,
  });
  go(e, 'QA', 'AcceptExportQuote', { quoteId: 'EXQUOTE-000001' });
}

function createInventory(e: SimulationEngine, volumeMilliM3 = 50_000) {
  go(e, 'DL', 'CreateDeal', {
    companyId: 'COMPANY-000001', counterpartyId: 'SUPPLIER',
    expectedVolumeMilliM3: volumeMilliM3, financeSourceIds: [], currency: 'EUR',
    description: 'Export test deal',
  });
  go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
  go(e, 'LOT', 'CreateLot', {
    dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001',
    custodyActorId: 'actor', locationId: 'LOCATION-000001',
    originalVolumeMilliM3: volumeMilliM3, freshness: 'FRESH', certainty: 'INSPECTED',
    composition: comp,
  });
  go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3, composition: comp });
}

function createExportOrder(e: SimulationEngine, opts: { volumeMilliM3?: number; batchIds?: string[] } = {}) {
  return go(e, 'ORD', 'CreateExportOrder', {
    quoteId: 'EXQUOTE-000001', exportBuyerId: 'EXBUYER-000001',
    volumeMilliM3: opts.volumeMilliM3 ?? 30_000,
    batchIds: opts.batchIds ?? ['BATCH-000001'],
    requiredDocumentTypes: ['CERT_OF_ORIGIN', 'PHYTOSANITARY'],
  });
}

function fullExportFlow(e: SimulationEngine, acceptedVolume = 28_500) {
  go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
  go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001', delaySeconds: 3600 });
  e.advanceUntil(e.clock.currentGameTime + 5_000);
  go(e, 'LOAD', 'CompleteExportLoading', { orderId: 'EXORDER-000001' });
  e.advanceUntil(e.clock.currentGameTime + 200_000);
  go(e, 'ACC', 'AcceptExportCargo', { orderId: 'EXORDER-000001', acceptedVolumeMilliM3: acceptedVolume });
}

describe('Phase 2 Milestone 2 — Export Inventory Consumption', () => {

  it('export consumes real inventory — batch volume decreases', () => {
    const e = mk(); setup(e); createInventory(e);
    const batch = e.inventory.batch('BATCH-000001')!;
    expect(batch.currentVolumeMilliM3).toBe(50_000);
    expect(createExportOrder(e).accepted).toBe(true);
    fullExportFlow(e);
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const after = e.inventory.batch('BATCH-000001')!;
    expect(after.currentVolumeMilliM3).toBe(50_000 - 28_500);
    expect(after.depletedVolumeMilliM3).toBe(28_500);
  });

  it('insufficient inventory at order creation rejects atomically', () => {
    const e = mk(); setup(e); createInventory(e, 10_000);
    const before = e.auditFingerprint();
    const r = createExportOrder(e, { volumeMilliM3: 30_000 });
    expect(r.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('same inventory cannot be sold twice', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    const r2 = createExportOrder(e);
    // Second order references same batch — should fail because insufficient remaining
    expect(r2.accepted).toBe(false);
  });

  it('correct volume is removed from inventory', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e, { volumeMilliM3: 40_000 });
    fullExportFlow(e, 30_000);
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const batch = e.inventory.batch('BATCH-000001')!;
    // 30k accepted of 40k ordered; reservation holds 40k but we release+deplete 30k
    expect(batch.depletedVolumeMilliM3).toBe(30_000);
    expect(batch.currentVolumeMilliM3).toBe(50_000 - 30_000);
  });

  it('finance entry and receivable created once', () => {
    const e = mk(); setup(e); createInventory(e);
    createExportOrder(e);
    fullExportFlow(e);
    expect(e.finance.snapshot().receivables.length).toBe(0);
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    expect(e.finance.snapshot().receivables.length).toBe(1);
    expect(e.inventory.batch('BATCH-000001')!.depletedVolumeMilliM3).toBe(28_500);
    // Second settle fails
    const before = e.auditFingerprint();
    expect(go(e, 'SETTLE2', 'SettleExportOrder', { orderId: 'EXORDER-000001' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
    expect(e.finance.snapshot().receivables.length).toBe(1);
  });

  it('failed sale leaves inventory and finance unchanged', () => {
    const e = mk(); setup(e); createInventory(e);
    const r = createExportOrder(e);
    expect(r.accepted).toBe(true);
    // Cancel before cargo acceptance — no inventory consumed
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    expect(e.exports.order('EXORDER-000001')!.status).toBe('CANCELLED');
    expect(e.inventory.batch('BATCH-000001')!.currentVolumeMilliM3).toBe(50_000);
    expect(e.finance.snapshot().receivables.length).toBe(0);
    expect(e.finance.snapshot().payables.length).toBe(0);
  });

  it('save/load/replay preserves consumed inventory state', () => {
    const e = mk(); setup(e); createInventory(e);
    createExportOrder(e);
    fullExportFlow(e);
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.inventory.snapshot()).toEqual(e.inventory.snapshot());
    // Batch volume correctly reduced
    const batch = loaded.inventory.batch('BATCH-000001')!;
    expect(batch.currentVolumeMilliM3).toBe(50_000 - 28_500);
    expect(batch.depletedVolumeMilliM3).toBe(28_500);
  });

  it('deterministic behavior — same seed produces same consumed state', () => {
    const a = mk(); setup(a); createInventory(a);
    const b = mk(); setup(b); createInventory(b);
    createExportOrder(a); createExportOrder(b);
    fullExportFlow(a); fullExportFlow(b);
    go(a, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    go(b, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.inventory.snapshot()).toEqual(b.inventory.snapshot());
  });

  it('existing export demo shows real stock reduction', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    const before = e.inventory.batch('BATCH-000001')!.currentVolumeMilliM3;
    fullExportFlow(e, 28_500);
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const after = e.inventory.batch('BATCH-000001')!.currentVolumeMilliM3;
    expect(before - after).toBe(28_500);
    // Receivable collected
    const recv = e.finance.snapshot().receivables.find(r => r.companyId === 'COMPANY-000001');
    expect(recv).toBeDefined();
    expect(recv!.principalMinor).toBeGreaterThan(0);
  });
});

describe('Phase 2 Milestone 2 — Export Cancellation Reservation Release', () => {

  it('cancel releases the order\'s reservation', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    expect(e.inventory.snapshot().reservations.filter(r => r.status === 'ACTIVE').length).toBe(1);
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    // Reservation released
    expect(e.inventory.snapshot().reservations.filter(r => r.status === 'ACTIVE').length).toBe(0);
    expect(e.inventory.snapshot().reservations.some(r => r.status === 'RELEASED')).toBe(true);
  });

  it('remaining inventory becomes immediately available for a new export', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    // A second order on the same batch should succeed (reservation was released)
    const batch = e.inventory.batch('BATCH-000001')!;
    const available = batch.currentVolumeMilliM3 - batch.reservedVolumeMilliM3 - batch.allocatedVolumeMilliM3;
    expect(available).toBe(50_000);
    const r2 = createExportOrder(e);
    expect(r2.accepted).toBe(true);
  });

  it('cancel creates no finance entries', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    const txBefore = e.finance.snapshot().transactions.length;
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    expect(e.finance.snapshot().receivables.length).toBe(0);
    expect(e.finance.snapshot().payables.length).toBe(0);
    expect(e.finance.snapshot().transactions.length).toBe(txBefore);
  });

  it('cancel does not deplete inventory', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    const batch = e.inventory.batch('BATCH-000001')!;
    expect(batch.currentVolumeMilliM3).toBe(50_000);
    expect(batch.depletedVolumeMilliM3).toBe(0);
  });

  it('cancelling one of two reservations on the same batch leaves the other intact', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e, { volumeMilliM3: 10_000 });
    // Create second quote+order on same batch
    go(e, 'Q2', 'CreateExportQuote', {
      portLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
      rateMinorPerM3: 8_000, handlingCostMinor: 50_000, documentationCostMinor: 10_000,
      expiryTimestamp: 500_000,
    });
    go(e, 'QA2', 'AcceptExportQuote', { quoteId: 'EXQUOTE-000002' });
    go(e, 'ORD2', 'CreateExportOrder', {
      quoteId: 'EXQUOTE-000002', exportBuyerId: 'EXBUYER-000001',
      volumeMilliM3: 10_000, batchIds: ['BATCH-000001'],
      requiredDocumentTypes: ['CERT_OF_ORIGIN', 'PHYTOSANITARY'],
    });
    expect(e.inventory.snapshot().reservations.filter(r => r.status === 'ACTIVE').length).toBe(2);
    // Cancel first order — second reservation must survive
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    expect(e.inventory.snapshot().reservations.filter(r => r.status === 'ACTIVE').length).toBe(1);
    expect(e.inventory.snapshot().reservations.filter(r => r.status === 'ACTIVE' && r.sourceObjectId === 'EXORDER-000002').length).toBe(1);
  });

  it('double cancel is rejected atomically', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    const before = e.auditFingerprint();
    const r2 = go(e, 'CX2', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    expect(r2.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('save/load/replay preserves released-reservation state', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e);
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.inventory.snapshot()).toEqual(e.inventory.snapshot());
    // Released reservation stays released
    expect(loaded.inventory.snapshot().reservations.some(r => r.status === 'RELEASED' && r.batchId === 'BATCH-000001')).toBe(true);
  });

  it('deterministic cancel behavior', () => {
    const a = mk(); setup(a); createInventory(a, 50_000);
    const b = mk(); setup(b); createInventory(b, 50_000);
    createExportOrder(a); createExportOrder(b);
    go(a, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    go(b, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.inventory.snapshot().reservations).toEqual(b.inventory.snapshot().reservations);
  });
});

describe('Phase 2 Milestone 2 — Export full-depletion regression', () => {

  it('full depletion of one batch zeros reserved/allocated and passes invariants', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e, { volumeMilliM3: 50_000 });
    fullExportFlow(e, 50_000);
    go(e, 'STL', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const batch = e.inventory.batch('BATCH-000001')!;
    expect(batch.status).toBe('DEPLETED');
    expect(batch.reservedVolumeMilliM3).toBe(0);
    expect(batch.allocatedVolumeMilliM3).toBe(0);
    expect(batch.currentVolumeMilliM3).toBe(0);
    expect(batch.depletedVolumeMilliM3).toBe(50_000);
  });

  it('full depletion across multiple export batches', () => {
    // Two single-batch orders, each fully depleting their batch independently
    const a = mk(); setup(a); createInventory(a, 30_000);
    createExportOrder(a, { volumeMilliM3: 30_000 });
    fullExportFlow(a, 30_000);
    go(a, 'STL', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    expect(a.inventory.batch('BATCH-000001')!.status).toBe('DEPLETED');
    expect(a.inventory.batch('BATCH-000001')!.reservedVolumeMilliM3).toBe(0);

    const b = mk(); setup(b); createInventory(b, 20_000);
    createExportOrder(b, { volumeMilliM3: 20_000 });
    fullExportFlow(b, 20_000);
    go(b, 'STL2', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    expect(b.inventory.batch('BATCH-000001')!.status).toBe('DEPLETED');
    expect(b.inventory.batch('BATCH-000001')!.reservedVolumeMilliM3).toBe(0);
  });

  it('partial depletion remains unchanged', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e, { volumeMilliM3: 20_000 });
    fullExportFlow(e, 20_000);
    go(e, 'STL3', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const batch = e.inventory.batch('BATCH-000001')!;
    expect(batch.status).not.toBe('DEPLETED');
    expect(batch.currentVolumeMilliM3).toBe(30_000);
    expect(batch.depletedVolumeMilliM3).toBe(20_000);
  });

  it('no manual ReleaseInventoryReservation required for invariants', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e, { volumeMilliM3: 50_000 });
    fullExportFlow(e, 50_000);
    // No pre-release — SettleExportOrder must handle it alone
    go(e, 'STL4', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
  });

  it('replay/save/load determinism', () => {
    const e = mk(); setup(e); createInventory(e, 50_000);
    createExportOrder(e, { volumeMilliM3: 50_000 });
    fullExportFlow(e, 50_000);
    go(e, 'STL5', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.inventory.snapshot()).toEqual(e.inventory.snapshot());
  });

  it('deterministic depletion across two seed runs', () => {
    const a = mk(); setup(a); createInventory(a, 50_000);
    createExportOrder(a, { volumeMilliM3: 50_000 });
    fullExportFlow(a, 50_000);
    go(a, 'STL', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const b = mk(); setup(b); createInventory(b, 50_000);
    createExportOrder(b, { volumeMilliM3: 50_000 });
    fullExportFlow(b, 50_000);
    go(b, 'STL', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.inventory.snapshot().batches).toEqual(b.inventory.snapshot().batches);
  });
});
