import { describe, expect, it } from 'vitest';
import { createStep15Engine, runStep15 } from '../src/headless/step15.js';
import { publicOffers, setupAutonomousScheduler } from '../src/scheduler/commands.js';
import { createSnapshot } from '../src/persistence/snapshot.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { SimulationEngine, command } from '../src/core/engine.js';

describe('Step 15 canonical golden scenario', () => {
  it('Phase A — shared finite procurement via the real offer pipeline', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // both offers surfaced
    expect(t.phaseA.offerIds).toHaveLength(2);

    // shared visibility: both companies see both offers via publicOffers
    const playerView = publicOffers(e, 'COMPANY-000001').map(o => o.id);
    const compView = publicOffers(e, 'COMPANY-000002').map(o => o.id);
    for (const id of t.phaseA.offerIds) {
      expect(playerView).toContain(id);
      expect(compView).toContain(id);
    }

    // finite pool: late accept of the taken offer fails atomically
    expect(t.phaseA.lateAcceptRejected).toBe(true);
    expect(t.phaseA.lateAcceptCode).toBe('INVALID_OFFER_ACCEPTANCE');
    expect(t.phaseA.auditUnchangedOnLateAccept).toBe(true);

    // each acceptance produced exactly one batch owned by the right company
    const b1 = e.inventory.batch(t.phaseA.playerBatchId)!;
    const cb = e.inventory.batch(t.phaseA.compBatchId)!;
    expect(b1.ownerCompanyId).toBe('COMPANY-000001');
    expect(cb.ownerCompanyId).toBe('COMPANY-000002');
    expect(b1.currentVolumeMilliM3).toBe(40_000);

    // COMP_1 spent from its own real ledger (started at 2,000,000)
    expect(t.phaseA.compCashAfterSettlement).toBeLessThan(2_000_000);
    expect(t.phaseA.compCashAfterSettlement).toBeGreaterThan(0);
  });

  it('Phase B — auction win + species-separated harvest with conservation', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // Auction: PLAYER won at 8,600; payable 58.000 × 8,600 = 498,800 mu.
    expect(t.ids.auctionWinner).toBe('COMPANY-000001');
    expect(t.values.auctionWinningRate).toBe(8_600);
    expect(t.values.b2Volume).toBe(58_000);
    expect(t.values.compOverCashRejected).toBe(1); // COMP_1 never bids beyond cash
    // winning payable exists at 498,800
    const winPayable = e.finance.snapshot().payables.find(p => p.principalMinor === 498_800);
    expect(winPayable).toBeTruthy();

    // Harvest: one batch per species, each 10,000 bp pure; Σ = realized; residue = removed − realized.
    expect(t.values.harvestBatchCount).toBe(2);
    expect(t.values.harvestBatchVolumeSum).toBe(t.values.harvestRealized);
    expect(t.values.harvestResidue).toBe(t.values.harvestRemoved! - t.values.harvestRealized!);
    const birch = e.inventory.batch(t.ids.b3Birch!)!;
    const spruce = e.inventory.batch(t.ids.b3Spruce!)!;
    expect(birch.composition.species).toEqual([{ id: 'species.birch', basisPoints: 10000 }]);
    expect(spruce.composition.species).toEqual([{ id: 'species.spruce', basisPoints: 10000 }]);
    // each species batch retains the forest assortment distribution
    expect(birch.composition.assortment).toEqual([
      { id: 'assortment.veneer_logs', basisPoints: 5000 },
      { id: 'assortment.pulpwood', basisPoints: 5000 },
    ]);
  });

  it('Phase C — hired + owned transport and yard sorting with exact loss', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // both transport modes ran; hired load reached the mill
    expect(t.values.hiredLoadAtMill).toBe(1);
    // distinct cost line items
    expect(t.values.hiredCostLayerExists).toBe(1);
    expect(t.values.ownedCostLayerExists).toBe(1);

    // sort precondition negative: non-yard batch rejected atomically
    expect(t.values.nonYardSortRejected).toBe(1);
    expect(t.values.nonYardSortCode).toBe(1);
    expect(t.values.sortAuditUnchanged).toBe(1);

    // conservation: children + loss = parent, exact
    expect(t.values.c1Volume).toBe(30_000);
    expect(t.values.c2Volume).toBe(6_000);
    expect(t.values.c3Volume).toBe(20_500);
    expect(t.values.sortLoss).toBe(1_500);
    expect(t.values.sortChildrenPlusLoss).toBe(t.values.b2ParentVolumeAtSort);
  });

  it('Phase D — flat-rate measurement, contract progress, receivable aging', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // L1: honest meter, brāķis isolated via gradeAllocations (500bp of 40.000 = 2.000)
    expect(t.values.m1Gate).toBe(1);
    expect(t.values.m1Measured).toBe(40_000);
    expect(t.values.m1Rejected).toBe(2_000);
    expect(t.values.m1Accepted).toBe(38_000);
    expect(t.values.m1BrakisFromGrades).toBe(2_000);
    // flat-rate principal recomputed: accepted × finalRate / 1000, exact
    expect(t.values.m1Principal).toBe(Math.floor(t.values.m1Accepted! * t.values.m1Rate! / 1000));
    expect(t.values.m1Rate).toBe(t.values.cardVeneerRate);

    // L3: sawlogs card, honest full accept
    expect(t.values.m3Gate).toBe(1);
    expect(t.values.m3Accepted).toBe(6_000);
    expect(t.values.m3Principal).toBe(Math.floor(t.values.m3Accepted! * t.values.m3Rate! / 1000));
    expect(t.values.m3Rate).toBe(t.values.cardSawRate);

    // contract progress: accepted == Σ accepted deliveries == 30,000
    expect(t.values.ctr1Delivered).toBe(30_000);
    expect(t.values.ctr1Accepted).toBe(30_000);
    expect(t.values.l2Total).toBe(Math.floor(30_000 * 10_000 / 1000)); // 300,000 mu exact

    // domestic total = sum of the three principals
    expect(t.values.domesticTotal).toBe(t.values.m1Principal! + t.values.l2Total! + t.values.m3Principal!);

    // receivable observed in ≥2 aging states before PAID
    expect(t.values.r2AgingStateNotDue).toBe(1);
    expect(t.values.r2AgingStateDue).toBe(1);
    expect(t.values.r2AgingStatePaid).toBe(1);

    // acquisition estimate unmutated by measurement
    expect(t.values.p1RecognizedAfter).toBe(t.values.p1RecognizedBefore);
    expect(t.values.p1RecognizedBefore).toBe(40_000);
  });

  it('Phase E — two independent market causal pairs via payload references', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // Pair A: every price card published by the driver update carries the driver eventId in causeEventIds
    expect(t.values.pairACardCount).toBeGreaterThan(0);
    expect(t.values.pairAAllCardsCarryCause).toBe(1);
    expect(t.events.marketDriver).toMatch(/^EVENT-/);

    // Pair B: every demand change carries regimeEventId equal to the regime eventId
    expect(t.values.pairBDemandCount).toBeGreaterThan(0);
    expect(t.values.pairBAllCarryRegime).toBe(1);
    expect(t.events.marketRegime).toMatch(/^EVENT-/);
  });

  it('Phase F — real port transport, aggregation, and export settlement', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // Real transport: each export batch moved via hired carrier, not bare MoveBatch
    expect(t.values.transportBatch0AtPort).toBe(1); // C3 from YARD_1
    expect(t.values.transportBatch1AtPort).toBe(1); // B3_SPRUCE from RS_A
    expect(t.values.transportBatch2AtPort).toBe(1); // B3_BIRCH from RS_A
    // Every MoveBatch followed a completed transport leg (load arrived before batch move)
    expect(t.values.moveBatch0FollowedTransport).toBe(1);
    expect(t.values.moveBatch1FollowedTransport).toBe(1);
    expect(t.values.moveBatch2FollowedTransport).toBe(1);

    // every exported batch was physically at PORT_1; port inventory equals their sum
    expect(t.values.allExportBatchesAtPort).toBe(1);
    expect(t.values.portInventoryPreLoad).toBe(t.values.exportOrderVolume);

    // settlement depletes exactly those batch IDs; exported volume = Σ depletions
    expect(t.values.exportDepletionMatchesBatches).toBe(1);
    expect(t.values.exportDepletionVolume).toBe(t.values.exportOrderVolume);

    // settlement value recomputed from quote terms × loaded volume, exact
    expect(t.values.exportSettlementValue).toBe(t.values.exportExpectedValue);
  });

  it('Phase G — payable settlement, auction P&L, terminal state, conservation, cash, no VAT', () => {
    const e = createStep15Engine();
    const t = runStep15(e);

    // ── Payable settlement ──
    expect(t.values.settledPayableCount).toBeGreaterThan(0);
    expect(t.values.playerUnpaidCount).toBe(0); // all PLAYER payables settled

    // ── Auction-deal (B2) P&L ──
    expect(t.values.b2DealExists).toBe(1);
    expect(t.values.b2AuctionCommitmentCount).toBe(1);
    expect(t.values.b2AuctionPayableMatchCount).toBe(1);
    expect(t.values.b2Acquisition).toBe(498_800);
    expect(t.values.b2HaulCostLayerCount).toBe(1);
    expect(t.values.b2OwnedHaul).toBe(16_000);
    expect(t.values.b2SortingCostLayerCount).toBeGreaterThanOrEqual(1);
    expect(t.values.b2SortingCost).toBe(174_000);
    expect(t.values.b2OwnedHaul).not.toBe(t.values.b2SortingCost);
    expect(t.values.b2Revenue).toBeGreaterThan(0);
    expect(t.values.c3AllocatedExportRevenue).toBeLessThan(t.values.exportSettlementValue ?? 0);
    expect(t.values.c3AllocatedExportRevenue).toBe(133_250);
    expect(t.values.revenueAllocationMatch).toBe(1);
    expect(t.values.b3ExportRevenue).toBeGreaterThan(0);
    expect(t.values.b3ExportRevenue).toBe(331_500);
    expect(t.values.c3PortHaul).toBe(27_200);
    expect(t.values.c3ExportHandling).toBe(17_202);
    expect(t.values.handlingAllocationMatch).toBe(1);
    expect(t.values.b2PnL).toBe(-224_052);

    // ── Terminal state ──
    expect(t.values.paidReceivableCount).toBeGreaterThan(0);
    expect(t.values.unpaidReceivableCount).toBe(0);
    expect(t.values.exportTerminal).toBe(1);
    expect(t.values.staleReservationCount).toBe(0);

    // ── Conservation ──
    expect(t.values.conservationOut).toBe(t.values.conservationIn);
    expect(t.values.harvestStageOk).toBe(1);

    // ── Closing cash ──
    expect(t.values.playerFoldedCash).toBe(t.values.playerReadModelCash);
    expect(t.values.compFoldedCash).toBe(t.values.compReadModelCash);
    expect(t.values.playerMinRunningCash).toBeGreaterThanOrEqual(0);
    expect(t.values.compMinRunningCash).toBeGreaterThanOrEqual(0);

    // zero VAT entries
    expect(t.values.vatEntryCount).toBe(0);

    // Deal(P1) P&L
    expect(t.values.p1RevenueMatchesMeasurement).toBe(1);
    expect(t.values.p1AcquisitionCostMinor).toBe(200_000);
    expect(t.values.p1HiredHaul).toBeGreaterThan(0);
    expect(t.values.p1PnL).toBe(t.values.p1Revenue! - t.values.p1AcquisitionCostMinor! - t.values.p1HiredHaul!);

    // reconciliation consumed no RNG
    expect(t.values.rngNeutral).toBe(1);
  });

  it('Determinism — two same-seed runs produce identical canonical state and event log', () => {
    const a = createStep15Engine();
    const b = createStep15Engine();
    const ta = runStep15(a);
    const tb = runStep15(b);
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLogChecksum()).toBe(b.eventLogChecksum());
    expect(ta.values.b2PnL).toBe(tb.values.b2PnL);
    expect(ta.values.c3AllocatedExportRevenue).toBe(tb.values.c3AllocatedExportRevenue);
  });

  it('Determinism — save at Phase D, reload, continue equals uninterrupted run', () => {
    const e = createStep15Engine();
    let snap: ReturnType<typeof createSnapshot> | undefined;
    runStep15(e, { onPhase: (eng, ph) => { if (ph === 'D') snap = createSnapshot(eng); } });
    expect(snap).toBeTruthy();
    const loaded = loadSave(createSave(e, snap!));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
  });
});

describe('Step 15 supplementary — autonomous scheduler pipeline proof', () => {
  it('real setupAutonomousScheduler produces at least one autonomous OfferCreated', () => {
    const e = new SimulationEngine({
      seed: 'auto-proof', configurationBundleVersion: '1', configurationHash: 'h',
      scenarioId: 's', clock: { paused: false },
    });
    const go = (type: string, p: any = {}) => e.execute(command(`c${Date.now()}`, type, e, p));
    go('CreateCompany', { displayName: 'PLAYER', reputationBasisPoints: 5000 });
    go('CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go('CreateLocation', { displayName: 'RS', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
    go('CreateSupplier', {
      configId: 'supplier.liepa_owner', fictional: true, locationId: 'LOCATION-000001',
      companyId: 'COMPANY-000001', displayName: 'AUTO_SUP', archetype: 'PRIVATE_FOREST_OWNER',
      channels: ['PHONE'], suppliedSpeciesIds: ['species.birch'], suppliedAssortmentIds: ['assortment.sawlogs'],
      paymentExpectationSeconds: 86400, documentReliabilityBasisPoints: 9000,
      freshnessAnswerReliabilityBasisPoints: 9000, initialRelationshipBasisPoints: 5000,
    });
    go('CreateSupplierContact', { supplierId: 'SUPPLIER-000001', displayName: 'Contact', role: 'OWNER' });
    go('CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'Demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
    });

    const autoOffersBefore = e.suppliers.snapshot().offers.filter(o => o.status === 'OPEN').length;
    setupAutonomousScheduler(e);
    e.advanceFixedTicks(13);
    const autoOffersAfter = e.suppliers.snapshot().offers.filter(o => o.status === 'OPEN').length;
    expect(autoOffersAfter - autoOffersBefore).toBeGreaterThanOrEqual(1);
  });
});
