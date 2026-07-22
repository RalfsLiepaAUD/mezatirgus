import { SimulationEngine, command } from '../core/engine.js';
import { createSnapshot } from '../persistence/snapshot.js';
import { createSave, loadSave } from '../persistence/save.js';

export interface ScenarioResult {
  seed: string;
  stateChecksum: string;
  eventLogChecksum: string;
  finalGameTime: number;
  company: {
    cashBalanceMinor: number;
    receivablesMinor: number;
    payablesMinor: number;
    totalVolumeMilliM3: number;
    batchCount: number;
    deliveredVolumeMilliM3: number;
    exportedVolumeMilliM3: number;
  };
  ledgerResult: number;
  terminalStatus: string;
  failed: boolean;
  error?: string;
  invariantFailures: string[];
  domainCount: number;
}

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) => {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) throw new Error(`${type} rejected: ${r.message} (${r.code})`);
  return r;
};

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

export function createEngine(seed: string): SimulationEngine {
  return new SimulationEngine({
    seed, configurationBundleVersion: '1', configurationHash: 'scenario-v1',
    scenarioId: 'first_full_skeleton', clock: { paused: false },
  });
}

export function runCanonicalScenario(e: SimulationEngine): ScenarioResult {
  try {
    // ── Phase 1: Company & locations ───────────────────────────────
    go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 10_000_000 });
    go(e, 'Y', 'CreateLocation', { displayName: 'Cēsis yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
    go(e, 'B', 'CreateLocation', { displayName: 'Rīga buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
    go(e, 'F', 'CreateLocation', { displayName: 'Forest roadside', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
    go(e, 'P', 'CreateLocation', { displayName: 'Rīga port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
    go(e, 'X', 'CreateLocation', { displayName: 'Rotterdam', countryCode: 'NL', regionCode: 'NL', roles: ['PORT'] });
    go(e, 'R1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000003', toLocationId: 'LOCATION-000001', accessClass: 'GRAVEL', distanceMetres: 80_000, travelSeconds: 7200, directed: true });
    go(e, 'R2', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002', accessClass: 'PAVED', distanceMetres: 100_000, travelSeconds: 5400, directed: true });
    go(e, 'R3', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000004', accessClass: 'PAVED', distanceMetres: 50_000, travelSeconds: 3600, directed: true });
    go(e, 'R4', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000004', toLocationId: 'LOCATION-000005', accessClass: 'SEA', distanceMetres: 1_500_000, travelSeconds: 172_800, directed: true });

    // ── Phase 2: Deal/lot/batch at yard ────────────────────────────
    go(e, 'DEAL', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo',
      currency: 'EUR', expectedVolumeMilliM3: 30_000, description: 'forestry deal', financeSourceIds: [],
    });
    go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
    go(e, 'LOT', 'CreateLot', {
      dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000001', originalVolumeMilliM3: 50_000, composition,
      freshness: 'FRESH', certainty: 'ESTIMATED',
    });
    go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 30_000, composition });

    // ── Phase 3: Create load and allocate batch ────────────────────
    go(e, 'LOAD', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });

    // ── Phase 4: Yard & sorting ─────────────────────────────────────
    go(e, 'YD', 'CreateYard', {
      companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
      displayName: 'Cēsis yard', totalCapacityMilliM3: 100_000,
      storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000, sortingCapable: true,
    });
    go(e, 'EMP', 'CreateEmployee', {
      companyId: 'COMPANY-000001', displayName: 'Pēteris Ozols', role: 'YARD_WORKER', wageMinorPerHour: 1_200,
    });
    go(e, 'AE', 'AssignEmployeeToYard', { employeeId: 'EMPLOYEE-000001', yardId: 'YARD-000001' });
    go(e, 'B3', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 15_000, composition });
    go(e, 'RV', 'SetBatchRecoveryVolumes', { batchId: 'BATCH-000002', volumes: [{ label: 'A', volumeMilliM3: 7500 }, { label: 'B', volumeMilliM3: 7400 }, { label: 'LOSS', volumeMilliM3: 100 }] });
    go(e, 'SORT', 'SortBatchAtYard', { yardId: 'YARD-000001', batchId: 'BATCH-000002', conductType: 'ETHICAL' });

    // ── Phase 5: Buyer & frame agreement ───────────────────────────
    go(e, 'BUY', 'CreateBuyer', {
      configId: 'buyer.gauja_sawmill', displayName: 'Gauja Sawmill', fictional: true,
      buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002',
      compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', accepted: true }],
      capacityMilliM3: 100_000, stockMilliM3: 50_000, targetStockMilliM3: 50_000, consumptionMilliM3PerDay: 500,
      paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200,
      measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200, strictnessBasisPoints: 5000,
    });
    go(e, 'PC', 'PublishBuyerPriceCard', {
      buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', baseRateMinorPerM3: 6_000,
    });
    go(e, 'AG', 'CreateFrameAgreement', {
      companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
      displayName: 'Rīga sawlog supply', validFromTimestamp: 0, validUntilTimestamp: 200_000,
      committedVolumeMilliM3: 50_000, toleranceBasisPoints: 1_000,
      priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_500,
      paymentTermsSeconds: 14_400, currency: 'EUR',
      requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.sawlogs'],
    });
    go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });

    // ── Phase 6: Market ────────────────────────────────────────────
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [
        { displayName: 'Domestic demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 7000, direction: 'STABLE' },
        { displayName: 'Export demand', category: 'EXPORT_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' },
      ],
    });
    go(e, 'OBS', 'RecordMarketObservation', {});

    // ── Phase 7: Hire carrier for batch volume ─────────────────────
    go(e, 'LOAD2', 'CreateLoad', {
      ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
    });
    go(e, 'ALLOC2', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000002', volumeMilliM3: 10_000 });

    go(e, 'CAR', 'CreateCarrier', {
      configId: 'transport.small_trader_spot', displayName: 'Vidzemes Kravas', fictional: true,
      capacityMilliM3: 35_000, baseCalloutMinor: 10_000, distanceRateMinorPerKm: 100,
      volumeRateMinorPerM3: 400, pickupDelaySeconds: 600, paymentTermsSeconds: 3600,
      disruptionChanceBasisPoints: 0, disruptionDelaySeconds: 0, disruptionSurchargeMinor: 0,
    });
    go(e, 'Q', 'RequestCarrierQuote', {
      carrierId: 'CARRIER-000001', loadId: 'LOAD-000002',
      destinationLocationId: 'LOCATION-000002', expiryTimestamp: 100_000, urgencyBasisPoints: 0,
    });
    go(e, 'QA', 'AcceptCarrierQuote', { quoteId: 'QUOTE-000001' });
    go(e, 'J', 'CreateTransportJob', { quoteId: 'QUOTE-000001' });
    go(e, 'JA', 'AllocateLoadToTransportJob', { jobId: 'JOB-000001' });

    // ── Phase 8: Owned dispatch and lane ────────────────────────────
    go(e, 'TK', 'CreateTruck', {
      companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
      displayName: 'Volvo FH16', capacityMilliM3: 35_000,
    });
    go(e, 'DR', 'CreateDriver', {
      companyId: 'COMPANY-000001', displayName: 'Jānis Bērziņš', wageMinorPerHour: 1_500,
    });
    go(e, 'AD', 'AssignDriverToTruck', { driverId: 'DRIVER-000001', truckId: 'TRUCK-000001' });
    go(e, 'LN', 'CreateLane', {
      companyId: 'COMPANY-000001', truckId: 'TRUCK-000001', driverId: 'DRIVER-000001',
      originLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
      displayName: 'Cēsis→Rīga',
    });

    // ── Phase 9: Market regime change ──────────────────────────────
    go(e, 'REG', 'TransitionMarketRegime', { regime: 'BOOM' });
    go(e, 'UPD', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 7500, direction: 'UPWARD' });
    go(e, 'SEAS', 'AdvanceMarketSeason', { season: 'AUTUMN' });

    // ── Phase 10: Export inventory batch ─────────────────────────────
    go(e, 'DEAL2', 'CreateDeal', {
      companyId: 'COMPANY-000001', counterpartyId: 'supplier.export',
      currency: 'EUR', expectedVolumeMilliM3: 30_000, description: 'export deal', financeSourceIds: [],
    });
    go(e, 'DA2', 'ActivateDeal', { dealId: 'DEAL-000002' });
    go(e, 'LOT2', 'CreateLot', {
      dealId: 'DEAL-000002', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001',
      locationId: 'LOCATION-000004', originalVolumeMilliM3: 30_000, composition,
      freshness: 'FRESH', certainty: 'INSPECTED',
    });
    go(e, 'BATCH2', 'CreateInitialBatch', { lotId: 'LOT-000002', volumeMilliM3: 30_000, composition });

    // ── Phase 11: Export setup ─────────────────────────────────────
    go(e, 'EB', 'CreateExportBuyer', {
      configId: 'buyer.export_europe', displayName: 'Rotterdam Timber BV', fictional: true,
      buyerType: 'EXPORT_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000005',
      paymentTermsSeconds: 30_000,
    });
    go(e, 'EQ', 'CreateExportQuote', {
      portLocationId: 'LOCATION-000004', destinationLocationId: 'LOCATION-000005',
      rateMinorPerM3: 8_000, handlingCostMinor: 50_000, documentationCostMinor: 10_000,
      expiryTimestamp: 300_000,
    });
    go(e, 'EQA', 'AcceptExportQuote', { quoteId: 'EXQUOTE-000001' });
    go(e, 'EORD', 'CreateExportOrder', {
      quoteId: 'EXQUOTE-000001', exportBuyerId: 'EXBUYER-000001',
      volumeMilliM3: 30_000, batchIds: ['BATCH-000005'],
      requiredDocumentTypes: ['CERT_OF_ORIGIN', 'PHYTOSANITARY'],
    });
    go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });
    go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001', delaySeconds: 3600 });

    // ── Phase 11: Advance time ─────────────────────────────────────
    e.advanceUntil(20_000);
    go(e, 'LOADV', 'CompleteExportLoading', { orderId: 'EXORDER-000001' });
    e.advanceUntil(360_000);
    go(e, 'EACC', 'AcceptExportCargo', { orderId: 'EXORDER-000001', acceptedVolumeMilliM3: 28_500 });
    go(e, 'ESET', 'SettleExportOrder', { orderId: 'EXORDER-000001' });

    // Collect export receivable
    const exportRecv = e.finance.snapshot().receivables.find(r => r.companyId === 'COMPANY-000001' && r.status === 'OPEN');
    if (exportRecv) {
      go(e, 'RPAY', 'RecordReceivablePayment', { receivableId: exportRecv.id, amountMinor: exportRecv.principalMinor });
    }

    return collectResult(e);
  } catch (err: any) {
    const r = collectResult(e, true);
    r.error = err.message;
    r.failed = true;
    return r;
  }
}

function collectResult(e: SimulationEngine, skipInvariants = false): ScenarioResult {
  const finance = e.finance.snapshot();
  const inventory = e.inventory.snapshot();
  const company = e.finance.company('COMPANY-000001');
  let cashBalanceMinor = 0;
  if (company) {
    const cashAccount = finance.accounts.find(a => a.companyId === 'COMPANY-000001' && a.code === 'OPERATING_CASH');
    cashBalanceMinor = cashAccount ? e.finance.balance(cashAccount.id) : 0;
  }
  const receivablesMinor = finance.receivables.filter(r => r.companyId === 'COMPANY-000001' && r.status !== 'PAID').reduce((n, r) => n + r.principalMinor - r.amountPaidMinor, 0);
  const payablesMinor = finance.payables.filter(p => p.companyId === 'COMPANY-000001' && p.status !== 'PAID' && p.status !== 'CANCELLED').reduce((n, p) => n + p.principalMinor - p.amountPaidMinor, 0);
  const totalVolume = inventory.batches.reduce((n, b) => n + b.currentVolumeMilliM3, 0);
  const deliveredVolume = inventory.batches.filter(b => b.status === 'DEPLETED').reduce((n, b) => n + b.depletedVolumeMilliM3, 0);
  const exportsState = e.exports.snapshot();
  const exportedVolume = exportsState.orders.filter(o => o.status === 'SETTLED').reduce((n, o) => n + o.volumeMilliM3, 0);
  const rev = finance.transactions.filter(t => t.companyId === 'COMPANY-000001').reduce((n, t) => n + t.lines.filter(l => l.accountId.includes('.revenue')).reduce((s, l) => s + l.creditMinor - l.debitMinor, 0), 0);
  const exp = finance.transactions.filter(t => t.companyId === 'COMPANY-000001').reduce((n, t) => n + t.lines.filter(l => l.accountId.includes('.expense.operating') || l.accountId.includes('.expense.financing')).reduce((s, l) => s + l.debitMinor - l.creditMinor, 0), 0);

  const invariantFailures: string[] = [];
  if (!skipInvariants) {
    try { e.auditFingerprint(); } catch (err: any) { invariantFailures.push(err.message); }
  }

  return {
    seed: e.seed,
    stateChecksum: e.stateChecksum(),
    eventLogChecksum: e.eventLogChecksum(),
    finalGameTime: e.clock.currentGameTime,
    company: {
      cashBalanceMinor,
      receivablesMinor,
      payablesMinor,
      totalVolumeMilliM3: totalVolume,
      batchCount: inventory.batches.length,
      deliveredVolumeMilliM3: deliveredVolume,
      exportedVolumeMilliM3: exportedVolume,
    },
    ledgerResult: rev - exp,
    terminalStatus: company?.solvencyStatus ?? 'UNKNOWN',
    failed: false,
    invariantFailures,
    domainCount: Object.keys(e.authoritativeState()).length,
  };
}
