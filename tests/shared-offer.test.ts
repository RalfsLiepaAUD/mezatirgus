import { describe, expect, it } from 'vitest';
import { SimulationEngine, command } from '../src/core/engine.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';
import { offerView } from '../src/supplier/read-models.js';
import { publicOffers, setupAutonomousScheduler } from '../src/scheduler/commands.js';

const comp = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.pulpwood', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

function base(seed = 'shared-offer'): SimulationEngine {
  const e = new SimulationEngine({
    seed, configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
    clock: { paused: false },
  });
  const go = (id: string, type: string, p: any = {}) => e.execute(command(id, type, e, p));
  // Player company
  go('C1', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go('CASH1', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 3_000_000 });
  // Competitor company
  go('C2', 'CreateCompany', { displayName: 'Ziemeļu Koks', reputationBasisPoints: 5000 });
  go('CASH2', 'CreateOpeningBalance', { companyId: 'COMPANY-000002', amountMinor: 10_000_000 });
  // Locations
  go('LOC1', 'CreateLocation', { displayName: 'Cēsis roadside', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
  // One shared supplier — relationships created separately for each company
  go('SUP', 'CreateSupplier', {
    configId: 'supplier.liepa_owner', displayName: 'Liepa Forest', fictional: true,
    archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'],
    suppliedAssortmentIds: ['assortment.pulpwood'], paymentExpectationSeconds: 7200,
    documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000,
    initialRelationshipBasisPoints: 5000,
  });
  go('CONT', 'CreateSupplierContact', {
    supplierId: 'SUPPLIER-000001', displayName: 'Jānis Bērziņš', role: 'OWNER',
  });
  return e;
}

/** Create open shared offer and validate documents */
function createSharedOffer(e: SimulationEngine, expiry = 100000) {
  const go = (id: string, type: string, p: any = {}) => e.execute(command(id, type, e, p));
  go('O', 'CreateOffer', {
    supplierId: 'SUPPLIER-000001', contactId: 'CONTACT-000001',
    locationId: 'LOCATION-000001', expiryTimestamp: expiry,
    volumeBasis: 'AGREED_VOLUME', offeredVolumeMilliM3: 30_000,
    baseRateMinorPerM3: 5_000,
    requiredDocumentTypes: ['DELIVERY_NOTE'],
    beliefVolumeMinMilliM3: 25_000, beliefVolumeMaxMilliM3: 35_000,
    initialBeliefConfidenceBasisPoints: 1500,
    actualVolumeMilliM3: 31_234, actualFreshness: 'FRESH',
    truthComposition: comp,
  });
  go('DOC', 'AddDocument', {
    documentSetId: 'DOCSET-000001', documentType: 'DELIVERY_NOTE',
    issuer: 'Supplier', reference: 'REF-001', validFromTimestamp: 0, validUntilTimestamp: expiry,
  });
  go('VAL', 'ValidateDocumentSet', { documentSetId: 'DOCSET-000001' });
}

describe('Phase 2 Milestone 1 — Shared Market Offers', () => {

  it('one supplier offer is visible to both player and competitor via publicOffers', () => {
    const e = base('shared-visible');
    createSharedOffer(e);
    const playerView = publicOffers(e, 'COMPANY-000001');
    const compView = publicOffers(e, 'COMPANY-000002');
    expect(playerView.length).toBe(1);
    expect(compView.length).toBe(1);
    expect(playerView[0]!.id).toBe(compView[0]!.id);
  });

  it('both views reference the same canonical offer ID', () => {
    const e = base('shared-id');
    createSharedOffer(e);
    const player = publicOffers(e, 'COMPANY-000001')[0]!;
    const comp = publicOffers(e, 'COMPANY-000002')[0]!;
    expect(player.id).toBe('OFFER-000001');
    expect(comp.id).toBe('OFFER-000001');
  });

  it('competitor accepts first and player acceptance then fails atomically', () => {
    const e = base('comp-wins');
    createSharedOffer(e);
    // Competitor accepts first
    const compResult = e.execute(command('COMP_ACCEPT', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000002',
    }));
    expect(compResult.accepted).toBe(true);
    expect(e.suppliers.offer('OFFER-000001')!.status).toBe('ACCEPTED');
    expect(e.suppliers.offer('OFFER-000001')!.acceptedByCompanyId).toBe('COMPANY-000002');
    // Player acceptance fails atomically — offer is already closed
    const before = e.auditFingerprint();
    const playerResult = e.execute(command('PLAYER_ACCEPT', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000001',
    }));
    expect(playerResult.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('player accepts first and competitor acceptance then fails atomically', () => {
    const e = base('player-wins');
    createSharedOffer(e);
    // Player accepts first
    const playerResult = e.execute(command('PLAYER_ACCEPT', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000001',
    }));
    expect(playerResult.accepted).toBe(true);
    expect(e.suppliers.offer('OFFER-000001')!.status).toBe('ACCEPTED');
    expect(e.suppliers.offer('OFFER-000001')!.acceptedByCompanyId).toBe('COMPANY-000001');
    // Competitor acceptance fails atomically
    const before = e.auditFingerprint();
    const compResult = e.execute(command('COMP_ACCEPT', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000002',
    }));
    expect(compResult.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('first acceptance creates exactly one commitment/payable/deal; second fails', () => {
    const e = base('single-creation');
    createSharedOffer(e);
    // Player accepts
    const r1 = e.execute(command('A1', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000001',
    }));
    expect(r1.accepted).toBe(true);
    // Verify exactly one of each was created
    expect(e.inventory.snapshot().deals).toHaveLength(1);
    expect(e.inventory.snapshot().lots).toHaveLength(1);
    expect(e.inventory.snapshot().batches).toHaveLength(1);
    expect(e.finance.snapshot().commitments).toHaveLength(1);
    expect(e.finance.snapshot().payables).toHaveLength(1);
    // Second accept (competitor) fails
    const before = e.auditFingerprint();
    const r2 = e.execute(command('A2', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000002',
    }));
    expect(r2.accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
    // Still exactly one of each
    expect(e.inventory.snapshot().deals).toHaveLength(1);
    expect(e.finance.snapshot().payables).toHaveLength(1);
  });

  it('no timber volume or finance duplication after single acceptance', () => {
    const e = base('no-dupe');
    createSharedOffer(e);
    e.execute(command('A', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000001',
    }));
    const inv = e.inventory.snapshot();
    const fin = e.finance.snapshot();
    // Single lot, batch, deal
    expect(inv.lots).toHaveLength(1);
    expect(inv.batches).toHaveLength(1);
    expect(inv.deals).toHaveLength(1);
    // Total timber volume from all lots matches offer volume
    const totalVolume = inv.lots.reduce((n, l) => n + l.originalVolumeMilliM3, 0);
    expect(totalVolume).toBe(30_000);
    // Single commitment and payable
    expect(fin.commitments).toHaveLength(1);
    expect(fin.payables).toHaveLength(1);
    // The created asset belongs to the accepting company
    expect(inv.deals[0]!.companyId).toBe('COMPANY-000001');
    expect(inv.lots[0]!.ownerCompanyId).toBe('COMPANY-000001');
    expect(fin.commitments[0]!.companyId).toBe('COMPANY-000001');
  });

  it('company-specific relationship states remain isolated', () => {
    const e = base('rel-isolation');
    // Player has relationship with warmth=5000 from setup
    // Competitor doesn't have one initially
    const relPlayer = e.suppliers.snapshot().relationships
      .find(r => r.supplierId === 'SUPPLIER-000001' && r.companyId === 'COMPANY-000001')!;
    expect(relPlayer.warmthBasisPoints).toBe(5000);
    // Verify competitor has no relationship by default
    const relComp = e.suppliers.snapshot().relationships
      .find(r => r.supplierId === 'SUPPLIER-000001' && r.companyId === 'COMPANY-000002');
    expect(relComp).toBeUndefined();
    // Both can still see the shared offer — effective rates differ
    createSharedOffer(e);
    const playerEff = publicOffers(e, 'COMPANY-000001')[0]!.effectiveRateMinorPerM3;
    const compEff = publicOffers(e, 'COMPANY-000002')[0]!.effectiveRateMinorPerM3;
    // Kompānijai-2 nav attiecību, tāpēc tā saņem bāzes likmi (bez atlaides)
    // Player has warmth=5000 so adjustment = 5 => effective = 5000-5 = 4995
    expect(playerEff).toBe(4995);
    // Competitor has no relationship so adjustment = 0 => effective = 5000
    expect(compEff).toBe(5000);
    expect(playerEff).toBeLessThan(compEff);
  });

  it('public views expose no hidden truth and no private relationship state', () => {
    const e = base('no-leak');
    createSharedOffer(e);
    const playerPub = publicOffers(e, 'COMPANY-000001');
    const compPub = publicOffers(e, 'COMPANY-000002');
    for (const view of [...playerPub, ...compPub]) {
      expect((view as any).truth).toBeUndefined();
      expect((view as any).belief).toBeUndefined();
      expect((view as any).companyId).toBeUndefined();
      expect((view as any).warmthBasisPoints).toBeUndefined();
      expect((view as any).trustBasisPoints).toBeUndefined();
    }
    // offerView also strips truth and hidden fields
    const pv = offerView(e, 'OFFER-000001', 'COMPANY-000001');
    expect((pv as any).truth).toBeUndefined();
    expect((pv as any).acceptedByCompanyId).toBeUndefined();
  });

  it('save/load/replay preserves shared closed state', () => {
    const e = base('save-replay');
    createSharedOffer(e);
    const snap = createSnapshot(e);
    // Player accepts, closing the shared offer
    e.execute(command('A', 'AcceptOffer', e, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000001',
    }));
    expect(e.suppliers.offer('OFFER-000001')!.status).toBe('ACCEPTED');
    expect(e.suppliers.offer('OFFER-000001')!.acceptedByCompanyId).toBe('COMPANY-000001');
    // Save and reload
    const save = createSave(e, snap);
    const loaded = loadSave(save);
    // State matches
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.suppliers.snapshot()).toEqual(e.suppliers.snapshot());
    // The closed state is preserved — no one else can accept it
    const replayResult = loaded.execute(command('RE_ACCEPT', 'AcceptOffer', loaded, {
      offerId: 'OFFER-000001', companyId: 'COMPANY-000002',
    }));
    expect(replayResult.accepted).toBe(false);
    // IDs continue correctly
    expect(loaded.ids.next('offer', 'OFFER')).toBe('OFFER-000002');
  });

  it('scheduler still produces intended offer cadence (one per supplier per cycle)', () => {
    const e = base('cadence');
    // Need routing and market for scheduler to work
    const go = (id: string, type: string, p: any = {}) => e.execute(command(id, type, e, p));
    go('LOC_B', 'CreateLocation', { displayName: 'Buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
    go('LOC_Y', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
    go('LOC_P', 'CreateLocation', { displayName: 'Port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
    go('R1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000002', toLocationId: 'LOCATION-000003', accessClass: 'GRAVEL', distanceMetres: 80_000, travelSeconds: 7200, directed: true });
    go('SUP2', 'CreateSupplier', {
      configId: 'supplier.ozols_crew', displayName: 'Ozols Crew', fictional: true,
      archetype: 'SMALL_HARVESTING_CREW', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002',
      channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'],
      suppliedAssortmentIds: ['assortment.sawlogs'], paymentExpectationSeconds: 7200,
      documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000,
      initialRelationshipBasisPoints: 5000,
    });
    go('CONT2', 'CreateSupplierContact', { supplierId: 'SUPPLIER-000002', displayName: 'Contact', role: 'OWNER' });
    go('MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'Demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });
    setupAutonomousScheduler(e);
    e.advanceFixedTicks(13); // First supply cycle at tick 12
    const offers = e.suppliers.snapshot().offers;
    // Should be 2 offers (one per supplier) — no companyId scoping
    expect(offers.length).toBe(2);
    // Both offers should be visible to both companies
    const playerView = publicOffers(e, 'COMPANY-000001');
    const compView = publicOffers(e, 'COMPANY-000002');
    expect(playerView.length).toBe(2);
    expect(compView.length).toBe(2);
    // They should reference the same offer IDs
    expect(playerView.map(o => o.id).sort()).toEqual(compView.map(o => o.id).sort());
  });

  it('scheduler cadence determinism preserved with shared offers', () => {
    const setup = (e: SimulationEngine) => {
      const go = (id: string, type: string, p: any = {}) => e.execute(command(id, type, e, p));
      go('LOC_B', 'CreateLocation', { displayName: 'Buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
      go('LOC_Y', 'CreateLocation', { displayName: 'Yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
      go('LOC_P', 'CreateLocation', { displayName: 'Port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
      go('R1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000002', toLocationId: 'LOCATION-000003', accessClass: 'GRAVEL', distanceMetres: 80_000, travelSeconds: 7200, directed: true });
      go('MKT', 'CreateMarket', {
        regime: 'NORMAL', season: 'SUMMER',
        drivers: [{ displayName: 'Demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
      });
    };
    const a = base('cadence-det');
    const b = base('cadence-det');
    setup(a); setup(b);
    setupAutonomousScheduler(a); setupAutonomousScheduler(b);
    a.advanceFixedTicks(48); b.advanceFixedTicks(48);
    // Same seed → same offer set (determinism preserved)
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.suppliers.snapshot().offers).toEqual(b.suppliers.snapshot().offers);
    // Offers are shared (no companyId on them)
    for (const offer of a.suppliers.snapshot().offers) {
      expect((offer as any).companyId).toBeUndefined();
    }
  });
});
