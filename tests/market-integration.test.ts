import { describe, expect, it } from 'vitest';
import { command, SimulationEngine } from '../src/core/engine.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';
import { marketReport, seasonalDegradationRate } from '../src/market/read-models.js';

const mk = () => new SimulationEngine({
  seed: 'market-integration',
  configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.pulpwood', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

function setupBuyer(e: SimulationEngine) {
  go(e, 'C', 'CreateCompany', { displayName: 'Test', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
  go(e, 'LOC', 'CreateLocation', { displayName: 'Buyer yard', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
  go(e, 'B', 'CreateBuyer', {
    configId: 'buyer.gauja_sawmill', displayName: 'Gauja Sawmill', fictional: true,
    buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', accepted: true }],
    capacityMilliM3: 100_000, stockMilliM3: 50_000, targetStockMilliM3: 50_000, consumptionMilliM3PerDay: 500,
    paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200,
    measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200, strictnessBasisPoints: 5000,
  });
  go(e, 'PC', 'PublishBuyerPriceCard', {
    buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', baseRateMinorPerM3: 5_000,
  });
}

describe('Step 14 — canonical integrations', () => {

  // ── Market → buyer price cards ────────────────────────────────────
  it('export-demand driver update creates new buyer price card with adjusted rate', () => {
    const e = mk();
    setupBuyer(e);
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'Export demand', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });
    const originalRate = e.buyers.priceCard('PRICECARD-000001')!.breakdown.finalRateMinorPerM3;
    go(e, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 8000, direction: 'UPWARD' });
    expect(e.buyers.priceCard('PRICECARD-000001')!.status).toBe('SUPERSEDED');
    const active = e.buyers.snapshot().priceCards.filter(pc => pc.status === 'ACTIVE');
    expect(active.length).toBe(1);
    expect(active[0]!.breakdown.finalRateMinorPerM3).toBeGreaterThan(originalRate);
    expect(active[0]!.breakdown.causeEventIds.some(id => id.startsWith('EVENT-'))).toBe(true);
  });

  it('old price cards and completed rates remain immutable after market change', () => {
    const e = mk();
    setupBuyer(e);
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'Export demand', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });
    const originalFinalRate = e.buyers.priceCard('PRICECARD-000001')!.breakdown.finalRateMinorPerM3;
    go(e, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 8000, direction: 'UPWARD' });
    expect(e.buyers.priceCard('PRICECARD-000001')!.breakdown.finalRateMinorPerM3).toBe(originalFinalRate);
    expect(e.buyers.priceCard('PRICECARD-000001')!.status).toBe('SUPERSEDED');
  });

  // ── Season → routing access ───────────────────────────────────────
  it('SPRING_THAW blocks GRAVEL and FOREST_ROAD; PAVED and SEA unaffected', () => {
    const e = mk();
    go(e, 'L1', 'CreateLocation', { displayName: 'A', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'L2', 'CreateLocation', { displayName: 'B', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'L3', 'CreateLocation', { displayName: 'C', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'L4', 'CreateLocation', { displayName: 'D', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'E1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002', accessClass: 'GRAVEL', distanceMetres: 10_000, travelSeconds: 600, directed: true });
    go(e, 'E2', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000003', accessClass: 'PAVED', distanceMetres: 20_000, travelSeconds: 900, directed: true });
    go(e, 'E3', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000004', accessClass: 'FOREST_ROAD', distanceMetres: 5_000, travelSeconds: 300, directed: true });
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'D1', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }],
    });
    // All OPEN in summer
    expect(e.routing.edge('EDGE-000001')!.accessState).toBe('OPEN');
    expect(e.routing.edge('EDGE-000002')!.accessState).toBe('OPEN');
    expect(e.routing.edge('EDGE-000003')!.accessState).toBe('OPEN');
    // Advance to SPRING_THAW
    go(e, 'S', 'AdvanceMarketSeason', { season: 'SPRING_THAW' });
    expect(e.routing.edge('EDGE-000001')!.accessState).toBe('BLOCKED');  // GRAVEL
    expect(e.routing.edge('EDGE-000002')!.accessState).toBe('OPEN');      // PAVED
    expect(e.routing.edge('EDGE-000003')!.accessState).toBe('BLOCKED');  // FOREST_ROAD
    // Restore on leaving SPRING_THAW
    go(e, 'S2', 'AdvanceMarketSeason', { season: 'SUMMER' });
    expect(e.routing.edge('EDGE-000001')!.accessState).toBe('OPEN');
    expect(e.routing.edge('EDGE-000003')!.accessState).toBe('OPEN');
  });

  // ── Season → inventory degradation ────────────────────────────────
  it('identical batch degrades faster in SUMMER than WINTER and replay reproduces it', () => {
    const setup = (e: SimulationEngine, startSeason: string) => {
      go(e, 'C', 'CreateCompany', { displayName: 'Test', reputationBasisPoints: 5000 });
      go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
      go(e, 'LOC', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
      go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
      go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
      go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
      go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
      go(e, 'MKT', 'CreateMarket', {
        regime: 'NORMAL', season: startSeason,
        drivers: [{ displayName: 'D1', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }],
      });
    };

    // Both start at SPRING_THAW (rate 3000, at threshold). Fresh batch should remain FRESH at 3000.
    const summer = mk(); setup(summer, 'SPRING_THAW');
    const winter = mk(); setup(winter, 'SPRING_THAW');
    expect(summer.inventory.batch('BATCH-000001')!.freshness).toBe('FRESH');
    expect(winter.inventory.batch('BATCH-000001')!.freshness).toBe('FRESH');

    // Advance summer → SUMMER (8000bp): FRESH→AGING because 8000 >= 3000
    go(summer, 'S', 'AdvanceMarketSeason', { season: 'SUMMER' });
    expect(summer.inventory.batch('BATCH-000001')!.freshness).toBe('AGING');
    // Replay reproduces
    const summerSnap = createSnapshot(summer);
    expect(loadSave(createSave(summer, summerSnap)).inventory.batch('BATCH-000001')!.freshness).toBe('AGING');

    // Advance winter → WINTER (2000bp): stays FRESH because 2000 < 3000
    go(winter, 'S', 'AdvanceMarketSeason', { season: 'WINTER' });
    expect(winter.inventory.batch('BATCH-000001')!.freshness).toBe('FRESH');

    // Degradation event stores seasonal rate immutably
    const summerDegEvent = summer.eventLog.all().find(e => e.eventType === 'BatchDegradationRecorded');
    expect(summerDegEvent).toBeDefined();
    expect(summerDegEvent!.payload.seasonalRateBasisPoints).toBe(8000);
    expect(summerDegEvent!.payload.previousFreshness).toBe('FRESH');
    expect(summerDegEvent!.payload.newFreshness).toBe('AGING');

    // Replay reproduces exact result
    const replaySnap = createSnapshot(summer);
    const loaded = loadSave(createSave(summer, replaySnap));
    expect(loaded.stateChecksum()).toBe(summer.stateChecksum());
    expect(loaded.inventory.batch('BATCH-000001')!.freshness).toBe('AGING');
  });

  it('prior batch degradation is immutable after later season changes', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'Test', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
    go(e, 'LOC', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'D1', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }],
    });
    go(e, 'S1', 'AdvanceMarketSeason', { season: 'AUTUMN' }); // FRESH→AGING
    const firstEventId = e.eventLog.all().find(e => e.eventType === 'BatchDegradationRecorded')!.eventId;
    go(e, 'S2', 'AdvanceMarketSeason', { season: 'WINTER' }); // no further change (rate 2000 < 6000)
    const degEvents = e.eventLog.all().filter(e => e.eventType === 'BatchDegradationRecorded');
    expect(degEvents.length).toBe(1); // no second event since AGING→DEGRADED requires 6000+bp
    expect(degEvents[0]!.eventId).toBe(firstEventId);
    expect(degEvents[0]!.payload.newFreshness).toBe('AGING');
  });

  // ── Market regime → buyer demand → price cards ─────────────────────
  it('regime transition alters buyer demand target and causal chain is inspectable', () => {
    const e = mk();
    setupBuyer(e);
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'Export demand', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });
    const originalTarget = e.buyers.buyer('BUYER-000001')!.targetStockMilliM3;
    // BOOM → target +15%
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    expect(e.buyers.buyer('BUYER-000001')!.targetStockMilliM3).toBe(Math.round(originalTarget * 115 / 100));
    expect(e.buyers.buyer('BUYER-000001')!.consumptionMilliM3PerDay).toBe(Math.round(500 * 115 / 100));
    // RECESSION → target -15% from current (57500 * 0.85 = 48875)
    go(e, 'R2', 'TransitionMarketRegime', { regime: 'RECESSION' });
    expect(e.buyers.buyer('BUYER-000001')!.targetStockMilliM3).toBe(48875);
  });

  it('regime transition affects price card rates via demand change', () => {
    const e = mk();
    setupBuyer(e);
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'D1', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });
    const preCardRate = e.buyers.priceCard('PRICECARD-000001')!.breakdown.finalRateMinorPerM3;
    // BOOM → higher demand target → lower hunger → lower price card rate
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    // Re-publish card to reflect new hunger
    go(e, 'PC2', 'PublishBuyerPriceCard', {
      buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', baseRateMinorPerM3: 5_000,
    });
    expect(e.buyers.priceCard('PRICECARD-000002')!.breakdown.finalRateMinorPerM3).not.toBe(preCardRate);
  });

  // ── Save/load/replay ──────────────────────────────────────────────
  it('save/load/replay preserves all integration state and checksums', () => {
    const e = mk();
    setupBuyer(e);
    go(e, 'LOC2', 'CreateLocation', { displayName: 'Dest', countryCode: 'LV', regionCode: 'RIGA', roles: ['YARD'] });
    go(e, 'E1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002', accessClass: 'GRAVEL', distanceMetres: 10_000, travelSeconds: 600, directed: true });
    go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 10_000, description: 't', financeSourceIds: [] });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'Export demand', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });
    const saveLoadSnap = createSnapshot(e);

    go(e, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 8000, direction: 'UPWARD' });
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    go(e, 'S', 'AdvanceMarketSeason', { season: 'SPRING_THAW' });

    const loaded = loadSave(createSave(e, saveLoadSnap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.markets.snapshot().drivers[0]!.valueBasisPoints).toBe(8000);
    expect(loaded.markets.snapshot().season).toBe('SPRING_THAW');
    expect(loaded.routing.edge('EDGE-000001')!.accessState).toBe('BLOCKED');
    expect(loaded.inventory.batch('BATCH-000001')!.freshness).toBe('AGING');
    expect(loaded.buyers.snapshot().buyers[0]!.targetStockMilliM3).toBe(57_500); // 50000 * 115 / 100
  });

  // ── No Step 15 state ──────────────────────────────────────────────
  it('contains no Step 15 headless state', () => {
    const e = mk();
    const s: any = e.authoritativeState();
    expect(s.headless).toBeUndefined();
    expect(s.markets).toBeDefined();
  });
});
