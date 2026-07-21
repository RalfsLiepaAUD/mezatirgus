import { createEngine, runCanonicalScenario, type ScenarioResult } from '../headless/scenario.js';

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

interface RunSummary {
  runNumber: number;
  seed: string;
  stateChecksum: string;
  eventLogChecksum: string;
  finalGameTime: number;
  cashBalanceMinor: number;
  receivablesMinor: number;
  payablesMinor: number;
  ledgerResult: number;
  terminalStatus: string;
  batchCount: number;
  totalVolumeMilliM3: number;
  deliveredVolumeMilliM3: number;
  exportedVolumeMilliM3: number;
  invariantFailures: string[];
  failed: boolean;
  error?: string;
}

function main() {
  const args = parseArgs();
  const seed = args.seed ?? 'headless-default';
  const runs = parseInt(args.runs ?? '1', 10);
  const debug = args.debug === 'true';

  if (!Number.isSafeInteger(runs) || runs < 1) {
    console.error(JSON.stringify({ error: 'runs must be a positive integer', failed: true }));
    process.exit(1);
  }

  const summaries: RunSummary[] = [];
  let anyFailed = false;

  for (let i = 0; i < runs; i++) {
    const runSeed = runs > 1 ? `${seed}-${i + 1}` : seed;
    const e = createEngine(runSeed);
    const result = runCanonicalScenario(e);

    const summary: RunSummary = {
      runNumber: i + 1,
      seed: runSeed,
      stateChecksum: result.stateChecksum,
      eventLogChecksum: result.eventLogChecksum,
      finalGameTime: result.finalGameTime,
      cashBalanceMinor: result.company.cashBalanceMinor,
      receivablesMinor: result.company.receivablesMinor,
      payablesMinor: result.company.payablesMinor,
      ledgerResult: result.ledgerResult,
      terminalStatus: result.terminalStatus,
      batchCount: result.company.batchCount,
      totalVolumeMilliM3: result.company.totalVolumeMilliM3,
      deliveredVolumeMilliM3: result.company.deliveredVolumeMilliM3,
      exportedVolumeMilliM3: result.company.exportedVolumeMilliM3,
      invariantFailures: result.invariantFailures,
      failed: result.failed,
    };
    if (result.error) summary.error = result.error;
    summaries.push(summary);
    if (result.failed) anyFailed = true;
  }

  const output = {
    configurationHash: 'scenario-v1',
    runCount: runs,
    baseSeed: seed,
    debug,
    runs: summaries,
    anyFailed,
  };

  if (!debug) {
    for (const s of summaries) {
      if (s.invariantFailures.length) {
        s.invariantFailures = ['REDACTED'];
      }
    }
  }

  console.log(JSON.stringify(output, null, 2));
  if (anyFailed) process.exit(1);
}

main();
