// Step 15 canonical golden scenario — deterministic connected run.
// See docs/design/STEP15_CANONICAL_SCENARIO.md (v3).
//
// Design principle (from the v3 source-audit corrections): every "hard assertion"
// is a FORMULA or CONSERVATION check recomputed test-side from actual event payloads
// and read-models — never a hard-coded euro figure that the engine cannot produce
// exactly. Fixture magnitudes follow the doc where the engine allows exact control
// (buyer principal = acceptedVolume × rate) and are asserted against actual state
// elsewhere (harvest realized volume is floor(removed × recovery/10000)).

import { SimulationEngine, command } from '../core/engine.js';
import type { DomainEvent } from '../core/events.js';

const DAY = 86_400;

export interface Step15Trace {
  ids: Record<string, string>;
  // event ids captured for causal-pair proofs (Phase E)
  events: Record<string, string>;
  // numeric checkpoints captured during the run
  values: Record<string, number>;
  // per-phase captured detail
  phaseA: {
    offerIds: string[];
    playerVisibleOfferIds: string[];
    compVisibleOfferIds: string[];
    lateAcceptRejected: boolean;
    lateAcceptCode?: string;
    auditUnchangedOnLateAccept: boolean;
    playerBatchId: string;
    compBatchId: string;
    compCashAfterSettlement: number;
    autonomousPipelineOfferCount: number;
  };
}

let cmdSeq = 0;
function go(e: SimulationEngine, type: string, payload: Record<string, unknown> = {}) {
  const r = e.execute(command(`s15-${++cmdSeq}`, type, e, payload));
  if (!r.accepted) throw new Error(`${type} rejected: ${(r as any).message} (${(r as any).code})`);
  return r;
}
function tryGo(e: SimulationEngine, type: string, payload: Record<string, unknown> = {}) {
  return e.execute(command(`s15-${++cmdSeq}`, type, e, payload));
}
function eventsOfType(e: SimulationEngine, type: string): DomainEvent[] {
  return e.eventLog.all().filter(x => x.eventType === type);
}

// ── Fixture identifiers by displayName → resolve to canonical IDs after creation ──
function locId(e: SimulationEngine, displayName: string): string {
  const l = e.routing.snapshot().locations.find(x => x.displayName === displayName);
  if (!l) throw new Error(`location not found: ${displayName}`);
  return l.id;
}

const BIRCH = 'species.birch';
const SPRUCE = 'species.spruce';
// v3 conceptual assortment cards → canonical assortment ids (validateComposition allow-list).
// ASSORT_V_18_25 → veneer_logs (€100), ASSORT_V_26P → sawlogs (€110), ASSORT_THIN → pulpwood (€70).
const A_V1825 = 'assortment.veneer_logs';
const A_V26P = 'assortment.sawlogs';
const A_THIN = 'assortment.pulpwood';

// composition helper (basis points must sum to 10000 per axis)
type Comp = {
  species: Array<{ id: string; basisPoints: number }>;
  assortment: Array<{ id: string; basisPoints: number }>;
  quality: Array<{ id: string; basisPoints: number }>;
};

export function createStep15Engine(seed = 'step15-golden'): SimulationEngine {
  return new SimulationEngine({
    seed, configurationBundleVersion: '1', configurationHash: 'step15-v3',
    scenarioId: 'step15_canonical', clock: { paused: false },
  });
}

// Build the deterministic world: companies, locations, routes.
function buildWorld(e: SimulationEngine) {
  // Companies
  go(e, 'CreateCompany', { displayName: 'PLAYER Mežtirgus SIA', reputationBasisPoints: 5000 }); // COMPANY-000001
  go(e, 'CreateCompany', { displayName: 'COMP_1 Rival SIA', reputationBasisPoints: 5000 });      // COMPANY-000002
  go(e, 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 4_000_000 });
  go(e, 'CreateOpeningBalance', { companyId: 'COMPANY-000002', amountMinor: 2_000_000 });

  // Locations
  const mk = (name: string, roles: string[], region = 'VIDZEME', country = 'LV') =>
    go(e, 'CreateLocation', { displayName: name, countryCode: country, regionCode: region, roles });
  mk('FOREST_1', ['ROADSIDE']);
  mk('RS_A', ['ROADSIDE']);
  mk('RS_B', ['ROADSIDE']);
  mk('AUC_SITE_1', ['ROADSIDE']);
  mk('YARD_1', ['YARD']);
  mk('MILL_D1', ['BUYER']);
  mk('PORT_1', ['PORT'], 'RIGA');
  mk('EXPORT_DEST', ['PORT'], 'NL', 'NL');

  const L = (n: string) => locId(e, n);
  const edge = (from: string, to: string, accessClass: string, dist: number, secs: number) =>
    go(e, 'CreateRouteEdge', { fromLocationId: L(from), toLocationId: L(to), accessClass, distanceMetres: dist, travelSeconds: secs, directed: true });
  // bidirectional links (create both directions explicitly)
  const link = (a: string, b: string, accessClass: string, dist: number, secs: number) => {
    edge(a, b, accessClass, dist, secs); edge(b, a, accessClass, dist, secs);
  };
  link('FOREST_1', 'RS_A', 'GRAVEL', 20_000, 3_600);
  link('RS_A', 'MILL_D1', 'PAVED', 100_000, 5_400);
  link('RS_A', 'PORT_1', 'PAVED', 120_000, 6_000);
  link('RS_B', 'MILL_D1', 'PAVED', 110_000, 5_600);
  link('AUC_SITE_1', 'YARD_1', 'PAVED', 40_000, 3_000);
  link('YARD_1', 'MILL_D1', 'PAVED', 60_000, 3_600);
  link('YARD_1', 'PORT_1', 'PAVED', 90_000, 5_000);
  edge('PORT_1', 'EXPORT_DEST', 'SEA', 1_500_000, 172_800);
}

// ── Phase A: shared finite procurement through the real offer pipeline ──
function phaseA(e: SimulationEngine, trace: Step15Trace) {
  const L = (n: string) => locId(e, n);
  // Two suppliers, each with a relationship to the accepting company.
  go(e, 'CreateSupplier', {
    configId: 'supplier.liepa_owner', fictional: true, locationId: L('RS_A'), companyId: 'COMPANY-000001',
    displayName: 'SUPPLIER_S1', archetype: 'PRIVATE_FOREST_OWNER', channels: ['PHONE'],
    suppliedSpeciesIds: [BIRCH], suppliedAssortmentIds: [A_V1825], paymentExpectationSeconds: 86_400,
    documentReliabilityBasisPoints: 9000, freshnessAnswerReliabilityBasisPoints: 9000, initialRelationshipBasisPoints: 0,
  }); // SUPPLIER-000001
  go(e, 'CreateSupplierContact', { supplierId: 'SUPPLIER-000001', displayName: 'S1 Contact', role: 'OWNER' }); // CONTACT-000001
  go(e, 'CreateSupplier', {
    configId: 'supplier.ozols_crew', fictional: true, locationId: L('RS_B'), companyId: 'COMPANY-000002',
    displayName: 'SUPPLIER_S2', archetype: 'SMALL_HARVESTING_CREW', channels: ['PHONE'],
    suppliedSpeciesIds: [BIRCH], suppliedAssortmentIds: [A_V1825], paymentExpectationSeconds: 86_400,
    documentReliabilityBasisPoints: 9000, freshnessAnswerReliabilityBasisPoints: 9000, initialRelationshipBasisPoints: 0,
  }); // SUPPLIER-000002
  go(e, 'CreateSupplierContact', { supplierId: 'SUPPLIER-000002', displayName: 'S2 Contact', role: 'CREW_LEAD' }); // CONTACT-000002

  // P1 truth: 40.000 m³ ASSORT_V_18_25 birch, 500bp brāķis (=2.000 m³ reject at gate).
  const p1Comp: Comp = {
    species: [{ id: BIRCH, basisPoints: 10000 }],
    assortment: [{ id: A_V1825, basisPoints: 10000 }],
    quality: [{ id: 'quality.birch.b', basisPoints: 9500 }, { id: 'quality.birch.brakis', basisPoints: 500 }],
  };
  const p2Comp: Comp = {
    species: [{ id: BIRCH, basisPoints: 10000 }],
    assortment: [{ id: A_V1825, basisPoints: 10000 }],
    quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
  };
  const offer = (supplierId: string, contactId: string, loc: string, comp: Comp, vol: number, rate: number) => {
    go(e, 'CreateOffer', {
      supplierId, contactId, locationId: L(loc), expiryTimestamp: 5_000_000,
      volumeBasis: 'AGREED_VOLUME', offeredVolumeMilliM3: vol, baseRateMinorPerM3: rate,
      requiredDocumentTypes: ['DELIVERY_NOTE'],
      beliefVolumeMinMilliM3: vol, beliefVolumeMaxMilliM3: vol, initialBeliefConfidenceBasisPoints: 5000,
      actualVolumeMilliM3: vol, actualFreshness: 'FRESH', truthComposition: comp,
    });
    const offerId = e.suppliers.snapshot().offers.at(-1)!.id;
    const setId = e.suppliers.snapshot().offers.at(-1)!.documentSetId;
    go(e, 'AddDocument', { documentSetId: setId, documentType: 'DELIVERY_NOTE', issuer: 'S', reference: 'DN-' + offerId, validFromTimestamp: 0, validUntilTimestamp: 5_000_000 });
    go(e, 'ValidateDocumentSet', { documentSetId: setId });
    return offerId;
  };
  const p1 = offer('SUPPLIER-000001', 'CONTACT-000001', 'RS_A', p1Comp, 40_000, 5_000); // OFFER-000001
  const p2 = offer('SUPPLIER-000002', 'CONTACT-000002', 'RS_B', p2Comp, 30_000, 5_000); // OFFER-000002
  trace.phaseA.offerIds = [p1, p2];
  trace.ids.p1Offer = p1; trace.ids.p2Offer = p2;

  // Shared visibility (both companies see both offers via publicOffers) is asserted in the test.

  // PLAYER accepts P1; COMP_1 accepts P2.
  go(e, 'AcceptOffer', { offerId: p1, companyId: 'COMPANY-000001' });
  const playerBatch = e.inventory.snapshot().batches.at(-1)!.id;
  go(e, 'AcceptOffer', { offerId: p2, companyId: 'COMPANY-000002' });
  const compBatch = e.inventory.snapshot().batches.at(-1)!.id;
  trace.phaseA.playerBatchId = playerBatch;
  trace.phaseA.compBatchId = compBatch;
  trace.ids.b1 = playerBatch;

  // Negative: PLAYER attempts to accept the already-taken P2 → atomic reject.
  const fpBefore = e.auditFingerprint();
  const late = tryGo(e, 'AcceptOffer', { offerId: p2, companyId: 'COMPANY-000001' });
  trace.phaseA.lateAcceptRejected = !late.accepted;
  trace.phaseA.lateAcceptCode = (late as any).code;
  trace.phaseA.auditUnchangedOnLateAccept = e.auditFingerprint() === fpBefore;

  // COMP_1 settles P2 payable from its own cash (finite real ledger).
  const compPayable = e.finance.snapshot().payables.find(p => p.companyId === 'COMPANY-000002' && p.status !== 'PAID');
  if (compPayable) go(e, 'RecordPayablePayment', { payableId: compPayable.id, amountMinor: compPayable.principalMinor });
  trace.phaseA.compCashAfterSettlement = e.finance.balanceByCode('COMPANY-000002', 'OPERATING_CASH');

  // PLAYER settles P1 payable (its acquisition cost basis for P&L).
  const p1Payable = e.finance.snapshot().payables.find(p => p.companyId === 'COMPANY-000001' && p.status !== 'PAID');
  if (p1Payable) {
    go(e, 'RecordPayablePayment', { payableId: p1Payable.id, amountMinor: p1Payable.principalMinor });
    trace.values.p1AcquisitionCostMinor = p1Payable.principalMinor;
  }

}

// ── Phase B: prepared-roundwood auction + standing-timber harvest ──
function phaseB(e: SimulationEngine, trace: Step15Trace) {
  const L = (n: string) => locId(e, n);
  const auctionClose = 4 * DAY;

  // Prepared roundwood auction for LOT_1 (58.000 m³ birch).
  go(e, 'CreateAuction', {
    displayName: 'LOT_1 prepared roundwood', auctionType: 'PREPARED_ROUNDWOOD',
    volumeMilliM3: 58_000, openingRateMinorPerM3: 8_000, incrementMinorPerM3: 100,
    depositBasisPoints: 500, lateWindowSeconds: 0, extensionSeconds: 0,
    closeTimestamp: auctionClose, paymentDeadlineSeconds: 10 * DAY, removalDeadlineSeconds: 20 * DAY,
    locationId: L('AUC_SITE_1'),
    composition: {
      species: [{ id: BIRCH, basisPoints: 10000 }],
      assortment: [{ id: A_V1825, basisPoints: 10000 }],
      quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
    },
    freshness: 'FRESH', certainty: 'ESTIMATED',
  });
  const auctionId = e.auctions.snapshot().auctions.at(-1)!.id;
  trace.ids.auction = auctionId;

  go(e, 'RegisterForAuction', { auctionId, bidderId: 'COMPANY-000001', bidderType: 'COMPANY' });
  go(e, 'RegisterForAuction', { auctionId, bidderId: 'COMPANY-000002', bidderType: 'COMPANY' });

  // COMP_1 scripted ladder (real-ledger COMPANY bidder) up to 8,500.
  go(e, 'PlaceAuctionBid', { auctionId, bidderId: 'COMPANY-000002', rateMinorPerM3: 8_000, proxyMaximumMinorPerM3: 8_500 });
  go(e, 'PlaceAuctionBid', { auctionId, bidderId: 'COMPANY-000002', rateMinorPerM3: 8_500, proxyMaximumMinorPerM3: 8_500 });
  // COMP_1 affordability gate: a bid beyond its cash is rejected atomically.
  const overCash = tryGo(e, 'PlaceAuctionBid', { auctionId, bidderId: 'COMPANY-000002', rateMinorPerM3: 40_000, proxyMaximumMinorPerM3: 40_000 });
  trace.values.compOverCashRejected = overCash.accepted ? 0 : 1;
  // PLAYER wins with 8,600.
  go(e, 'PlaceAuctionBid', { auctionId, bidderId: 'COMPANY-000001', rateMinorPerM3: 8_600, proxyMaximumMinorPerM3: 8_600 });

  // Standing timber: forest fixture, harvest right, plan, start (completion scheduled).
  go(e, 'CreateForest', {
    fictional: true, ownerCompanyId: 'COMPANY-000001', configId: 'forest.stand_1', displayName: 'STAND_1',
    forestLocationId: L('FOREST_1'), roadsideLocationId: L('RS_A'), permitState: 'NOT_REQUIRED',
    truthStandingVolumeMilliM3: 120_000, baseRecoveryBasisPoints: 8_500, recoveryUncertaintyBasisPoints: 0,
    estimatedVolumeMinMilliM3: 100_000, estimatedVolumeMaxMilliM3: 130_000, initialConfidenceBasisPoints: 6000,
    truthComposition: {
      species: [{ id: BIRCH, basisPoints: 6000 }, { id: SPRUCE, basisPoints: 4000 }],
      assortment: [{ id: A_V1825, basisPoints: 5000 }, { id: A_THIN, basisPoints: 5000 }],
      quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
    },
    estimatedComposition: {
      species: [{ id: BIRCH, basisPoints: 6000 }, { id: SPRUCE, basisPoints: 4000 }],
      assortment: [{ id: A_V1825, basisPoints: 5000 }, { id: A_THIN, basisPoints: 5000 }],
      quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
    },
  });
  const forestId = e.forests.snapshot().forests.at(-1)!.id;
  trace.ids.forest = forestId;
  go(e, 'GrantHarvestRight', { forestId, holderCompanyId: 'COMPANY-000001', validFromTimestamp: 0, validUntilTimestamp: 30 * DAY });
  const rightId = e.forests.snapshot().rights.at(-1)!.id;
  go(e, 'CreateHarvestPlan', {
    forestId, harvestRightId: rightId, companyId: 'COMPANY-000001',
    requestedStandingVolumeMilliM3: 60_000, harvestCostRateMinorPerM3: 500, durationSeconds: 8 * DAY,
  });
  const planId = e.forests.snapshot().plans.at(-1)!.id;
  go(e, 'ConfirmHarvestStart', { planId });
  const job = e.forests.snapshot().jobs.at(-1)!;
  trace.ids.harvestJob = job.id;
  trace.values.harvestRemoved = job.removedStandingVolumeMilliM3;
  trace.values.harvestRealized = job.realizedRoadsideVolumeMilliM3;
  trace.values.harvestResidue = job.residueLossVolumeMilliM3;

  // Advance to auction close → settlement mints B2.
  e.advanceUntil(auctionClose);
  const close = eventsOfType(e, 'AuctionCloseDue').at(-1)!;
  trace.events.auctionClose = close.eventId;
  trace.ids.auctionWinner = String((close.payload as any).winnerId ?? '');
  trace.values.auctionWinningRate = Number((close.payload as any).winningRateMinorPerM3 ?? 0);
  const b2 = (close.payload as any).batch?.id as string | undefined;
  if (b2) { trace.ids.b2 = b2; trace.values.b2Volume = e.inventory.batch(b2)!.currentVolumeMilliM3; }

  // Advance past harvest completion to mint per-species batches at RS_A.
  const harvestCompletion = job.completionTimestamp;
  e.advanceUntil(Math.max(8 * DAY, harvestCompletion));
  const harvestBatches = e.inventory.snapshot().batches.filter(b => b.custodyActorId === 'contractor.harvest.fictional');
  trace.values.harvestBatchCount = harvestBatches.length;
  const birchBatch = harvestBatches.find(b => b.composition.species[0]!.id === BIRCH);
  const spruceBatch = harvestBatches.find(b => b.composition.species[0]!.id === SPRUCE);
  if (birchBatch) { trace.ids.b3Birch = birchBatch.id; trace.values.b3BirchVolume = birchBatch.currentVolumeMilliM3; }
  if (spruceBatch) { trace.ids.b3Spruce = spruceBatch.id; trace.values.b3SpruceVolume = spruceBatch.currentVolumeMilliM3; }
  trace.values.harvestBatchVolumeSum = harvestBatches.reduce((n, b) => n + b.currentVolumeMilliM3, 0);
}

// ── Phase C: hired + owned transport and yard sorting ──
function phaseC(e: SimulationEngine, trace: Step15Trace) {
  const L = (n: string) => locId(e, n);
  const b1 = e.inventory.batch(trace.ids.b1!)!;
  const b2 = e.inventory.batch(trace.ids.b2!)!;

  // ── Hired transport: B1 (RS_A) → MILL_D1 (load kept for Phase D L1) ──
  go(e, 'CreateCarrier', {
    fictional: true, configId: 'transport.small_trader_spot', displayName: 'CARRIER_1',
    capacityMilliM3: 60_000, baseCalloutMinor: 10_000, distanceRateMinorPerKm: 100, volumeRateMinorPerM3: 400,
    pickupDelaySeconds: 600, paymentTermsSeconds: 3_600,
    disruptionChanceBasisPoints: 0, disruptionDelaySeconds: 0, disruptionSurchargeMinor: 0,
  });
  const carrierId = e.transport.snapshot().carriers.at(-1)!.id;
  go(e, 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: b1.custodyActorId, originLocationId: L('RS_A'), destinationLocationId: L('MILL_D1') });
  const hiredLoad = e.inventory.snapshot().loads.at(-1)!.id;
  trace.ids.l1Load = hiredLoad;
  go(e, 'AllocateBatchToLoad', { batchId: b1.id, loadId: hiredLoad, volumeMilliM3: b1.currentVolumeMilliM3 });
  go(e, 'RequestCarrierQuote', { carrierId, loadId: hiredLoad, destinationLocationId: L('MILL_D1'), expiryTimestamp: 30 * DAY, urgencyBasisPoints: 0 });
  const quoteId = e.transport.snapshot().quotes.at(-1)!.id;
  go(e, 'AcceptCarrierQuote', { quoteId });
  go(e, 'CreateTransportJob', { quoteId });
  const hiredJob = e.transport.snapshot().jobs.at(-1)!.id;
  go(e, 'AllocateLoadToTransportJob', { jobId: hiredJob });
  go(e, 'ConfirmDispatch', { jobId: hiredJob });
  e.advanceUntil(e.clock.currentGameTime + 2 * DAY); // fire pickup + arrival
  go(e, 'UnloadTransportJob', { jobId: hiredJob });
  go(e, 'CompleteTransportJob', { jobId: hiredJob });
  const hiredLoadState = e.inventory.load(hiredLoad)!;
  trace.values.hiredLoadAtMill = hiredLoadState.currentLocationId === L('MILL_D1') ? 1 : 0;

  // ── Owned transport: B2 (AUC_SITE_1) → YARD_1 ──
  go(e, 'CreateYard', {
    companyId: 'COMPANY-000001', locationId: L('YARD_1'), displayName: 'YARD_1',
    totalCapacityMilliM3: 500_000, storageCostMinorPerTickPerM3: 0, sortingCostMinorPerM3: 3_000, sortingCapable: true,
  });
  const yardId = e.operations.snapshot().yards.at(-1)!.id;
  trace.ids.yard = yardId;
  go(e, 'CreateTruck', { companyId: 'COMPANY-000001', locationId: L('AUC_SITE_1'), displayName: 'TRUCK_1', capacityMilliM3: 60_000 });
  const truckId = e.operations.snapshot().trucks.at(-1)!.id;
  go(e, 'CreateDriver', { companyId: 'COMPANY-000001', displayName: 'DRIVER_1', wageMinorPerHour: 1_500 });
  const driverId = e.operations.snapshot().drivers.at(-1)!.id;
  go(e, 'AssignDriverToTruck', { driverId, truckId });
  go(e, 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: b2.custodyActorId, originLocationId: L('AUC_SITE_1'), destinationLocationId: L('YARD_1') });
  const ownedLoad = e.inventory.snapshot().loads.at(-1)!.id;
  trace.ids.b2HaulLoad = ownedLoad;
  go(e, 'AllocateBatchToLoad', { batchId: b2.id, loadId: ownedLoad, volumeMilliM3: b2.currentVolumeMilliM3 });
  const b2Alloc = e.inventory.snapshot().allocations.at(-1)!.id;
  go(e, 'CreateDispatchOrder', { companyId: 'COMPANY-000001', truckId, driverId, loadId: ownedLoad, destinationLocationId: L('YARD_1') });
  const orderId = e.operations.snapshot().dispatchOrders.at(-1)!.id;
  go(e, 'ConfirmDispatchOrder', { orderId });
  e.advanceUntil(e.clock.currentGameTime + 2 * DAY); // fire arrival
  go(e, 'UnloadDispatchOrder', { orderId });
  go(e, 'CompleteDispatchOrder', { orderId });

  // Physically site B2 at the yard for sorting (MoveBatch is the canonical batch-location command;
  // owned dispatch relocates only the load, not the underlying batch).
  go(e, 'ReleaseLoadAllocation', { allocationId: b2Alloc });
  go(e, 'MoveBatch', { batchId: b2.id, toLocationId: L('YARD_1') });

  // Negative precondition: sort a batch not at the yard (B1 is at RS_A) → reject, atomic.
  const fp = e.auditFingerprint();
  const badSort = tryGo(e, 'SortBatchAtYard', { yardId, batchId: b1.id, conductType: 'ETHICAL' });
  trace.values.nonYardSortRejected = badSort.accepted ? 0 : 1;
  trace.values.nonYardSortCode = (badSort as any).code === 'BATCH_NOT_AT_YARD' ? 1 : 0;
  trace.values.sortAuditUnchanged = e.auditFingerprint() === fp ? 1 : 0;

  // Sort B2 (58.000) → children 30.000 + 6.000 + 20.500 + loss 1.500.
  go(e, 'SetBatchRecoveryVolumes', { batchId: b2.id, volumes: [
    { label: 'A', volumeMilliM3: 30_000 },
    { label: 'B_PLUS', volumeMilliM3: 6_000 },
    { label: 'TARA_14_18', volumeMilliM3: 20_500 },
    { label: 'LOSS', volumeMilliM3: 1_500 },
  ] });
  go(e, 'SortBatchAtYard', { yardId, batchId: b2.id, conductType: 'ETHICAL' });
  const sortEv = eventsOfType(e, 'YardSortingRecorded').at(-1)!;
  const children = (sortEv.payload as any).childBatches as Array<{ id: string; sortingLabel: string; currentVolumeMilliM3: number }>;
  trace.values.sortLoss = Number((sortEv.payload as any).lossVolume);
  const c1 = children.find(c => c.sortingLabel === 'A')!;
  const c2 = children.find(c => c.sortingLabel === 'B_PLUS')!;
  const c3 = children.find(c => c.sortingLabel === 'TARA_14_18')!;
  trace.ids.c1 = c1.id; trace.ids.c2 = c2.id; trace.ids.c3 = c3.id;
  trace.values.c1Volume = c1.currentVolumeMilliM3;
  trace.values.c2Volume = c2.currentVolumeMilliM3;
  trace.values.c3Volume = c3.currentVolumeMilliM3;
  trace.values.sortChildrenPlusLoss = c1.currentVolumeMilliM3 + c2.currentVolumeMilliM3 + c3.currentVolumeMilliM3 + trace.values.sortLoss;
  trace.values.b2ParentVolumeAtSort = 58_000;

  // Cost paths differ: hired posts TRANSPORT_PLACEHOLDER; owned posts OPERATIONAL (STEP_11).
  const layers = e.inventory.snapshot().costLayers;
  trace.values.hiredCostLayerExists = layers.some(l => l.category === 'TRANSPORT_PLACEHOLDER') ? 1 : 0;
  trace.values.ownedCostLayerExists = layers.some(l => l.category === 'OPERATIONAL' && l.provenanceReference === 'STEP_11_OPERATIONS_RULES') ? 1 : 0;
}

// ── Phase D: domestic sale, measurement, receivable, aging, contract progress ──
function phaseD(e: SimulationEngine, trace: Step15Trace) {
  const L = (n: string) => locId(e, n);
  // MILL_D1 buyer: honest meter (bias 0); high capacity, hunger kept ≥ ACCEPT threshold.
  go(e, 'CreateBuyer', {
    configId: 'buyer.gauja_sawmill', displayName: 'MILL_D1', fictional: true, buyerType: 'CONIFER_SAWMILL',
    companyId: 'COMPANY-000001', locationId: L('MILL_D1'),
    compatibility: [
      { speciesId: BIRCH, assortmentId: A_V1825, accepted: true },
      { speciesId: BIRCH, assortmentId: A_V26P, accepted: true },
      { speciesId: BIRCH, assortmentId: A_THIN, accepted: true },
    ],
    capacityMilliM3: 1_000_000_000, stockMilliM3: 0, targetStockMilliM3: 100_000, consumptionMilliM3PerDay: 1_000,
    paymentTermsSeconds: 10 * DAY, instantPaymentDiscountMinorPerM3: 0,
    measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 0, strictnessBasisPoints: 5000,
  });
  const mill = e.buyers.snapshot().buyers.at(-1)!.id;
  trace.ids.mill = mill;

  // Three assortment-specific cards (flat rate each). finalRate carries the hunger premium; principals
  // are recomputed test-side from the actual finalRate (v3: acceptedVolume × finalRate / 1000).
  const publishCard = (assortmentId: string, base: number, key: string) => {
    go(e, 'PublishBuyerPriceCard', { buyerId: mill, speciesId: BIRCH, assortmentId, baseRateMinorPerM3: base });
    const card = e.buyers.snapshot().priceCards.at(-1)!;
    trace.ids[key] = card.id;
    trace.values[key + 'Rate'] = card.breakdown.finalRateMinorPerM3;
    return card.id;
  };
  const cardV = publishCard(A_V1825, 10_000, 'cardVeneer');
  const cardSaw = publishCard(A_V26P, 11_000, 'cardSaw');
  publishCard(A_THIN, 7_000, 'cardThin');

  // CTR_1 frame agreement (fixed 10,000/m³, committed 60,000 of veneer birch).
  go(e, 'CreateFrameAgreement', {
    companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: mill, displayName: 'CTR_1',
    validFromTimestamp: 0, validUntilTimestamp: 30 * DAY, committedVolumeMilliM3: 60_000, toleranceBasisPoints: 1_000,
    priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 10_000, paymentTermsSeconds: 10 * DAY, currency: 'EUR',
    requiredSpeciesIds: [BIRCH], requiredAssortmentIds: [A_V1825],
  });
  const ctr1 = e.contracts.snapshot().agreements.at(-1)!.id;
  trace.ids.ctr1 = ctr1;
  go(e, 'ActivateFrameAgreement', { agreementId: ctr1 });

  // Acquisition estimate baseline (P1 deal) must remain unmutated by measurement.
  const p1Deal = e.inventory.snapshot().deals.find(d => d.description.includes(trace.ids.p1Offer!));
  trace.values.p1RecognizedBefore = p1Deal ? p1Deal.recognizedVolumeMilliM3 : -1;
  trace.ids.p1Deal = p1Deal ? p1Deal.id : '';

  // ── L1 (spot): B1 whole → veneer card. Honest meter → brāķis (500bp=2.000) rejected. ──
  go(e, 'SubmitLoadToBuyer', { buyerId: mill, loadId: trace.ids.l1Load, priceCardId: cardV });
  const m1 = e.buyers.snapshot().measurements.at(-1)!;
  trace.ids.m1 = m1.id;
  trace.values.m1Measured = m1.measuredVolumeMilliM3;
  trace.values.m1Accepted = m1.acceptedVolumeMilliM3;
  trace.values.m1Rejected = m1.rejectedVolumeMilliM3;
  trace.values.m1Rate = m1.rateMinorPerM3;
  trace.values.m1Principal = m1.principalMinor;
  trace.values.m1Gate = m1.gateDecision === 'ACCEPT' ? 1 : 0;
  trace.values.m1BrakisFromGrades = m1.gradeAllocations.filter(g => g.qualityId === 'quality.birch.brakis').reduce((n, g) => n + g.volumeMilliM3, 0);

  // ── L2 (CTR_1 delivery): C1 30.000 → agreement fixed rate; AgreementDeliveryRecorded ──
  go(e, 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: e.inventory.batch(trace.ids.c1!)!.custodyActorId, originLocationId: L('YARD_1'), destinationLocationId: L('MILL_D1') });
  const l2Load = e.inventory.snapshot().loads.at(-1)!.id;
  go(e, 'AllocateBatchToLoad', { batchId: trace.ids.c1, loadId: l2Load, volumeMilliM3: 30_000 });
  go(e, 'RecordAgreementDelivery', { agreementId: ctr1, loadId: l2Load, volumeMilliM3: 30_000 });
  const delivery = e.contracts.snapshot().deliveries.at(-1)!.id;
  go(e, 'AcceptAgreementDelivery', { deliveryId: delivery, acceptedVolumeMilliM3: 30_000 });
  go(e, 'SettleAgreementDelivery', { deliveryId: delivery });
  const r2 = e.finance.snapshot().receivables.find(r => r.sourceObjectIds?.includes(delivery));
  trace.ids.r2 = r2 ? r2.id : '';
  trace.values.r2Principal = r2 ? r2.principalMinor : -1;
  trace.values.r2AgingAtCreate = 0; // NOT_DUE encoded as 0
  const agr = e.contracts.snapshot().agreements.find(a => a.id === ctr1)!;
  trace.values.ctr1Delivered = agr.deliveredVolumeMilliM3;
  trace.values.ctr1Accepted = agr.acceptedVolumeMilliM3;
  const del = e.contracts.snapshot().deliveries.find(d => d.id === delivery)!;
  trace.values.l2Total = del.totalMinor;

  // ── L3 (spot): C2 6.000 → sawlogs card. Move to mill, unload, submit. ──
  go(e, 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: e.inventory.batch(trace.ids.c2!)!.custodyActorId, originLocationId: L('YARD_1'), destinationLocationId: L('MILL_D1') });
  const l3Load = e.inventory.snapshot().loads.at(-1)!.id;
  go(e, 'AllocateBatchToLoad', { batchId: trace.ids.c2, loadId: l3Load, volumeMilliM3: 6_000 });
  go(e, 'MoveLoad', { loadId: l3Load, toLocationId: L('MILL_D1') });
  go(e, 'UnloadLoad', { loadId: l3Load });
  go(e, 'SubmitLoadToBuyer', { buyerId: mill, loadId: l3Load, priceCardId: cardSaw });
  const m3 = e.buyers.snapshot().measurements.at(-1)!;
  trace.ids.m3 = m3.id;
  trace.values.m3Accepted = m3.acceptedVolumeMilliM3;
  trace.values.m3Rate = m3.rateMinorPerM3;
  trace.values.m3Principal = m3.principalMinor;
  trace.values.m3Gate = m3.gateDecision === 'ACCEPT' ? 1 : 0;

  // Domestic total = sum of the three principals (two buyer measurements + one contract delivery).
  trace.values.domesticTotal = trace.values.m1Principal + trace.values.l2Total + trace.values.m3Principal;

  // ── Aging: observe R2 through NOT_DUE → DUE → PAID (contract receivable schedules due/overdue). ──
  const r2now = e.finance.receivable(trace.ids.r2)!;
  trace.values.r2AgingStateNotDue = r2now.agingState === 'NOT_DUE' ? 1 : 0;
  e.advanceUntil(r2now.dueTimestamp); // fire ReceivableBecameDue (not Overdue at due+1)
  trace.values.r2AgingStateDue = e.finance.receivable(trace.ids.r2)!.agingState === 'DUE' ? 1 : 0;
  go(e, 'RecordReceivablePayment', { receivableId: trace.ids.r2, amountMinor: trace.values.r2Principal });
  trace.values.r2AgingStatePaid = e.finance.receivable(trace.ids.r2)!.agingState === 'PAID' ? 1 : 0;

  // Acquisition estimate unmutated by measurement.
  const p1DealAfter = trace.ids.p1Deal ? e.inventory.deal(trace.ids.p1Deal) : undefined;
  trace.values.p1RecognizedAfter = p1DealAfter ? p1DealAfter.recognizedVolumeMilliM3 : -1;
}

// ── Phase E: market causality — two independent payload-referenced pairs ──
function phaseE(e: SimulationEngine, trace: Step15Trace) {
  go(e, 'CreateMarket', {
    regime: 'NORMAL', season: 'SUMMER',
    drivers: [
      { displayName: 'Domestic demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 6000, direction: 'STABLE' },
      { displayName: 'Export demand DRV_PULP', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' },
    ],
  });
  const exportDriver = e.markets.snapshot().drivers.find(d => d.category === 'EXPORT_DEMAND')!.id;

  // Pair A: MarketDriverUpdated → BuyerPriceCardPublished carrying the driver eventId in causeEventIds.
  const driverRes = go(e, 'UpdateMarketDriver', { driverId: exportDriver, valueBasisPoints: 7_500, direction: 'UPWARD' });
  const driverEventId = driverRes.emittedEventIds[0]!;
  trace.events.marketDriver = driverEventId;
  const all = e.eventLog.all();
  const cardEvents = all.filter(ev => driverRes.emittedEventIds.includes(ev.eventId) && ev.eventType === 'BuyerPriceCardPublished');
  trace.values.pairACardCount = cardEvents.length;
  trace.values.pairAAllCardsCarryCause = cardEvents.length > 0 && cardEvents.every(ev =>
    ((ev.payload as any).priceCard?.breakdown?.causeEventIds ?? []).includes(driverEventId)) ? 1 : 0;

  // Pair B: MarketRegimeChanged → BuyerDemandChanged carrying regimeEventId equal to the regime eventId.
  const regimeRes = go(e, 'TransitionMarketRegime', { regime: 'BOOM' });
  const regimeEventId = regimeRes.emittedEventIds[0]!;
  trace.events.marketRegime = regimeEventId;
  const demandEvents = e.eventLog.all().filter(ev => regimeRes.emittedEventIds.includes(ev.eventId) && ev.eventType === 'BuyerDemandChanged');
  trace.values.pairBDemandCount = demandEvents.length;
  trace.values.pairBAllCarryRegime = demandEvents.length > 0 && demandEvents.every(ev =>
    (ev.payload as any).regimeEventId === regimeEventId) ? 1 : 0;
}

// ── Phase F: real transport → port aggregation → charter export ──
function phaseF(e: SimulationEngine, trace: Step15Trace) {
  const L = (n: string) => locId(e, n);
  const port = L('PORT_1');
  const yard = L('YARD_1');
  const rsA = L('RS_A');
  const exportBatchIds: string[] = [trace.ids.c3, trace.ids.b3Spruce, trace.ids.b3Birch].filter((id): id is string => {
    if (!id) throw new Error(`Phase F: export batch ID undefined (c3=${trace.ids.c3}, b3Spruce=${trace.ids.b3Spruce}, b3Birch=${trace.ids.b3Birch})`);
    return true;
  });

  // Create one carrier for all port-bound transport.
  go(e, 'CreateCarrier', {
    fictional: true, configId: 'transport.small_trader_spot', displayName: 'CARRIER_PORT',
    capacityMilliM3: 100_000, baseCalloutMinor: 10_000, distanceRateMinorPerKm: 100, volumeRateMinorPerM3: 400,
    pickupDelaySeconds: 600, paymentTermsSeconds: 3_600,
    disruptionChanceBasisPoints: 0, disruptionDelaySeconds: 0, disruptionSurchargeMinor: 0,
  });
  const carrierId = e.transport.snapshot().carriers.at(-1)!.id;
  trace.ids.portCarrier = carrierId;

  // Origin per batch: C3 at yard, B3_SPRUCE/B3_BIRCH at RS_A (harvest roadside).
  const batchOrigins: Array<{ id: string; loc: string }> = [
    { id: trace.ids.c3!, loc: yard },
    { id: trace.ids.b3Spruce!, loc: rsA },
    { id: trace.ids.b3Birch!, loc: rsA },
  ];

  const transportEntries: Array<{ batchId: string; loadId: string; origin: string }> = [];

  for (const [idx, entry] of batchOrigins.entries()) {
    const batch = e.inventory.batch(entry.id);
    if (!batch) throw new Error(`Phase F: batch not found for id=${entry.id} at index ${idx}`);
    const origin = entry.loc;

    go(e, 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: batch.custodyActorId,
      originLocationId: origin, destinationLocationId: port,
    });
    const loadId = e.inventory.snapshot().loads.at(-1)!.id;
    go(e, 'AllocateBatchToLoad', { batchId: entry.id, loadId, volumeMilliM3: batch.currentVolumeMilliM3 });
    go(e, 'RequestCarrierQuote', {
      carrierId, loadId, destinationLocationId: port,
      expiryTimestamp: e.clock.currentGameTime + 30 * DAY, urgencyBasisPoints: 0,
    });
    const qId = e.transport.snapshot().quotes.at(-1)!.id;
    go(e, 'AcceptCarrierQuote', { quoteId: qId });
    go(e, 'CreateTransportJob', { quoteId: qId });
    const jobId = e.transport.snapshot().jobs.at(-1)!.id;
    go(e, 'AllocateLoadToTransportJob', { jobId });
    go(e, 'ConfirmDispatch', { jobId });
    transportEntries.push({ batchId: entry.id, loadId, origin });
  }
  // Save C3 port load ID for later cost attribution.
  trace.ids.c3PortLoad = transportEntries[0]?.loadId ?? '';

  // Advance past all transport legs.
  e.advanceUntil(e.clock.currentGameTime + 3 * DAY);

  // Unload and complete each transport job, then MoveBatch to sync batch.locationId.
  for (const [idx, te] of transportEntries.entries()) {
    const jobSnapshot = e.transport.snapshot().jobs.filter(j => j.loadId === te.loadId);
    const job = jobSnapshot[jobSnapshot.length - 1]!;
    const preMoveLoc = e.inventory.batch(te.batchId)!.locationId;
    go(e, 'UnloadTransportJob', { jobId: job.id });
    go(e, 'CompleteTransportJob', { jobId: job.id });
    // Release the load allocation so batch volume becomes available for the export order.
    const loadAllocs = e.inventory.snapshot().allocations.filter(a => a.loadId === te.loadId && a.status === 'ACTIVE');
    for (const a of loadAllocs) go(e, 'ReleaseLoadAllocation', { allocationId: a.id });
    // Transport updates only the load location; sync batch.locationId via MoveBatch.
    const load = e.inventory.load(te.loadId)!;
    go(e, 'MoveBatch', { batchId: te.batchId, toLocationId: port });
    trace.values[`transportBatch${idx}AtPort`] = e.inventory.batch(te.batchId)!.locationId === port ? 1 : 0;
    trace.values[`moveBatch${idx}FollowedTransport`] = load.currentLocationId === port && preMoveLoc !== port ? 1 : 0;
  }

  // Test-side proof: every export batch is physically at PORT_1; port inventory = Σ their volumes.
  trace.values.allExportBatchesAtPort = exportBatchIds.every(id => e.inventory.batch(id)!.locationId === port) ? 1 : 0;
  const portInventory = e.inventory.snapshot().batches
    .filter(b => b.locationId === port && !['DEPLETED', 'SPLIT', 'MERGED', 'CANCELLED', 'CLOSED'].includes(b.status))
    .reduce((n, b) => n + b.currentVolumeMilliM3, 0);
  trace.values.portInventoryPreLoad = portInventory;
  const exportVolume = exportBatchIds.reduce((n, id) => n + e.inventory.batch(id)!.currentVolumeMilliM3, 0);
  trace.values.exportOrderVolume = exportVolume;

  // Export buyer + charter quote CQ_1 (6,500 mu/m³).
  go(e, 'CreateExportBuyer', { companyId: 'COMPANY-000001', locationId: L('EXPORT_DEST'), fictional: true, configId: 'buyer.export_europe', displayName: 'EXPORT_BUYER_1', buyerType: 'EXPORT_SAWMILL', paymentTermsSeconds: 10 * DAY });
  const eb = e.exports.snapshot().buyers.at(-1)!.id;
  go(e, 'CreateExportQuote', { portLocationId: port, destinationLocationId: L('EXPORT_DEST'), rateMinorPerM3: 6_500, handlingCostMinor: 50_000, documentationCostMinor: 10_000, expiryTimestamp: e.clock.currentGameTime + 20 * DAY });
  const quote = e.exports.snapshot().quotes.at(-1)!.id;
  go(e, 'AcceptExportQuote', { quoteId: quote });
  go(e, 'CreateExportOrder', { quoteId: quote, exportBuyerId: eb, volumeMilliM3: exportVolume, batchIds: exportBatchIds, requiredDocumentTypes: ['CERT_OF_ORIGIN', 'PHYTOSANITARY'] });
  const orderId = e.exports.snapshot().orders.at(-1)!.id;
  trace.ids.exportOrder = orderId;
  go(e, 'ValidateExportDocuments', { orderId, missingDocs: [] });
  go(e, 'ConfirmExportSlot', { orderId, delaySeconds: 3_600 });
  e.advanceUntil(e.clock.currentGameTime + 2 * DAY);
  go(e, 'CompleteExportLoading', { orderId });
  e.advanceUntil(e.clock.currentGameTime + 4 * DAY);
  go(e, 'AcceptExportCargo', { orderId, acceptedVolumeMilliM3: exportVolume });
  // No pre-release workaround needed: the inventory-domain bug is fixed.
  go(e, 'SettleExportOrder', { orderId });

  const settle = eventsOfType(e, 'ExportOrderSettled').at(-1)!;
  const depletions = (settle.payload as any).batchDepletions as Array<{ batchId: string; volumeMilliM3: number }>;
  trace.values.exportDepletionMatchesBatches = depletions.every(d => exportBatchIds.includes(d.batchId)) && depletions.length === exportBatchIds.length ? 1 : 0;
  trace.values.exportDepletionVolume = depletions.reduce((n, d) => n + d.volumeMilliM3, 0);
  const recv = (settle.payload as any).receivable as { id: string; principalMinor: number };
  trace.ids.exportReceivable = recv.id;
  trace.values.exportSettlementValue = recv.principalMinor;
  trace.values.exportExpectedValue = Math.floor(exportVolume * 6_500 / 1000);

  // Collect the export receivable.
  go(e, 'RecordReceivablePayment', { receivableId: recv.id, amountMinor: recv.principalMinor });
}

// ── Phase G: settlement, reconciliation, auction-multi-batch P&L ──
function phaseG(e: SimulationEngine, trace: Step15Trace) {
  const rngBefore = JSON.stringify(e.rng.snapshot());

  // ── Settle all PLAYER payables that represent completed economic activity ──
  const playerPayables = e.finance.snapshot().payables.filter(p =>
    p.companyId === 'COMPANY-000001' && !['PAID', 'CANCELLED'].includes(p.status));
  for (const p of playerPayables) {
    go(e, 'RecordPayablePayment', { payableId: p.id, amountMinor: p.principalMinor });
  }
  trace.values.settledPayableCount = playerPayables.length;

  // Verify PLAYER cash never went negative (fold-cash check below catches this).
  // COMP_1 committed cash was checked in phaseA; settle its remaining payables too.
  const compPayables = e.finance.snapshot().payables.filter(p =>
    p.companyId === 'COMPANY-000002' && !['PAID', 'CANCELLED'].includes(p.status));
  for (const p of compPayables) {
    const bal = e.finance.balanceByCode('COMPANY-000002', 'OPERATING_CASH');
    if (p.principalMinor <= bal) {
      go(e, 'RecordPayablePayment', { payableId: p.id, amountMinor: p.principalMinor });
    }
  }

  // ── Global wood conservation ──
  const inWood = 40_000 + (trace.values.b2Volume ?? 0) + (trace.values.harvestRealized ?? 0);
  const millReceived = 40_000 + (trace.values.c1Volume ?? 0) + (trace.values.c2Volume ?? 0);
  const exported = trace.values.exportDepletionVolume ?? 0;
  const loss = trace.values.sortLoss ?? 0;
  trace.values.conservationIn = inWood;
  trace.values.conservationOut = millReceived + exported + loss;
  trace.values.harvestStageOk = (trace.values.harvestRemoved ?? 0) === (trace.values.harvestRealized ?? 0) + (trace.values.harvestResidue ?? 0) ? 1 : 0;

  // ── Closing cash ──
  const cashAcct = (companyId: string) => e.finance.snapshot().accounts.find(a => a.companyId === companyId && a.code === 'OPERATING_CASH')!.id;
  const foldCash = (companyId: string) => {
    const acct = cashAcct(companyId);
    const txs = [...e.finance.snapshot().transactions].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    let bal = 0, minBal = 0;
    for (const tx of txs) {
      for (const line of tx.lines) if (line.accountId === acct) bal += line.debitMinor - line.creditMinor;
      if (bal < minBal) minBal = bal;
    }
    return { bal, minBal };
  };
  const playerFold = foldCash('COMPANY-000001');
  const compFold = foldCash('COMPANY-000002');
  trace.values.playerFoldedCash = playerFold.bal;
  trace.values.playerReadModelCash = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
  trace.values.compFoldedCash = compFold.bal;
  trace.values.compReadModelCash = e.finance.balanceByCode('COMPANY-000002', 'OPERATING_CASH');
  trace.values.playerMinRunningCash = playerFold.minBal;
  trace.values.compMinRunningCash = compFold.minBal;

  // ── Terminal state assertions ──
  // All receivables should be PAID
  const unpaidReceivables = e.finance.snapshot().receivables.filter(r => r.status !== 'PAID');
  trace.values.paidReceivableCount = e.finance.snapshot().receivables.length - unpaidReceivables.length;
  trace.values.unpaidReceivableCount = unpaidReceivables.length;
  // All intended payables are PAID (PLAYER side)
  trace.values.playerPaidCount = e.finance.snapshot().payables.filter(p => p.companyId === 'COMPANY-000001' && p.status === 'PAID').length;
  trace.values.playerUnpaidCount = e.finance.snapshot().payables.filter(p => p.companyId === 'COMPANY-000001' && p.status !== 'PAID').length;
  // Export order is terminal
  const exOrder = trace.ids.exportOrder ? e.exports.order(trace.ids.exportOrder) : undefined;
  trace.values.exportTerminal = exOrder && ['SETTLED', 'CANCELLED'].includes(exOrder.status) ? 1 : 0;
  // No active reservations on depleted batches
  const staleReservations = e.inventory.snapshot().reservations.filter(r =>
    r.status === 'ACTIVE' && e.inventory.batch(r.batchId)?.status === 'DEPLETED');
  trace.values.staleReservationCount = staleReservations.length;

  // ── Deal(P1) P&L ──
  const m1Revenue = e.finance.snapshot().transactions
    .filter(tx => tx.sourceObjectIds?.includes(trace.ids.m1!))
    .reduce((n, tx) => n + tx.lines.filter(l => l.accountId === e.finance.snapshot().accounts.find(a => a.companyId === 'COMPANY-000001' && a.code === 'REVENUE')!.id).reduce((s, l) => s + l.creditMinor - l.debitMinor, 0), 0);
  const hiredHaul = e.inventory.snapshot().costLayers.find(l => l.category === 'TRANSPORT_PLACEHOLDER' && l.attachedToId === trace.ids.l1Load)?.totalMinor ?? 0;
  trace.values.p1Revenue = m1Revenue;
  trace.values.p1RevenueMatchesMeasurement = m1Revenue === trace.values.m1Principal ? 1 : 0;
  trace.values.p1HiredHaul = hiredHaul;
  trace.values.p1PnL = m1Revenue - (trace.values.p1AcquisitionCostMinor ?? 0) - hiredHaul;

  // ── Auction-deal (B2) P&L reconstruction ──
  // B2 = auction lot (58.000 m³ birch). Children: C1(30k A), C2(6k B_PLUS), C3(20.5k TARA_14_18).
  const b2Deal = trace.ids.b2 ? e.inventory.snapshot().deals.filter(d =>
    e.inventory.snapshot().lots.filter(l => l.dealId === d.id)
      .some(l => l.batchIds.includes(trace.ids.b2!))).at(-1) : undefined;
  trace.values.b2DealExists = b2Deal ? 1 : 0;

  // ── Acquisition cost via commitment → payable ──
  const auctionCommitment = e.finance.snapshot().commitments.find(c =>
    c.companyId === 'COMPANY-000001' && c.purpose === 'AUCTION_WIN');
  const auctionPayable = auctionCommitment
    ? e.finance.snapshot().payables.find(p =>
        p.companyId === 'COMPANY-000001' && p.commitmentId === auctionCommitment.id)
    : undefined;
  trace.values.b2AuctionCommitmentCount = e.finance.snapshot().commitments
    .filter(c => c.companyId === 'COMPANY-000001' && c.purpose === 'AUCTION_WIN').length;
  trace.values.b2AuctionPayableMatchCount = auctionPayable ? 1 : 0;
  const b2AcquisitionCost = auctionPayable ? auctionPayable.principalMinor : -1;
  trace.values.b2Acquisition = b2AcquisitionCost;

  // ── Owned haul cost: layers attached to the B2-specific load ID ──
  const b2HaulLoadId = trace.ids.b2HaulLoad ?? '';
  const b2HaulCostLayers = e.inventory.snapshot().costLayers
    .filter(l => l.attachedToType === 'LOAD' && l.attachedToId === b2HaulLoadId);
  trace.values.b2HaulCostLayerCount = b2HaulCostLayers.length;
  const b2OwnedHaul = b2HaulCostLayers.reduce((n, l) => n + l.totalMinor, 0);
  trace.values.b2OwnedHaul = b2OwnedHaul;

  // ── Sorting cost: layers on B2 batch from YardSortingRecorded ──
  const sortingCostLayers = e.inventory.snapshot().costLayers
    .filter(l => l.provenanceReference === 'SORTING_M1' || (l.category === 'OPERATIONAL' && l.attachedToType === 'BATCH'));
  trace.values.b2SortingCostLayerCount = sortingCostLayers.length;
  const b2SortingCost = sortingCostLayers.reduce((n, l) => n + l.totalMinor, 0);
  trace.values.b2SortingCost = b2SortingCost;

  // ── Revenue: C1→CTR1, C2→sawlogs, C3→export (proportional by volume) ──
  const c1Revenue = trace.values.l2Total ?? 0;
  const c2Revenue = trace.values.m3Principal ?? 0;
  const c3Vol = trace.values.c3Volume ?? 0;
  const b3BirchVol = trace.values.b3BirchVolume ?? 0;
  const b3SpruceVol = trace.values.b3SpruceVolume ?? 0;
  const totalExportVol = c3Vol + b3BirchVol + b3SpruceVol;
  const exportRev = trace.values.exportSettlementValue ?? 0;
  const c3ExportRevenue = totalExportVol > 0
    ? Math.floor(Number(BigInt(exportRev) * BigInt(c3Vol) / BigInt(totalExportVol)))
    : 0;
  const b3ExportRevenue = exportRev - c3ExportRevenue;
  trace.values.c3ExportVolume = c3Vol;
  trace.values.totalExportVolume = totalExportVol;
  trace.values.c3AllocatedExportRevenue = c3ExportRevenue;
  trace.values.b3ExportRevenue = b3ExportRevenue;
  trace.values.b2Revenue = c1Revenue + c2Revenue + c3ExportRevenue;
  trace.values.revenueAllocationSum = c3ExportRevenue + b3ExportRevenue;
  trace.values.revenueAllocationMatch = trace.values.revenueAllocationSum === exportRev ? 1 : 0;

  // ── C3 port-haul: cost layers on C3's port-transport load ──
  const c3PortHaul = trace.ids.c3PortLoad
    ? e.inventory.snapshot().costLayers
        .filter(l => l.attachedToType === 'LOAD' && l.attachedToId === trace.ids.c3PortLoad)
        .reduce((n, l) => n + l.totalMinor, 0)
    : 0;
  trace.values.c3PortHaul = c3PortHaul;

  // ── Export handling: proportional allocation ──
  const totalExportHandling = 60_000;
  const c3Handling = totalExportVol > 0
    ? Math.floor(Number(BigInt(totalExportHandling) * BigInt(c3Vol) / BigInt(totalExportVol)))
    : 0;
  const b3Handling = totalExportHandling - c3Handling;
  trace.values.c3ExportHandling = c3Handling;
  trace.values.b3ExportHandling = b3Handling;
  trace.values.handlingAllocationSum = c3Handling + b3Handling;
  trace.values.handlingAllocationMatch = trace.values.handlingAllocationSum === totalExportHandling ? 1 : 0;

  // ── Final B2 P&L ──
  trace.values.b2PnL = c1Revenue + c2Revenue + c3ExportRevenue
    - b2AcquisitionCost - b2OwnedHaul - b2SortingCost
    - c3PortHaul - c3Handling;

  // The system does not expose a single packaged "auction deal P&L" read-model.
  // The reconstruction above is test-side only, using cost layers + revenue journal data.

  // Zero VAT entries anywhere in the ledger.
  const anyVat = e.finance.snapshot().transactions.some(tx => tx.lines.some(l => /VAT/i.test(l.category) || /VAT/i.test(l.memo ?? '')));
  trace.values.vatEntryCount = anyVat ? 1 : 0;

  trace.values.rngNeutral = JSON.stringify(e.rng.snapshot()) === rngBefore ? 1 : 0;
  trace.values.finalGameTime = e.clock.currentGameTime;
  trace.values.eventCount = e.eventLog.all().length;
}

export interface RunOptions { onPhase?: (e: SimulationEngine, phase: string) => void }

export function runStep15(e: SimulationEngine, opts: RunOptions = {}): Step15Trace {
  cmdSeq = 0; // deterministic per-run command numbering (parentCauseId feeds event hashes)
  const trace: Step15Trace = {
    ids: {}, events: {}, values: {},
    phaseA: {
      offerIds: [], playerVisibleOfferIds: [], compVisibleOfferIds: [],
      lateAcceptRejected: false, auditUnchangedOnLateAccept: false,
      playerBatchId: '', compBatchId: '', compCashAfterSettlement: 0,
      autonomousPipelineOfferCount: 0,
    },
  };
  buildWorld(e);
  phaseA(e, trace); opts.onPhase?.(e, 'A');
  phaseB(e, trace); opts.onPhase?.(e, 'B');
  phaseC(e, trace); opts.onPhase?.(e, 'C');
  phaseD(e, trace); opts.onPhase?.(e, 'D');
  phaseE(e, trace); opts.onPhase?.(e, 'E');
  phaseF(e, trace); opts.onPhase?.(e, 'F');
  phaseG(e, trace); opts.onPhase?.(e, 'G');
  return trace;
}
