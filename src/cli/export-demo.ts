import { command, SimulationEngine } from '../core/engine.js';
import { createSave, loadSave } from '../persistence/save.js';
import { createSnapshot } from '../persistence/snapshot.js';
import { exportsSummary, exportTimeline } from '../exports/read-models.js';
import { financeHeader } from '../finance/read-models.js';

function go(e: SimulationEngine, id: string, type: string, p: any = {}) {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) console.error(`  ✗ ${type}: ${r.message}`);
  return r;
}

console.log('═══════════════════════════════════════════');
console.log('  Step 13 — Export Demo');
console.log('═══════════════════════════════════════════\n');

const e = new SimulationEngine({
  seed: 'export-demo-' + Date.now(),
  configurationBundleVersion: '1', configurationHash: 'demo', scenarioId: 'demo',
  clock: { paused: false },
});

console.log('◆ Setting up company, port, route, export buyer...');
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

// ── Quote ────────────────────────────────────────────────────────────
console.log('◆ Creating export quote...');
go(e, 'Q', 'CreateExportQuote', {
  portLocationId: 'LOCATION-000001', destinationLocationId: 'LOCATION-000002',
  rateMinorPerM3: 8_000, handlingCostMinor: 50_000, documentationCostMinor: 10_000,
  expiryTimestamp: 300_000,
});
go(e, 'QA', 'AcceptExportQuote', { quoteId: 'EXQUOTE-000001' });
console.log('   Quote accepted: €80/m³ + €500 handling + €100 docs');

// ── Inventory ─────────────────────────────────────────────────────────
console.log('\n◆ Setting up inventory for export...');
go(e, 'DL', 'CreateDeal', {
  companyId: 'COMPANY-000001', counterpartyId: 'SUPPLIER-DEMO',
  expectedVolumeMilliM3: 100_000, financeSourceIds: [], currency: 'EUR',
  description: 'Demo deal for export',
});
go(e, 'DLACT', 'ActivateDeal', { dealId: 'DEAL-000001' });
go(e, 'LOT', 'CreateLot', {
  dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001',
  custodyActorId: 'actor.demo', locationId: 'LOCATION-000001',
  originalVolumeMilliM3: 50_000, freshness: 'FRESH', certainty: 'INSPECTED',
  composition: {
    species: [{ id: 'species.birch', basisPoints: 10000 }],
    assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
    quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
  },
});
go(e, 'BATCH', 'CreateInitialBatch', {
  lotId: 'LOT-000001', volumeMilliM3: 50_000,
  composition: {
    species: [{ id: 'species.birch', basisPoints: 10000 }],
    assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
    quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
  },
});
console.log('   Inventory: 50 m³ batch created');

// ── Order ────────────────────────────────────────────────────────────
console.log('\n◆ Creating export order (30 m³ to Rotterdam)...');
go(e, 'ORD', 'CreateExportOrder', {
  quoteId: 'EXQUOTE-000001', exportBuyerId: 'EXBUYER-000001',
  volumeMilliM3: 30_000, batchIds: ['BATCH-000001'],
  requiredDocumentTypes: ['CERT_OF_ORIGIN', 'PHYTOSANITARY'],
});

// ── Documents ────────────────────────────────────────────────────────
console.log('\n◆ Validating export documents...');
go(e, 'DOC', 'ValidateExportDocuments', { orderId: 'EXORDER-000001' });

// ── Slot ─────────────────────────────────────────────────────────────
console.log('◆ Confirming vessel slot...');
go(e, 'SLOT', 'ConfirmExportSlot', { orderId: 'EXORDER-000001', delaySeconds: 3600 });

// ── Advance to loading ──────────────────────────────────────────────
console.log('◆ Loading vessel...');
e.advanceUntil(e.clock.currentGameTime + 5000);

// ── Complete loading → depart → schedule arrival ────────────────────
go(e, 'LOAD', 'CompleteExportLoading', { orderId: 'EXORDER-000001' });
console.log('   Vessel departed');

// ── Advance to arrival ──────────────────────────────────────────────
const arrivalEvent = e.queue.snapshot().find(x => x.eventType === 'ExportVesselArrived');
const arrivalTime = arrivalEvent!.scheduledGameTime;
const travelDays = Math.floor((arrivalTime - e.clock.currentGameTime) / 86400);
console.log(`   Sailing to Rotterdam (~${travelDays} days)...`);
e.advanceUntil(arrivalTime);
console.log('   Vessel arrived');

// ── Acceptance ──────────────────────────────────────────────────────
console.log('\n◆ Export buyer accepts cargo...');
go(e, 'ACC', 'AcceptExportCargo', { orderId: 'EXORDER-000001', acceptedVolumeMilliM3: 28_500 });
console.log(`   Accepted: 28.5 m³, rejected: 1.5 m³`);

// ── Settlement ──────────────────────────────────────────────────────
console.log('◆ Settling export order...');
go(e, 'SETTLE', 'SettleExportOrder', { orderId: 'EXORDER-000001' });
const order = e.exports.order('EXORDER-000001')!;
console.log(`   Revenue receivable: €${(order.totalRevenueMinor / 100).toFixed(2)}`);
console.log(`   Port handling payable: €${((order.handlingCostMinor + order.documentationCostMinor) / 100).toFixed(2)}`);

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('  Export Summary');
console.log('═══════════════════════════════════════════');
for (const line of exportsSummary(e)) console.log(`  ${line}`);
for (const line of exportTimeline(e, 'EXORDER-000001')) console.log(`  ${line}`);

const header = financeHeader(e, 'COMPANY-000001');
console.log(`  Cash balance: €${(header.cashBalanceMinor / 100).toFixed(2)}`);
console.log(`  Receivables: €${(header.receivablesMinor / 100).toFixed(2)}`);

const payable = e.finance.snapshot().payables.find(p => p.counterpartyId === 'port.fictional');
if (payable) console.log(`  Port cost payable: €${(payable.principalMinor / 100).toFixed(2)}`);

// ── Save/Load check ─────────────────────────────────────────────────
const save = createSave(e, createSnapshot(e));
const loaded = loadSave(save);
console.log(`\n  Save/load checksum match: ${loaded.stateChecksum() === e.stateChecksum() ? '✓' : '✗'}`);
console.log(`  Core version: ${save.coreVersion}`);
console.log(`  Save schema: ${save.saveSchemaVersion}`);
console.log('═══════════════════════════════════════════\n');
