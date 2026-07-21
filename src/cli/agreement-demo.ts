import { command, SimulationEngine } from '../core/engine.js';
import { createSave, loadSave } from '../persistence/save.js';
import { createSnapshot } from '../persistence/snapshot.js';
import { agreementList, agreementsSummary } from '../contracts/read-models.js';
import { financeHeader } from '../finance/read-models.js';

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.pulpwood', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

function go(e: SimulationEngine, id: string, type: string, p: any = {}) {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) console.error(`  ✗ ${type}: ${r.message}`);
  return r;
}

console.log('═══════════════════════════════════════════');
console.log('  Step 12 — Frame Agreement Demo');
console.log('═══════════════════════════════════════════\n');

const e = new SimulationEngine({
  seed: 'agreement-demo-' + Date.now(),
  configurationBundleVersion: '1', configurationHash: 'demo', scenarioId: 'demo',
  clock: { paused: false },
});

console.log('◆ Setting up company and buyer...');
go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 5_000_000 });
go(e, 'LOC', 'CreateLocation', { displayName: 'Rīga yard', countryCode: 'LV', regionCode: 'RIGA', roles: ['BUYER'] });
go(e, 'B', 'CreateBuyer', {
  configId: 'buyer.gauja_sawmill', displayName: 'Gauja Sawmill', fictional: true,
  buyerType: 'CONIFER_SAWMILL', companyId: 'COMPANY-000001', locationId: 'LOCATION-000001',
  compatibility: [{ speciesId: 'species.birch', assortmentId: 'assortment.pulpwood', accepted: true }],
  capacityMilliM3: 200_000, stockMilliM3: 100_000, targetStockMilliM3: 100_000, consumptionMilliM3PerDay: 1000,
  paymentTermsSeconds: 14_400, instantPaymentDiscountMinorPerM3: 200,
  measurementBiasMinBasisPoints: 0, measurementBiasMaxBasisPoints: 200,
  strictnessBasisPoints: 5000, fictionalBehaviorNote: 'demo buyer',
});

// ── Create agreement ──────────────────────────────────────────────────
console.log('◆ Creating frame agreement...');
go(e, 'AG', 'CreateFrameAgreement', {
  companyId: 'COMPANY-000001', counterpartyType: 'BUYER', counterpartyId: 'BUYER-000001',
  displayName: 'Birch pulpwood supply Q3', validFromTimestamp: 0, validUntilTimestamp: 100_000,
  committedVolumeMilliM3: 50_000, toleranceBasisPoints: 1_000,
  priceBasis: 'FIXED_RATE', fixedRateMinorPerM3: 5_500,
  paymentTermsSeconds: 7_200, currency: 'EUR',
  requiredSpeciesIds: ['species.birch'], requiredAssortmentIds: ['assortment.pulpwood'],
});

go(e, 'ACT', 'ActivateFrameAgreement', { agreementId: 'AGREEMENT-000001' });
console.log('   Agreement activated, 50 m³ committed at €55/m³');

// ── First delivery ────────────────────────────────────────────────────
console.log('\n◆ Making first delivery (10 m³)...');
go(e, 'DEAL', 'CreateDeal', { companyId: 'COMPANY-000001', counterpartyId: 'supplier.demo', currency: 'EUR', expectedVolumeMilliM3: 30_000, description: 'Birch pulpwood', financeSourceIds: [] });
go(e, 'DA', 'ActivateDeal', { dealId: 'DEAL-000001' });
go(e, 'LOT', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 10_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
go(e, 'BATCH', 'CreateInitialBatch', { lotId: 'LOT-000001', volumeMilliM3: 10_000, composition });
go(e, 'LOAD', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
go(e, 'ALLOC', 'AllocateBatchToLoad', { batchId: 'BATCH-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
go(e, 'DEL', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000001', volumeMilliM3: 10_000 });
go(e, 'ACC', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000001', acceptedVolumeMilliM3: 10_000 });
go(e, 'SETTLE', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000001' });
console.log(`   Receivable created: €${(e.finance.receivable('RECEIVABLE-000001')!.principalMinor / 100).toFixed(2)}`);

// ── Second delivery ──────────────────────────────────────────────────
console.log('\n◆ Making second delivery (40 m³, completing commitment)...');
go(e, 'LOT2', 'CreateLot', { dealId: 'DEAL-000001', ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', locationId: 'LOCATION-000001', originalVolumeMilliM3: 40_000, composition, freshness: 'FRESH', certainty: 'ESTIMATED' });
go(e, 'BATCH2', 'CreateInitialBatch', { lotId: 'LOT-000002', volumeMilliM3: 40_000, composition });
go(e, 'LOAD2', 'CreateLoad', { ownerCompanyId: 'COMPANY-000001', custodyActorId: 'COMPANY-000001', originLocationId: 'LOCATION-000001' });
go(e, 'ALLOC2', 'AllocateBatchToLoad', { batchId: 'BATCH-000002', loadId: 'LOAD-000002', volumeMilliM3: 40_000 });
go(e, 'DEL2', 'RecordAgreementDelivery', { agreementId: 'AGREEMENT-000001', loadId: 'LOAD-000002', volumeMilliM3: 40_000 });
go(e, 'ACC2', 'AcceptAgreementDelivery', { deliveryId: 'DELIVERY-000002', acceptedVolumeMilliM3: 40_000 });
go(e, 'SETTLE2', 'SettleAgreementDelivery', { deliveryId: 'DELIVERY-000002' });

// ── Volume settlement ─────────────────────────────────────────────────
console.log('\n◆ Settling agreement volume (checking tolerance)...');
go(e, 'VOL', 'SettleAgreementVolume', { agreementId: 'AGREEMENT-000001', bonusRateMinorPerM3: 200 });

// ── Summary ───────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('  Agreement Summary');
console.log('═══════════════════════════════════════════');
for (const line of agreementsSummary(e)) console.log(`  ${line}`);
const header = financeHeader(e, 'COMPANY-000001');
console.log(`  Cash balance: €${(header.cashBalanceMinor / 100).toFixed(2)}`);
console.log(`  Total receivables: ${header.receivablesMinor > 0 ? '€' + (header.receivablesMinor / 100).toFixed(2) : '0'}`);

// ── Save/Load check ─────────────────────────────────────────────────
const save = createSave(e, createSnapshot(e));
const loaded = loadSave(save);
console.log(`\n  Save/load checksum match: ${loaded.stateChecksum() === e.stateChecksum() ? '✓' : '✗'}`);
console.log(`  Core version: ${save.coreVersion}`);
console.log(`  Save schema: ${save.saveSchemaVersion}`);
console.log('═══════════════════════════════════════════\n');
