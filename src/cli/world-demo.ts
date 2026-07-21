import { SimulationEngine, command } from '../core/engine.js';
import { setupAutonomousScheduler } from '../scheduler/commands.js';
import { createSave, loadSave } from '../persistence/save.js';
import { createSnapshot } from '../persistence/snapshot.js';

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) => {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) console.error(`  ✗ ${type}: ${r.message}`);
  return r;
};

function setup(e: SimulationEngine) {
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 3_000_000 });
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

  go(e, 'EMP', 'CreateEmployee', {
    companyId: 'COMPANY-000001', displayName: 'Pēteris Ozols', role: 'YARD_WORKER', wageMinorPerHour: 1_200,
  });
  go(e, 'YD', 'CreateYard', {
    companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
    displayName: 'Cēsis yard', totalCapacityMilliM3: 100_000,
    storageCostMinorPerTickPerM3: 1, sortingCostMinorPerM3: 3_000,
  });

  go(e, 'MKT', 'CreateMarket', {
    regime: 'NORMAL', season: 'SUMMER',
    drivers: [{ displayName: 'Demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000, direction: 'STABLE' }],
  });
}

console.log('═══════════════════════════════════════════');
console.log('  Phase 2 — The World Ticks Demo');
console.log('═══════════════════════════════════════════\n');

const e = new SimulationEngine({
  seed: 'world-demo-' + Date.now(),
  configurationBundleVersion: '1', configurationHash: 'demo', scenarioId: 'demo',
  clock: { paused: false },
});

setup(e);
setupAutonomousScheduler(e);

const days = parseInt(process.argv[2] ?? '7', 10);
const ticks = days * 24;
console.log(`  Advancing ${days} game days (${ticks} ticks)...\n`);
e.advanceFixedTicks(ticks);

// Report
const fin = e.finance.snapshot();
const cashAccount = fin.accounts.find(a => a.companyId === 'COMPANY-000001' && a.code === 'OPERATING_CASH');
const cash = cashAccount ? e.finance.balance(cashAccount.id) : 0;
const offers = e.suppliers.snapshot().offers;
const buyer = e.buyers.buyer('BUYER-000001');
const priceCards = e.buyers.snapshot().priceCards;
const employees = e.operations.snapshot().employees;
const yards = e.operations.snapshot().yards;

console.log('  ── After autonomous world ──');
console.log(`  Game time:         ${e.clock.currentGameTime}s (${Math.floor(e.clock.currentGameTime / 86400)} days)`);
console.log(`  Cash:              €${(cash / 100).toFixed(2)}`);
console.log(`  Buyer stock:       ${buyer?.stockMilliM3 ?? 0} m³`);
console.log(`  Buyer hunger:      ${buyer?.hungerBasisPoints ?? 0} bp`);
console.log(`  Active price cards: ${priceCards.filter(pc => pc.status === 'ACTIVE').length}`);
console.log(`  Offers generated:  ${offers.length}`);
console.log(`  Offers expired:    ${offers.filter(o => o.status === 'EXPIRED').length}`);
console.log(`  Offers accepted:   ${offers.filter(o => o.status === 'ACCEPTED').length}`);
console.log(`  Employees:         ${employees.length}`);
console.log(`  Yards:             ${yards.length}`);
console.log(`  State checksum:    ${e.stateChecksum()}`);
console.log(`  Event log:         ${e.eventLogChecksum()}`);

const save = createSave(e, createSnapshot(e));
const loaded = loadSave(save);
console.log(`  Save/load match:   ${loaded.stateChecksum() === e.stateChecksum() ? '✓' : '✗'}`);
console.log('');
