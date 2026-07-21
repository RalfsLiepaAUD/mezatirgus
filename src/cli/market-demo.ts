import { command, SimulationEngine } from '../core/engine.js';
import { marketReport, marketSummary } from '../market/read-models.js';
import { createSave, loadSave } from '../persistence/save.js';
import { createSnapshot } from '../persistence/snapshot.js';
function go(e: SimulationEngine, id: string, type: string, p: any = {}) {
  const r = e.execute(command(id, type, e, p));
  if (!r.accepted) console.error(`  ✗ ${type}: ${r.message}`);
  return r;
}

console.log('═══════════════════════════════════════════');
console.log('  Step 14 — Market Demo');
console.log('═══════════════════════════════════════════\n');

const e = new SimulationEngine({
  seed: 'market-demo-' + Date.now(),
  configurationBundleVersion: '1', configurationHash: 'demo', scenarioId: 'demo',
  clock: { paused: false },
});

console.log('◆ Initialising company and market...');
go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 5_000_000 });

// ── Create market ────────────────────────────────────────────────────
console.log('\n◆ Creating market with three drivers...');
go(e, 'MKT', 'CreateMarket', {
  regime: 'NORMAL',
  season: 'SUMMER',
  drivers: [
    { displayName: 'Domestic demand (pulp)', category: 'DOMESTIC_DEMAND', valueBasisPoints: 6000, weightBasisPoints: 7000, direction: 'STABLE' },
    { displayName: 'Export demand (logs)', category: 'EXPORT_DEMAND', valueBasisPoints: 4500, weightBasisPoints: 5000, direction: 'UPWARD' },
    { displayName: 'Supply pressure', category: 'SUPPLY_PRESSURE', valueBasisPoints: 3000, weightBasisPoints: 4000, direction: 'DOWNWARD' },
  ],
});

let r = marketReport(e);
console.log(`  Regime: ${r.regime}, Season: ${r.season}`);
console.log(`  Drivers: ${r.driverCount}`);

// ── Record observation ───────────────────────────────────────────────
console.log('\n◆ Recording market observation...');
go(e, 'OBS1', 'RecordMarketObservation', {});
console.log('  Observation recorded:');
for (const line of marketSummary(e)) console.log(`  ${line}`);

// ── Change a driver ──────────────────────────────────────────────────
console.log('\n◆ Updating export demand driver (demand rising)...');
go(e, 'UPDATE', 'UpdateMarketDriver', {
  driverId: 'MARKET_DRIVER_000002',
  valueBasisPoints: 7200,
  direction: 'UPWARD',
});
r = marketReport(e);
console.log(`  Export demand driver: ${r.drivers[1]!.valueBasisPoints}bp, ${r.drivers[1]!.direction}`);

// ── Record another observation ───────────────────────────────────────
console.log('\n◆ Recording second observation...');
go(e, 'OBS2', 'RecordMarketObservation', {});

// ── Regime change ────────────────────────────────────────────────────
console.log('\n◆ Transitioning to BOOM regime...');
go(e, 'REGIME', 'TransitionMarketRegime', { regime: 'BOOM' });
r = marketReport(e);
console.log(`  New regime: ${r.regime}`);

// ── Advance season ───────────────────────────────────────────────────
console.log('\n◆ Advancing to autumn...');
go(e, 'SEAS', 'AdvanceMarketSeason', { season: 'AUTUMN' });
r = marketReport(e);
console.log(`  New season: ${r.season}`);

// ── Record third observation ─────────────────────────────────────────
console.log('\n◆ Recording third observation (BOOM, autumn)...');
go(e, 'OBS3', 'RecordMarketObservation', {});

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('  Market Summary');
console.log('═══════════════════════════════════════════');
for (const line of marketSummary(e)) console.log(`  ${line}`);

// Historic observations are immutable
const obs = e.markets.snapshot().observations;
console.log(`\n  Observations recorded: ${obs.length}`);
for (let i = 0; i < obs.length; i++) {
  const o = obs[i]!;
  console.log(`  [#${i + 1}] t=${o.timestamp} regime=${o.reportedRegime} season=${o.season}`);
}

// ── Save/Load check ──────────────────────────────────────────────────
const save = createSave(e, createSnapshot(e));
const loaded = loadSave(save);
console.log(`\n  Save/load checksum match: ${loaded.stateChecksum() === e.stateChecksum() ? '✓' : '✗'}`);
console.log(`  Core version: ${save.coreVersion}`);
console.log(`  Save schema: ${save.saveSchemaVersion}`);
console.log('═══════════════════════════════════════════\n');
