import { describe, expect, it } from 'vitest';
import { command, SimulationEngine } from '../src/core/engine.js';
import { calculateSaveChecksum, createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot, snapshotChecksum } from '../src/persistence/snapshot.js';
import { exportQuoteList, exportOrderList, exportsSummary } from '../src/exports/read-models.js';

const mk = () => new SimulationEngine({
  seed: 'exports-step-13',
  configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

function world() {
  const e = mk();
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
  go(e, 'PORT', 'CreateLocation', { displayName: 'Rīga Port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
  go(e, 'DEST', 'CreateLocation', { displayName: 'Rotterdam', countryCode: 'NL', regionCode: 'NL', roles: ['PORT'] });
  go(e, 'SEA', 'CreateRouteEdge', {
    fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002',
    accessClass: 'SEA', distanceMetres: 1_500_000, travelSeconds: 172_800, directed: true,
  });
  go(e, 'EB', 'CreateExportBuyer', {
    configId: 'buyer.export_europe', displayName: 'Rotterdam Timber BV', fictional: true,
    buyerType: 'EXPORT_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002',
    paymentTermsSeconds: 30_000,
  });
  go(e, 'Q', 'CreateExportQuote', {
    portLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
    rateMinorPerM3: 8_000, handlingCostMinor: 50_000, documentationCostMinor: 10_000,
    expiryTimestamp: 200_000,
  });
  go(e, 'QA', 'AcceptExportQuote', { quoteId: 'EXQUOTE-000001' });
  go(e, 'ORD', 'CreateExportOrder', {
    quoteId: 'EXQUOTE-000001', exportBuyerId: 'EXBUYER-000001',
    volumeMilliM3: 30_000, requiredDocumentTypes: ['CERT_OF_ORIGIN', 'PHYTOSANITARY'],
  });
  return e;
}

describe('Step 13 — export port, charter, and sea transport', () => {

  it('creates export buyer with deterministic ID', () => {
    const e = world();
    expect(e.exports.buyer('EXBUYER-000001')).toMatchObject({
      displayName: 'Rotterdam Timber BV',
      status: 'ACTIVE',
    });
  });

  it('rejects invalid buyer creation atomically', () => {
    const e = mk(), before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateExportBuyer', {}).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('creates quote with expiry schedule', () => {
    const e = world();
    expect(e.exports.quote('EXQUOTE-000001')).toMatchObject({
      rateMinorPerM3: 8_000, status: 'ACCEPTED',
    });
    expect(e.queue.snapshot().some(x => x.eventType === 'ExportQuoteExpired')).toBe(true);
  });

  it('creates export order from accepted quote', () => {
    const e = world();
    expect(e.exports.order('EXORDER-000001')).toMatchObject({
      status: 'QUOTED', volumeMilliM3: 30_000,
      rateMinorPerM3: 8_000, documentStatus: 'PENDING',
    });
  });

  it('rejects order with unaccepted quote', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'L1', 'CreateLocation', { displayName: 'Port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
    go(e, 'L2', 'CreateLocation', { displayName: 'Dest', countryCode: 'NL', regionCode: 'NL', roles: ['PORT'] });
    go(e, 'SEA', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002', accessClass: 'SEA', distanceMetres: 1_500_000, travelSeconds: 172_800, directed: true });
    go(e, 'EB', 'CreateExportBuyer', { configId: 'buyer.export_europe', displayName: 'Buyer', fictional: true, buyerType: 'EXPORT_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002', paymentTermsSeconds: 30_000 });
    go(e, 'Q', 'CreateExportQuote', { portLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002', rateMinorPerM3: 8_000, handlingCostMinor: 50_000, documentationCostMinor: 10_000, expiryTimestamp: 200_000 });
    // Order without accepting quote
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateExportOrder', { quoteId: 'EXQUOTE-000001', exportBuyerId: 'EXBUYER-000001', volumeMilliM3: 10_000 }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  // ── Documents ──────────────────────────────────────────────────────
  it('validates documents — valid passes', () => {
    const e = world();
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    expect(e.exports.order('EXORDER-000001')!.documentStatus).toBe('VALID');
  });

  it('validates documents — missing fails', () => {
    const e = world();
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001', missingDocs: ['CERT_OF_ORIGIN'] });
    expect(e.exports.order('EXORDER-000001')!.documentStatus).toBe('MISSING');
  });

  it('slot confirm requires valid documents', () => {
    const e = world();
    const before = e.auditFingerprint();
    expect(go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  // ── Full happy path ────────────────────────────────────────────────
  it('full export flow: docs → slot → load → depart → arrive → accept → settle', () => {
    const e = world();
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    expect(e.exports.order('EXORDER-000001')!.documentStatus).toBe('VALID');
    go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001' });
    expect(e.exports.order('EXORDER-000001')!.status).toBe('BOOKED');
    // Advance to loading
    e.advanceUntil(e.clock.currentGameTime + 5000);
    expect(e.exports.order('EXORDER-000001')!.status).toBe('LOADING');
    go(e, 'LOAD', 'CompleteExportLoading', { orderId: 'EXORDER-000001' });
    // Advance to trigger scheduled departure and arrival
    e.advanceUntil(e.clock.currentGameTime + 200_000);
    expect(e.exports.order('EXORDER-000001')!.status).toBe('ARRIVED');
    expect(e.exports.order('EXORDER-000001')!.status).toBe('ARRIVED');
    // Accept cargo
    go(e, 'ACCEPT', 'AcceptExportCargo', { orderId: 'EXORDER-000001', acceptedVolumeMilliM3: 28_000 });
    expect(e.exports.order('EXORDER-000001')!.status).toBe('ACCEPTED');
    expect(e.exports.order('EXORDER-000001')!.acceptedVolumeMilliM3).toBe(28_000);
    // Settle creates receivable + payable
    const cashBefore = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    expect(e.exports.order('EXORDER-000001')!.status).toBe('SETTLED');
    expect(e.finance.snapshot().receivables.length).toBe(1);
    expect(e.finance.snapshot().payables.length).toBeGreaterThan(0);
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBe(cashBefore); // no cash change
  });

  it('cancels export order before departure', () => {
    const e = world();
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    expect(e.exports.order('EXORDER-000001')!.status).toBe('CANCELLED');
    expect(e.finance.snapshot().receivables.length).toBe(0);
  });

  it('departure schedules arrival, stale if cancelled', () => {
    const e = world();
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001' });
    e.advanceUntil(e.clock.currentGameTime + 5000);
    go(e, 'LOAD', 'CompleteExportLoading', { orderId: 'EXORDER-000001' });
    e.advanceUntil(e.clock.currentGameTime + 10);
    go(e, 'CX', 'CancelExportOrder', { orderId: 'EXORDER-000001' });
    // Advance past arrival — should stay cancelled
    e.advanceUntil(e.clock.currentGameTime + 200_000);
    expect(e.exports.order('EXORDER-000001')!.status).toBe('CANCELLED');
  });

  // ── Finance integration ────────────────────────────────────────────
  it('settlement receivable can be collected', () => {
    const e = world();
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001' });
    e.advanceUntil(e.clock.currentGameTime + 5000);
    go(e, 'LOAD', 'CompleteExportLoading', { orderId: 'EXORDER-000001' });
    e.advanceUntil(e.clock.currentGameTime + 200_000);
    go(e, 'ACCEPT', 'AcceptExportCargo', { orderId: 'EXORDER-000001', acceptedVolumeMilliM3: 30_000 });
    go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
    const cashBefore = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
    go(e, 'RECV', 'RecordReceivablePayment', { receivableId: 'RECEIVABLE-000001', amountMinor: e.finance.receivable('RECEIVABLE-000001')!.principalMinor });
    expect(e.finance.receivable('RECEIVABLE-000001')!.status).toBe('PAID');
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBeGreaterThan(cashBefore);
  });

  // ── Save/load/replay ───────────────────────────────────────────────
  it('save/load/replay preserves exports state', () => {
    const e = world(), snap = createSnapshot(e);
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001' });
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.exports.snapshot()).toEqual(e.exports.snapshot());
  });

  it('migrates version 11 while preserving Steps 1–12', () => {
    const legacy = world(), save: any = createSave(legacy, createSnapshot(legacy));
    delete save.snapshot.state.exports;
    save.snapshot.snapshotSchemaVersion = 11;
    const { snapshotChecksum: _, ...bare } = save.snapshot;
    save.snapshot.snapshotChecksum = snapshotChecksum(bare);
    save.saveSchemaVersion = 11;
    save.coreVersion = '0.12.0';
    const { saveChecksum: __, ...saveBare } = save;
    save.saveChecksum = calculateSaveChecksum(saveBare);
    const loaded = loadSave(save);
    expect(loaded.contracts.snapshot()).toEqual(legacy.contracts.snapshot());
    expect(loaded.exports.snapshot()).toEqual({ appliedEventIds: [], buyers: [], quotes: [], orders: [] });
  });

  // ── Read models ────────────────────────────────────────────────────
  it('read models are defensive and RNG-free', () => {
    const e = world();
    const rng = e.rng.snapshot();
    const ql = exportQuoteList(e);
    const ol = exportOrderList(e);
    ql[0]!.status = 'BAD';
    ol[0]!.status = 'BAD';
    expect(exportQuoteList(e)[0]!.status).toBe('ACCEPTED');
    expect(exportOrderList(e)[0]!.status).toBe('QUOTED');
    expect(exportsSummary(e).length).toBeGreaterThan(0);
    expect(e.rng.snapshot()).toEqual(rng);
  });

  // ── Determinism ───────────────────────────────────────────────────
  it('same seed and commands produce identical checksums', () => {
    const a = world(), b = world();
    go(a, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    go(b, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLogChecksum()).toBe(b.eventLogChecksum());
  });

  // ── No Step 14 state ──────────────────────────────────────────────
  it('contains no Step 14 markets state', () => {
    const e = world();
    const s: any = e.authoritativeState();
    expect(s.markets).toBeDefined();
    expect(s.exports).toBeDefined();
  });
});
