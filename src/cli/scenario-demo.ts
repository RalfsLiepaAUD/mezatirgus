import { createEngine, runCanonicalScenario } from '../headless/scenario.js';

function main() {
  const seed = process.argv[2] ?? 'scenario-demo';
  const e = createEngine(seed);
  const result = runCanonicalScenario(e);

  console.log('═══════════════════════════════════════════');
  console.log('  Step 15 — Canonical Scenario Demo');
  console.log('═══════════════════════════════════════════\n');
  console.log(`  Seed:                    ${result.seed}`);
  console.log(`  State checksum:          ${result.stateChecksum}`);
  console.log(`  Event log checksum:      ${result.eventLogChecksum}`);
  console.log(`  Final game time:         ${result.finalGameTime}s`);
  console.log(`  Domains:                 ${result.domainCount}`);
  console.log(`  Terminal status:         ${result.terminalStatus}`);
  console.log('');
  console.log('  ── Company ──');
  console.log(`  Cash balance:            €${(result.company.cashBalanceMinor / 100).toFixed(2)}`);
  console.log(`  Receivables (open):      €${(result.company.receivablesMinor / 100).toFixed(2)}`);
  console.log(`  Payables (open):         €${(result.company.payablesMinor / 100).toFixed(2)}`);
  console.log(`  Ledger result:           €${(result.ledgerResult / 100).toFixed(2)}`);
  console.log('');
  console.log('  ── Inventory ──');
  console.log(`  Batches:                 ${result.company.batchCount}`);
  console.log(`  Volume remaining:        ${(result.company.totalVolumeMilliM3 / 1000).toFixed(1)} m³`);
  console.log(`  Delivered:               ${(result.company.deliveredVolumeMilliM3 / 1000).toFixed(1)} m³`);
  console.log(`  Exported:                ${(result.company.exportedVolumeMilliM3 / 1000).toFixed(1)} m³`);
  console.log(`  Invariant failures:      ${result.invariantFailures.length}`);
  console.log(`  Failed:                  ${result.failed}`);
  if (result.error) console.log(`  Error:                   ${result.error}`);
  console.log('═══════════════════════════════════════════\n');
}

main();
