import { SimulationEngine, command } from '../core/engine.js';
import { setupAutonomousScheduler } from '../scheduler/commands.js';
import { TICK_DURATION_SECONDS } from '../core/constants.js';

function go(e: SimulationEngine, id: string, type: string, p: any = {}) {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) throw new Error(`${type} rejected: ${r.message}`);
  return r;
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) { args[arg.slice(2, eq)] = arg.slice(eq + 1); }
      else { args[arg.slice(2)] = process.argv[++i] ?? ''; }
    }
  }
  return args;
}

function setup(e: SimulationEngine) {
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 3_000_000 });
  go(e, 'C2', 'CreateCompany', { displayName: 'Ziemeļu Koks', reputationBasisPoints: 5000 });
  go(e, 'CASH2', 'CreateOpeningBalance', { companyId: 'COMPANY-000002', amountMinor: 5_000_000 });
  go(e, 'Y', 'CreateLocation', { displayName: 'Cēsis yard', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['YARD'] });
  go(e, 'B', 'CreateLocation', { displayName: 'Rīga buyer', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
  go(e, 'F', 'CreateLocation', { displayName: 'Forest roadside', countryCode: 'LV', regionCode: 'VIDZEME', roles: ['ROADSIDE'] });
  go(e, 'P', 'CreateLocation', { displayName: 'Rīga port', countryCode: 'LV', regionCode: 'RIGA', roles: ['PORT'] });
  go(e, 'R1', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000003', toLocationId: 'LOCATION-000001', accessClass: 'GRAVEL', distanceMetres: 80_000, travelSeconds: 7200, directed: true });
  go(e, 'R2', 'CreateRouteEdge', { fromLocationId: 'LOCATION-000001', toLocationId: 'LOCATION-000002', accessClass: 'PAVED', distanceMetres: 100_000, travelSeconds: 5400, directed: true });
  go(e, 'B1', 'CreateBuyer', {
    configId: 'buyer.gauja_sawmill', displayName: 'Gauja Sawmill', fictional: true,
    buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000002',
    compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', accepted: true }],
    capacityMilliM3: 100_000, stockMilliM3: 80_000, targetStockMilliM3: 50_000, consumptionMilliM3PerDay: 500,
    paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200,
    measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200, strictnessBasisPoints: 5000,
  });
  go(e, 'PC', 'PublishBuyerPriceCard', {
    buyerId: 'BUYER-000001', speciesId: 'species.birch', assortmentId: 'assortment.sawlogs', baseRateMinorPerM3: 6_000,
  });
  go(e, 'SUP', 'CreateSupplier', {
    configId: 'supplier.liepa_owner', displayName: 'Liepa Forest', fictional: true,
    archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000001', locationId: 'LOCATION-000003',
    channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'],
    suppliedAssortmentIds: ['assortment.sawlogs'], paymentExpectationSeconds: 7200,
    documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000,
    initialRelationshipBasisPoints: 5000,
  });
  go(e, 'CONT', 'CreateSupplierContact', {
    supplierId: 'SUPPLIER-000001', displayName: 'Jānis Bērziņš', role: 'OWNER',
    phoneNumber: '+37129123456', email: 'janis@liepa.lv',
  });
  go(e, 'SUP2', 'CreateSupplier', {
    configId: 'supplier.liepa_owner', displayName: 'Gaujas Mežs', fictional: true,
    archetype: 'PRIVATE_FOREST_OWNER', companyId: 'COMPANY-000002', locationId: 'LOCATION-000003',
    channels: ['PRIVATE_ROADSIDE_OFFER'], suppliedSpeciesIds: ['species.birch'],
    suppliedAssortmentIds: ['assortment.sawlogs'], paymentExpectationSeconds: 7200,
    documentReliabilityBasisPoints: 5000, freshnessAnswerReliabilityBasisPoints: 5000,
    initialRelationshipBasisPoints: 5000,
  });
  go(e, 'CONT2', 'CreateSupplierContact', {
    supplierId: 'SUPPLIER-000002', displayName: 'Kārlis Zariņš', role: 'OWNER',
    phoneNumber: '+37129876543', email: 'karlis@gaujasmezs.lv',
  });
  go(e, 'EMP', 'CreateEmployee', {
    companyId: 'COMPANY-000001', displayName: 'Pēteris Ozols', role: 'YARD_WORKER', wageMinorPerHour: 1_200,
  });
  go(e, 'YD', 'CreateYard', {
    companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    displayName: 'Cēsis yard', totalCapacityMilliM3: 100_000,
    storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000, sortingCapable: true,
  });
  go(e, 'MKT', 'CreateMarket', {
    regime: 'NORMAL', season: 'SUMMER',
    drivers: [{ displayName: 'Demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
  });
}

function main() {
  const args = parseArgs();
  const seed = args.seed ?? 'autonomous-default';
  const days = parseInt(args.days ?? '21', 10);
  const debug = args.debug === 'true';

  if (!Number.isSafeInteger(days) || days < 1) {
    console.error(JSON.stringify({ error: 'days must be a positive integer', failed: true }));
    process.exit(1);
  }

  const e = new SimulationEngine({
    seed, configurationBundleVersion: '1', configurationHash: 'autonomous-v1',
    scenarioId: 'autonomous', clock: { paused: false },
  });

  setup(e);
  setupAutonomousScheduler(e);

  const ticks = days * 24;
  e.advanceFixedTicks(ticks);

  const fin = e.finance.snapshot();
  const cashId = fin.accounts.find(a => a.companyId === 'COMPANY-000001' && a.code === 'OPERATING_CASH');
  const cash = cashId ? e.finance.balance(cashId.id) : 0;
  const payables = fin.payables.filter(p => p.companyId === 'COMPANY-000001' && p.status !== 'PAID' && p.status !== 'CANCELLED');
  const offers = e.suppliers.snapshot().offers;
  const buyer = e.buyers.buyer('BUYER-000001');
  const priceCards = e.buyers.snapshot().priceCards;

  interface RunOutput {
    seed: string; days: number; gameTime: number;
    cashMinor: number; payablesMinor: number;
    buyerStockMilliM3: number; buyerHungerBasisPoints: number;
    activePriceCards: number;
    offersTotal: number; offersExpired: number; offersAccepted: number;
    stateChecksum: string; eventLogChecksum: string;
  }

  const output: RunOutput = {
    seed, days,
    gameTime: e.clock.currentGameTime,
    cashMinor: cash,
    payablesMinor: payables.reduce((n, p) => n + p.principalMinor - p.amountPaidMinor, 0),
    buyerStockMilliM3: buyer?.stockMilliM3 ?? 0,
    buyerHungerBasisPoints: buyer?.hungerBasisPoints ?? 0,
    activePriceCards: priceCards.filter(pc => pc.status === 'ACTIVE').length,
    offersTotal: offers.length,
    offersExpired: offers.filter(o => o.status === 'EXPIRED').length,
    offersAccepted: offers.filter(o => o.status === 'ACCEPTED').length,
    stateChecksum: e.stateChecksum(),
    eventLogChecksum: e.eventLogChecksum(),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
