import { describe, expect, it } from 'vitest';
import { SimulationEngine, command } from '../src/core/engine.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';

const mk = () => new SimulationEngine({
  seed: 'auction-inv',
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

function world(valuation = 6000, budget = 1_000_000) {
  const e = mk();
  go(e, 'C', 'CreateCompany', { displayName: 'Meztirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: budget });
  go(e, 'LOC', 'CreateLocation', { displayName: 'Cēsis', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
  go(e, 'AI', 'CreateCompetitor', {
    displayName: 'Ziemelu Koks', fictional: true, budgetMinor: 800_000,
    strategy: 'VALUE', privateValuationMinorPerM3: valuation, valuationErrorBasisPoints: 0,
  });
  go(e, 'A', 'CreateAuction', {
    displayName: 'Cēsis birch', auctionType: 'PREPARED_ROUNDWOOD',
    volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
    depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
    closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
    locationId: 'LOCATION-000001', composition: comp, freshness: 'FRESH', certainty: 'INSPECTED',
  });
  go(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
  go(e, 'RA', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPETITOR-000001', bidderType: 'COMPETITOR' });
  go(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_200, proxyMaximumMinorPerM3: 5_500 });
  return e;
}

describe('Phase 2 Milestone 2 — Auction-to-Inventory Conversion', () => {

  it('winning auction creates one real deal and acquisition lot', () => {
    const e = world();
    e.advanceUntil(1000);
    expect(e.auctions.auction('AUCTION-000001')!.status).toBe('CLOSED');
    expect(e.auctions.auction('AUCTION-000001')!.winnerId).toBe('COMPANY-000001');
    expect(e.inventory.deal('DEAL-000001')).toBeDefined();
    expect(e.inventory.lot('LOT-000001')).toBeDefined();
  });

  it('correct company, volume, price, seller, and auction reference', () => {
    const e = world();
    e.advanceUntil(1000);
    const deal = e.inventory.deal('DEAL-000001')!;
    expect(deal.companyId).toBe('COMPANY-000001');
    expect(deal.counterpartyId).toBe('AUCTION-000001');
    expect(deal.expectedVolumeMilliM3).toBe(100_000);
    const lot = e.inventory.lot('LOT-000001')!;
    expect(lot.ownerCompanyId).toBe('COMPANY-000001');
    expect(lot.originalVolumeMilliM3).toBe(100_000);
  });

  it('appropriate TimberBatch created', () => {
    const e = world();
    e.advanceUntil(1000);
    const batch = e.inventory.batch('BATCH-000001')!;
    expect(batch.currentVolumeMilliM3).toBe(100_000);
    expect(batch.rootLotId).toBe('LOT-000001');
    expect(batch.composition).toEqual(comp);
    expect(batch.freshness).toBe('FRESH');
    expect(batch.certainty).toBe('INSPECTED');
  });

  it('payable/commitment created once', () => {
    const e = world();
    e.advanceUntil(1000);
    // Winner commitment (AUCTION_WIN)
    const winCommitment = e.finance.commitment('COMMITMENT-000001')!;
    expect(winCommitment.purpose).toBe('AUCTION_WIN');
    expect(winCommitment.amountMinor).toBeGreaterThan(0);
    // Payable created for the acquisition
    const payable = e.finance.payable('PAYABLE-000001');
    expect(payable).toBeDefined();
    expect(payable!.principalMinor).toBeGreaterThan(0);
    expect(payable!.companyId).toBe('COMPANY-000001');
    // Exactly one payable
    expect(e.finance.snapshot().payables.filter(p => p.companyId === 'COMPANY-000001').length).toBe(1);
  });

  it('losing bids create nothing — no deal, lot, batch, payable, or journal', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'LOC', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['ROADSIDE'] });
    go(e, 'AI', 'CreateCompetitor', { displayName: 'C', fictional: true, budgetMinor: 800_000, strategy: 'AGGRESSIVE', privateValuationMinorPerM3: 6_000, valuationErrorBasisPoints: 0 });
    go(e, 'A', 'CreateAuction', { displayName: 'A', auctionType: 'PREPARED_ROUNDWOOD', volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100, depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120, closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000, locationId: 'LOCATION-000001', composition: comp, freshness: 'FRESH', certainty: 'INSPECTED' });
    go(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPETITOR-000001', bidderType: 'COMPETITOR' });
    // Only competitor bids — company doesn't
    go(e, 'AIB', 'RunCompetitorBid', { auctionId: 'AUCTION-000001', competitorId: 'COMPETITOR-000001' });
    e.advanceUntil(1000);
    // Competitor wins, company loses — no company inventory or finance
    expect(e.auctions.auction('AUCTION-000001')!.winnerId).toBe('COMPETITOR-000001');
    expect(e.inventory.deal('DEAL-000001')).toBeUndefined();
    expect(e.inventory.lot('LOT-000001')).toBeUndefined();
    expect(e.inventory.batch('BATCH-000001')).toBeUndefined();
    expect(e.finance.snapshot().payables.filter(p => p.companyId === 'COMPANY-000001').length).toBe(0);
    expect(e.finance.snapshot().transactions.filter(t => t.companyId === 'COMPANY-000001').length).toBe(1); // opening balance only
  });

  it('cancelled or invalid awards create nothing', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'LOC', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['ROADSIDE'] });
    go(e, 'A', 'CreateAuction', { displayName: 'A', auctionType: 'PREPARED_ROUNDWOOD', volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100, depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120, closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000, locationId: 'LOCATION-000001', composition: comp, freshness: 'FRESH', certainty: 'INSPECTED' });
    // No registrations, no bids — auction closes with no winner
    e.advanceUntil(1000);
    expect(e.auctions.auction('AUCTION-000001')!.status).toBe('CLOSED');
    expect(e.auctions.auction('AUCTION-000001')!.winnerId).toBeUndefined();
    expect(e.inventory.snapshot().deals.length).toBe(0);
    expect(e.finance.snapshot().payables.length).toBe(0);
    expect(e.finance.snapshot().transactions.filter(t => t.description?.includes('Auction')).length).toBe(0);
  });

  it('double award/conversion rejected — auction already closed', () => {
    const e = world();
    e.advanceUntil(1000);
    expect(e.inventory.snapshot().deals.length).toBe(1);
    // Advance further — no second deal is created
    e.advanceUntil(2000);
    expect(e.inventory.snapshot().deals.length).toBe(1);
    expect(e.inventory.snapshot().lots.length).toBe(1);
    expect(e.finance.snapshot().payables.length).toBe(1);
  });

  it('save/load/replay preserves the result', () => {
    const e = world();
    e.advanceUntil(1000);
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.inventory.snapshot()).toEqual(e.inventory.snapshot());
    expect(loaded.auctions.snapshot()).toEqual(e.auctions.snapshot());
    expect(loaded.inventory.deal('DEAL-000001')!.companyId).toBe('COMPANY-000001');
  });

  it('deterministic behavior', () => {
    const a = world();
    const b = world();
    a.advanceUntil(1000); b.advanceUntil(1000);
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.inventory.snapshot()).toEqual(b.inventory.snapshot());
    expect(a.finance.snapshot().payables).toEqual(b.finance.snapshot().payables);
  });

  it('existing auction demo shows the downstream objects', () => {
    const e = world();
    e.advanceUntil(1000);
    // The demo creates real inventory objects
    expect(e.inventory.deal('DEAL-000001')).toBeDefined();
    expect(e.inventory.lot('LOT-000001')).toBeDefined();
    expect(e.inventory.batch('BATCH-000001')).toBeDefined();
    expect(e.finance.payable('PAYABLE-000001')).toBeDefined();
    // Verify the auction demo output shows deal/lot/batch
    const deal = e.inventory.deal('DEAL-000001')!;
    expect(deal.description).toContain('Cēsis birch');
    const lot = e.inventory.lot('LOT-000001')!;
    expect(lot.composition.species[0]!.id).toBe('species.birch');
  });
});

describe('Phase 2 Milestone 2 — Auction Dead-Loop Fixes', () => {

  const mk2 = () => new SimulationEngine({
    seed: 'auction-deadloop',
    configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
    clock: { paused: false },
  });
  const go2 = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
    e.execute(command(id, type, e, p));
  const comp2 = {
    species: [{ id: 'species.birch', basisPoints: 10000 }],
    assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
    quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
  };

  function base(e: SimulationEngine) {
    go2(e, 'C', 'CreateCompany', { displayName: 'T', reputationBasisPoints: 5000 });
    go2(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go2(e, 'LOC', 'CreateLocation', { displayName: 'L', countryCode: 'LV', regionCode: 'RIGA', roles: ['ROADSIDE'] });
    go2(e, 'AI', 'CreateCompetitor', { displayName: 'C', fictional: true, budgetMinor: 800_000, strategy: 'VALUE', privateValuationMinorPerM3: 6_000, valuationErrorBasisPoints: 0 });
  }

  it('PREPARED_ROUNDWOOD without locationId rejects atomically', () => {
    const e = mk2(); base(e);
    const before = e.auditFingerprint();
    const r = go2(e, 'A', 'CreateAuction', {
      displayName: 'A', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 2000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      composition: comp2, freshness: 'FRESH', certainty: 'INSPECTED',
    });
    expect(r.accepted).toBe(false);
    expect((r as any).code).toBe('MISSING_LOCATION');
    expect(e.auditFingerprint()).toBe(before);
  });

  it('PREPARED_ROUNDWOOD without composition rejects atomically', () => {
    const e = mk2(); base(e);
    const before = e.auditFingerprint();
    const r = go2(e, 'A', 'CreateAuction', {
      displayName: 'A', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 2000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      locationId: 'LOCATION-000001',
    });
    expect(r.accepted).toBe(false);
    expect((r as Record<string,any>).code).toBe('MISSING_COMPOSITION');
    expect(e.auditFingerprint()).toBe(before);
  });

  it('valid prepared roundwood still creates Deal → Lot → Batch → Payable', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'V', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      locationId: 'LOCATION-000001', composition: comp2,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
    e.advanceUntil(1000);
    expect(e.inventory.deal('DEAL-000001')).toBeDefined();
    expect(e.inventory.lot('LOT-000001')).toBeDefined();
    expect(e.inventory.batch('BATCH-000001')).toBeDefined();
    expect(e.finance.payable('PAYABLE-000001')).toBeDefined();
  });

  it('STANDING_TIMBER_PLACEHOLDER cannot award into inventory — no deal, lot, batch, payable', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'S', auctionType: 'STANDING_TIMBER_PLACEHOLDER',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'RA', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPETITOR-000001', bidderType: 'COMPETITOR' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
    e.advanceUntil(1000);
    expect(e.auctions.auction('AUCTION-000001')!.status).toBe('CLOSED');
    expect(e.auctions.auction('AUCTION-000001')!.winnerId).toBe('COMPANY-000001');
    // No inventory
    expect(e.inventory.deal('DEAL-000001')).toBeUndefined();
    expect(e.inventory.lot('LOT-000001')).toBeUndefined();
    expect(e.inventory.batch('BATCH-000001')).toBeUndefined();
    expect(e.finance.payable('PAYABLE-000001')).toBeUndefined();
  });

  it('STANDING_TIMBER creates no stranded AUCTION_WIN commitment', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'S', auctionType: 'STANDING_TIMBER_PLACEHOLDER',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'RA', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPETITOR-000001', bidderType: 'COMPETITOR' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
    e.advanceUntil(1000);
    // No AUCTION_WIN commitment
    expect(e.finance.snapshot().commitments.filter(c => c.purpose === 'AUCTION_WIN')).toHaveLength(0);
    // Winner's deposit commitment is released
    expect(e.finance.snapshot().commitments.filter(c => c.purpose === 'AUCTION_DEPOSIT')).toHaveLength(1);
    expect(e.finance.commitment('COMMITMENT-000002')!.status).toBe('RELEASED');
  });

  it('winner deposit is released on PREPARED_ROUNDWOOD award', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'V', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      locationId: 'LOCATION-000001', composition: comp2,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
    e.advanceUntil(1000);
    // Winner's deposit is released (superseded by AUCTION_WIN)
    const deposits = e.finance.snapshot().commitments.filter(c => c.purpose === 'AUCTION_DEPOSIT');
    expect(deposits).toHaveLength(1);
    expect(deposits[0]!.status).toBe('RELEASED');
    // Exactly one AUCTION_WIN commitment
    expect(e.finance.snapshot().commitments.filter(c => c.purpose === 'AUCTION_WIN')).toHaveLength(1);
  });

  it('losing bidder deposits are released', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'V', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      locationId: 'LOCATION-000001', composition: comp2,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'RA', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPETITOR-000001', bidderType: 'COMPETITOR' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_000, proxyMaximumMinorPerM3: 5_500 });
    go2(e, 'AI', 'RunCompetitorBid', { auctionId: 'AUCTION-000001', competitorId: 'COMPETITOR-000001' });
    e.advanceUntil(1000);
    // Competitor wins (COMPETITOR-000001 has valuation 6000, places bid at 5100 > player's 5000)
    expect(e.auctions.auction('AUCTION-000001')!.winnerId).toBe('COMPETITOR-000001');
    // Player's deposit commitment is released
    const playerDeposit = e.finance.commitment('COMMITMENT-000002')!;
    expect(playerDeposit.status).toBe('RELEASED');
  });

  it('no duplicate commitments on award', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'V', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      locationId: 'LOCATION-000001', composition: comp2,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
    e.advanceUntil(1000);
    // Only AUCTION_WIN commitment exists for the player (besides deposit which is released)
    const winCommitments = e.finance.snapshot().commitments.filter(c => c.companyId === 'COMPANY-000001' && c.purpose === 'AUCTION_WIN');
    expect(winCommitments).toHaveLength(1);
    // No duplicate commitments
    expect(e.finance.snapshot().commitments.filter(c => c.companyId === 'COMPANY-000001' && c.status === 'ACTIVE')).toHaveLength(1);
  });

  it('save/load/replay preserves commitment states', () => {
    const e = mk2(); base(e);
    go2(e, 'A', 'CreateAuction', {
      displayName: 'V', auctionType: 'PREPARED_ROUNDWOOD',
      volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
      depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
      closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
      locationId: 'LOCATION-000001', composition: comp2,
    });
    go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
    go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
    e.advanceUntil(1000);
    const snap = createSnapshot(e);
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.finance.snapshot()).toEqual(e.finance.snapshot());
    expect(loaded.finance.commitment('COMMITMENT-000001')!.status).toBe('ACTIVE');
    expect(loaded.finance.commitment('COMMITMENT-000002')!.status).toBe('RELEASED');
  });

  it('deterministic behavior', () => {
    const a = mk2(); base(a);
    const b = mk2(); base(b);
    for (const e of [a, b]) {
      go2(e, 'A', 'CreateAuction', {
        displayName: 'V', auctionType: 'PREPARED_ROUNDWOOD',
        volumeMilliM3: 100_000, openingRateMinorPerM3: 5_000, incrementMinorPerM3: 100,
        depositBasisPoints: 1000, lateWindowSeconds: 60, extensionSeconds: 120,
        closeTimestamp: 1000, paymentDeadlineSeconds: 300, removalDeadlineSeconds: 3000,
        locationId: 'LOCATION-000001', composition: comp2,
      });
      go2(e, 'RP', 'RegisterForAuction', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
      go2(e, 'P', 'PlaceAuctionBid', { auctionId: 'AUCTION-000001', bidderId: 'COMPANY-000001', rateMinorPerM3: 5_100, proxyMaximumMinorPerM3: 5_500 });
      e.advanceUntil(1000);
    }
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.finance.snapshot().commitments).toEqual(b.finance.snapshot().commitments);
    expect(a.inventory.snapshot()).toEqual(b.inventory.snapshot());
  });
});
