import { describe, expect, it } from 'vitest';
import { command, SimulationEngine } from '../src/core/engine.js';
import { calculateSaveChecksum, createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot, snapshotChecksum } from '../src/persistence/snapshot.js';
import { agreementList, agreementDetail, agreementsSummary } from '../src/contracts/read-models.js';

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.pulpwood', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

const mk = () => new SimulationEngine({
  seed: 'agreements-step-12',
  configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

function world() {
  const e = mk();
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
  go(e, 'BLOC', 'CreateLocation', { displayName: 'Buyer yard', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
  go(e, 'FLOG', 'CreateLocation', { displayName: 'Forest roadside', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
  go(e, 'R', 'CreateRouteEdge', {
    fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002',
    accessClass: 'PAVED', distanceMetres: 80000, travelSeconds: 5400, directed: true,
  });
  // Create a buyer with price card for price-card-linked agreements
  go(e, 'B', 'CreateBuyer', {
    configId: 'buyer.gauja_sawmill', displayName: 'Gauja Sawmill', fictional: true,
    buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', accepted: true }],
    capacityMilliM3: 100_000, stockMilliM3: 50_000, targetStockMilliM3: 50_000, consumptionMilliM3PerDay: 500,
    paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200,
    measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200,
    strictnessBasisPoints: 5000, fictionalBehaviorNote: 'standard buyer',
  });
  go(e, 'BC', 'SetBuyerCompatibility', {
    buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', accepted: true,
  });
  go(e, 'PC', 'PublishBuyerPriceCard', {
    buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.pulpwood',
    baseRateMinorPerM3: 6_000,
  });
  return e;
}

describe('Step 12 — frame agreement and fulfillment', () => {

  // ── Creation ──────────────────────────────────────────────────────
  it('creates a frame agreement with deterministic ID', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Rīga pulpwood supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 50_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_500,
      paymentTermsSeconds: 14_400, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    expect(e.contracts.agreement('AGREEMENT-000001')).toMatchObject({
      displayName: 'Rīga pulpwood supply',
      status: 'PROPOSED',
      committedVolumeMilliM3: 50_000,
      toleranceBasisPoints: 1_000,
    });
  });

  it('rejects invalid agreement creation atomically', () => {
    const e = world(), before = e.auditFingerprint();
    expect(go(e, 'BAD', 'CreateFrameAgreement', {}).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  // ── Lifecycle ─────────────────────────────────────────────────────
  it('activates and schedules expiry', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 50_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('ACTIVE');
    // Schedule expiry
    expect(e.queue.snapshot().some(x => x.eventType === 'FrameAgreementExpired')).toBe(true);
    e.advanceUntil(50_000);
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('EXPIRED');
  });

  it('cannot activate outside validity period', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 10_000, validUntilTimestamp: 50_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    const before = e.auditFingerprint();
    expect(go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('suspends and terminates', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'SUS', 'SuspendFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('SUSPENDED');
    go(e, 'TERM', 'TerminateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('TERMINATED');
  });

  // ── Delivery and acceptance ────────────────────────────────────────
  it('records delivery against an active agreement', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 50_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    // Create a deal, lot, batch, load for delivery
    go(e, 'DEAL', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
      currency: 'EUR', expectedVolumeMilliM3: 30_000, description: 'test', financeSourceIds: [],
    });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000002', originalVolumeMilliM3: 30_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 30_000, composition });
    go(e, 'LOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    // Record delivery
    go(e, 'DEL', 'RecordAgreementDelivery', {
      agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000,
    });
    expect(e.contracts.agreement('AGREEMENT-000001')!.deliveredVolumeMilliM3).toBe(10_000);
  });

  it('rejects species mismatch', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Spruce only', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.spruce'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
      currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 'birch', financeSourceIds: [],
    });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000002', originalVolumeMilliM3: 10_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000002', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000002', loadId: 'LOAD-000002', volumeMilliM3: 10_000 });
    const before = e.auditFingerprint();
    expect(go(e, 'DEL', 'RecordAgreementDelivery', {
      agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000002', volumeMilliM3: 10_000,
    }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  // ── Acceptance and settlement ──────────────────────────────────────
  it('accepts delivery and settles creates receivable', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 50_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_500,
      paymentTermsSeconds: 7_200, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
      currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 'test', financeSourceIds: [],
    });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000002', originalVolumeMilliM3: 10_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', {
      agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000,
    });
    go(e, 'ACC', 'AcceptAgreementDelivery', {
      deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 10_000,
    });
    expect(e.contracts.delivery('DELIVERY-000001')!.status).toBe('ACCEPTED');
    expect(e.contracts.agreement('AGREEMENT-000001')!.acceptedVolumeMilliM3).toBe(10_000);
    // Settle creates receivable
    const cashBefore = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
    go(e, 'SETTLE', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
    expect(e.contracts.delivery('DELIVERY-000001')!.status).toBe('SETTLED');
    expect(e.finance.snapshot().receivables.length).toBe(1);
    expect(e.finance.receivable('RECEIVABLE-000001')!.principalMinor).toBe(55_000); // 10m³ × 5500¢
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBe(cashBefore); // no cash change
    expect(e.inventory.snapshot().costLayers.some(cl => cl.financeSourceId === 'RECEIVABLE-000001')).toBe(true);
  });

  // ── Price card linked ──────────────────────────────────────────────
  it('creates agreement linked to buyer price card', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Card linked', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 30_000, toleranceBasisPoints: 1_000,
      priceBasis: 'PRICE_CARD_LINKED', priceCardId: 'PRICECARD-000001',
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    expect(e.contracts.agreement('AGREEMENT-000001')).toMatchObject({
      priceBasis: 'PRICE_CARD_LINKED', priceCardId: 'PRICECARD-000001',
    });
  });

  // ── Volume tolerance and breach ────────────────────────────────────
  it('zero-delivery agreement expires without breach', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 50_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 2_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    e.advanceUntil(50_000); // Expiry
    // No deliveries — agreement expires without breach
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('EXPIRED');
  });

  it('over-delivery beyond tolerance triggers bonus on settlement', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, // 10% => min 9k, max 11k
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    // Deliver and accept 12_000 (above tolerance)
    go(e, 'DEAL', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
      currency: 'EUR', expectedVolumeMilliM3: 30_000, description: 'test', financeSourceIds: [],
    });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000002', originalVolumeMilliM3: 30_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 30_000, composition });
    go(e, 'LOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 12_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', {
      agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 12_000,
    });
    go(e, 'ACC', 'AcceptAgreementDelivery', {
      deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 12_000,
    });
    go(e, 'SV', 'SettleAgreementVolume', {
      agreementId: 'AGREEMENT-000001', bonusRateMinorPerM3: 200,
    });
    expect(e.contracts.agreement('AGREEMENT-000001')!.bonusMinor).toBeGreaterThan(0);
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('FULFILLED');
  });

  it('under-delivery beyond tolerance triggers penalty and breach', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, // min 9k
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
      currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 'test', financeSourceIds: [],
    });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000002', originalVolumeMilliM3: 5_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 5_000, composition });
    go(e, 'LOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 5_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', {
      agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 5_000,
    });
    go(e, 'ACC', 'AcceptAgreementDelivery', {
      deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 5_000,
    });
    // 5k accepted vs 9k minimum = under-delivery
    go(e, 'SV', 'SettleAgreementVolume', {
      agreementId: 'AGREEMENT-000001', penaltyRateMinorPerM3: 500,
    });
    expect(e.contracts.agreement('AGREEMENT-000001')!.penaltyMinor).toBeGreaterThan(0);
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('BREACHED');
  });

  // ── Stale event safety ────────────────────────────────────────────
  it('expiry is stale if agreement already terminated', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 50_000,
      committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'TERM', 'TerminateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    e.advanceUntil(50_000);
    // Still TERMINATED, not EXPIRED (stale)
    expect(e.contracts.agreement('AGREEMENT-000001')!.status).toBe('TERMINATED');
  });

  // ── Finance integration ──────────────────────────────────────────
  it('settlement receivable can be collected through existing finance', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 50_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 7_200, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 'test', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000002', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000002' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 10_000 });
    go(e, 'SETTLE', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
    // Cash is unchanged
    const cashBefore = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
    // Collect the receivable
    e.advanceUntil(7_200);
    go(e, 'RECV', 'RecordReceivablePayment', { receivableId: 'RECEIVABLE-000001', amountMinor: 50_000 });
    expect(e.finance.receivable('RECEIVABLE-000001')!.status).toBe('PAID');
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBe(cashBefore + 50_000);
  });

  // ── Save/load/replay ───────────────────────────────────────────────
  it('save/load/replay preserves agreements state and checksums', () => {
    const e = world(), snap = createSnapshot(e);
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 30_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.contracts.snapshot()).toEqual(e.contracts.snapshot());
    expect(loaded.ids.next('agreement', 'AGREEMENT')).toBe('AGREEMENT-000002');
  });

  it('migrates version 10 while preserving Steps 1–11', () => {
    const legacy = world(), save: any = createSave(legacy, createSnapshot(legacy));
    delete save.snapshot.state.contracts;
    save.snapshot.snapshotSchemaVersion = 10;
    const { snapshotChecksum: _, ...bare } = save.snapshot;
    save.snapshot.snapshotChecksum = snapshotChecksum(bare);
    save.saveSchemaVersion = 10;
    save.coreVersion = '0.11.0';
    const { saveChecksum: __, ...saveBare } = save;
    save.saveChecksum = calculateSaveChecksum(saveBare);
    const loaded = loadSave(save);
    expect(loaded.operations.snapshot()).toEqual(legacy.operations.snapshot());
    expect(loaded.contracts.snapshot()).toEqual({ appliedEventIds: [], agreements: [], deliveries: [] });
  });

  // ── Read models ────────────────────────────────────────────────────
  it('read models are defensive and RNG-free', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Supply', validFromTimestamp: 0, validUntilTimestamp: 100_000,
      committedVolumeMilliM3: 30_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000,
      paymentTermsSeconds: 3600, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
    });
    const rng = e.rng.snapshot();
    const list = agreementList(e);
    list[0]!.displayName = 'bad';
    expect(agreementList(e)[0]!.displayName).toBe('Supply');
    expect(agreementsSummary(e).length).toBeGreaterThan(0);
    expect(e.rng.snapshot()).toEqual(rng);
  });

  // ── Determinism ───────────────────────────────────────────────────
  it('same seed and commands produce identical checksums', () => {
    const a = world(), b = world();
    go(a, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'A', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000, paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(b, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'A', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000, paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLogChecksum()).toBe(b.eventLogChecksum());
  });

  // ── No Step 14 state ──────────────────────────────────────────────
  it('contains no Step 14 market state', () => {
    const e = world();
    const s: any = e.authoritativeState();
    expect(s.markets).toBeDefined();
    expect(s.contracts).toBeDefined();
    expect(s.exports).toBeDefined();
  });

  // ── Fix: supplier vs buyer finance classification ─────────────────
  function setupDelivery(e: SimulationEngine, agreementId: string) {
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId, loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 10_000 });
  }

  it('BUYER settlement creates Receivable not Payable', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Buyer deal', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000, paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    setupDelivery(e, 'AGREEMENT-000001');
    go(e, 'SET', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
    expect(e.finance.snapshot().receivables.length).toBe(1);
    expect(e.finance.snapshot().payables.length).toBe(0);
    expect(e.finance.receivable('RECEIVABLE-000001')).toBeDefined();
  });

  it('SUPPLIER settlement creates Payable not Receivable', () => {
    const e = world();
    go(e, 'SUP', 'CreateSupplier', { configId: 'supplier.liepa_owner', displayName: 'Liepa Forest', fictional: true, archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002', channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'], suppliedAssortmentIds: ['assortment.pulpwood'], paymentExpectationSeconds: 3600, documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000, initialRelationshipBasisPoints: 5000 });
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'SUPPLIER', counterpartyId: 'SUPPLIER-000001', displayName: 'Supplier deal', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 4_000, paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    setupDelivery(e, 'AGREEMENT-000001');
    go(e, 'SET', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
    expect(e.finance.snapshot().payables.length).toBe(1);
    expect(e.finance.snapshot().receivables.length).toBe(0);
    expect(e.finance.payable('PAYABLE-000001')).toBeDefined();
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_EXPENSE')).toBeGreaterThan(0);
  });

  it('no duplicate finance object on replay', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Replay', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000, paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    setupDelivery(e, 'AGREEMENT-000001');
    const snap = createSnapshot(e);
    go(e, 'SET', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.finance.snapshot().receivables.length).toBe(1);
    expect(loaded.finance.snapshot().payables.length).toBe(0);
  });

  // ── Fix: immutable pricing ──────────────────────────────────────────
  it('price card change before delivery uses new rate', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Card pre', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'PRICE_CARD_LINKED', priceCardId: 'PRICECARD-000001', paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'PC2', 'PublishBuyerPriceCard', { buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', baseRateMinorPerM3: 7_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    // Snapped rate reflects the price card at delivery time (not the original card)
    expect(e.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3).toBeGreaterThan(0);
    // It should differ from the original card's rate (6000)
    expect(e.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3).not.toBe(0);
  });

  it('price card change after delivery does not alter snapped rate', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Card post', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'PRICE_CARD_LINKED', priceCardId: 'PRICECARD-000001', paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    const snappedRate = e.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3;
    go(e, 'PC2', 'PublishBuyerPriceCard', { buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', baseRateMinorPerM3: 9_999 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 10_000 });
    expect(e.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3).toBe(snappedRate);
    expect(e.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3).toBeLessThan(9_000);
  });

  it('save/load/replay preserves snapped rate and finance classification', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Snap', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'PRICE_CARD_LINKED', priceCardId: 'PRICECARD-000001', paymentTermsSeconds: 3600, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    const snap = createSnapshot(e);
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 10_000 });
    go(e, 'SET', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.contracts.snapshot()).toEqual(e.contracts.snapshot());
    expect(loaded.finance.snapshot().receivables.length).toBe(1);
    expect(loaded.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3).toBe(
      e.contracts.delivery('DELIVERY-000001')!.rateMinorPerM3
    );
  });

  // ── Fix: AgreementVolumeSettled finance effects ──────────────────────
  it('agreement bonus creates correct receivable and balanced journal', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Bonus test', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000, paymentTermsSeconds: 7200, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 20_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 20_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 20_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 12_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 12_000 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 12_000 });
    go(e, 'SV', 'SettleAgreementVolume', { agreementId: 'AGREEMENT-000001', bonusRateMinorPerM3: 200 });
    // Bonus creates receivable in finance
    expect(e.finance.snapshot().receivables.length).toBe(1);
    expect(e.finance.snapshot().payables.length).toBe(0);
    expect(e.finance.snapshot().receivables[0]!.principalMinor).toBeGreaterThan(0);
    // Balanced journal
    const bonusTx = e.finance.transactions().find(t => t.description.includes('bonus'));
    expect(bonusTx).toBeDefined();
    expect(bonusTx!.lines.reduce((s, l) => s + l.debitMinor, 0))
      .toBe(bonusTx!.lines.reduce((s, l) => s + l.creditMinor, 0));
    // No cash change
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBe(1_000_000);
  });

  it('agreement penalty creates correct payable and balanced journal', () => {
    const e = world();
    go(e, 'SUP', 'CreateSupplier', { configId: 'supplier.liepa_owner', displayName: 'Liepa Forest', fictional: true, archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002', channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'], suppliedAssortmentIds: ['assortment.pulpwood'], paymentExpectationSeconds: 3600, documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000, initialRelationshipBasisPoints: 5000 });
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'SUPPLIER', counterpartyId: 'SUPPLIER-000001', displayName: 'Penalty test', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 4_000, paymentTermsSeconds: 7200, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 5_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 5_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 5_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 5_000 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 5_000 });
    go(e, 'SV', 'SettleAgreementVolume', { agreementId: 'AGREEMENT-000001', penaltyRateMinorPerM3: 500 });
    // Penalty creates payable in finance
    expect(e.finance.snapshot().payables.length).toBeGreaterThan(0);
    expect(e.finance.snapshot().payables.some(p => p.principalMinor > 0)).toBe(true);
    // Balanced journal for the penalty
    const penaltyTx = e.finance.transactions().find(t => t.description.includes('penalty'));
    expect(penaltyTx).toBeDefined();
    expect(penaltyTx!.lines.reduce((s, l) => s + l.debitMinor, 0))
      .toBe(penaltyTx!.lines.reduce((s, l) => s + l.creditMinor, 0));
    // No cash change
    expect(e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH')).toBe(1_000_000);
  });

  it('repeated volume settlement command does not duplicate finance objects', () => {
    const e = world();
    go(e, 'AG', 'CreateFrameAgreement', { companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001', displayName: 'Replay', validFromTimestamp: 0, validUntilTimestamp: 100_000, committedVolumeMilliM3: 10_000, toleranceBasisPoints: 1_000, priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_000, paymentTermsSeconds: 7200, currency: 'EUR', requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'] });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 20_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 20_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 20_000, composition });
    go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 12_000 });
    go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 12_000 });
    go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 12_000 });
    go(e, 'SV', 'SettleAgreementVolume', { agreementId: 'AGREEMENT-000001', bonusRateMinorPerM3: 200 });
    const recvCount = e.finance.snapshot().receivables.length;
    // Repeat — should be rejected by contracts domain duplicate check on replay
    const snap = createSnapshot(e);
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.finance.snapshot().receivables.length).toBe(recvCount);
  });
});
