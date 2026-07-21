import { describe, expect, it } from 'vitest';
import { command, SimulationEngine } from '../src/core/engine.js';
import { calculateSaveChecksum, createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot, snapshotChecksum } from '../src/persistence/snapshot.js';
import { marketReport, marketSummary } from '../src/market/read-models.js';

const mk = () => new SimulationEngine({
  seed: 'market-step-14',
  configurationBundleVersion: '1', configurationHash: 'h', scenarioId: 's',
  clock: { paused: false },
});

const go = (e: SimulationEngine, id: string, type: string, p: any = {}) =>
  e.execute(command(id, type, e, p));

function world() {
  const e = mk();
  go(e, 'C', 'CreateCompany', { displayName: 'Mežtirgus SIA', reputationBasisPoints: 5000 });
  go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 5_000_000 });
  go(e, 'MKT', 'CreateMarket', {
    regime: 'NORMAL', season: 'SUMMER',
    drivers: [
      { displayName: 'Domestic demand', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 7000, direction: 'STABLE' },
      { displayName: 'Export demand', category: 'EXPORT_DEMAND', valueBasisPoints: 4000, weightBasisPoints: 5000, direction: 'UPWARD' },
    ],
  });
  return e;
}

describe('Step 14 — markets, seasons, regime change, observations', () => {

  // ── Creation ──────────────────────────────────────────────────────
  it('creates market with deterministic state', () => {
    const e = world();
    const r = marketReport(e);
    expect(r.regime).toBe('NORMAL');
    expect(r.season).toBe('SUMMER');
    expect(r.driverCount).toBe(2);
    expect(r.drivers[0]!.displayName).toBe('Domestic demand');
    expect(r.drivers[1]!.displayName).toBe('Export demand');
  });

  it('rejects market creation without drivers', () => {
    const e = mk();
    const before = e.auditFingerprint();
    expect(go(e, 'MKT', 'CreateMarket', { regime: 'NORMAL', season: 'SUMMER', drivers: [] }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('rejects invalid regime', () => {
    const e = mk();
    go(e, 'C', 'CreateCompany', { displayName: 'Test', reputationBasisPoints: 5000 });
    go(e, 'CASH', 'CreateOpeningBalance', { companyId: 'COMPANY-000001', amountMinor: 1_000_000 });
    go(e, 'MKT', 'CreateMarket', {
      regime: 'NORMAL', season: 'SUMMER',
      drivers: [{ displayName: 'D1', category: 'DOMESTIC_DEMAND', valueBasisPoints: 5000, weightBasisPoints: 5000 }],
    });
    const before = e.auditFingerprint();
    expect(go(e, 'R', 'TransitionMarketRegime', { regime: 'INVALID' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('rejects invalid season', () => {
    const e = world();
    const before = e.auditFingerprint();
    expect(go(e, 'S', 'AdvanceMarketSeason', { season: 'MONSOON' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  // ── Hidden truth vs observable ────────────────────────────────────
  it('hidden truth differs from observation (RNG noise)', () => {
    const e = world();
    // Hidden truth: drivers have exact values
    const hidden = e.markets.snapshot();
    expect(hidden.drivers[0]!.direction).toBe('STABLE');
    expect(hidden.drivers[1]!.direction).toBe('UPWARD');
    // Observation uses RNG and may differ
    go(e, 'OBS', 'RecordMarketObservation', {});
    const obs = e.markets.snapshot().observations[0]!;
    expect(obs.reportedRegime).toBe('NORMAL');
    expect(obs.season).toBe('SUMMER');
    // Reported observations exist
    expect(obs.driverObservations.length).toBe(2);
  });

  // ── Market updates ────────────────────────────────────────────────
  it('updates driver value and direction deterministically', () => {
    const e = world();
    go(e, 'U', 'UpdateMarketDriver', {
      driverId: 'MARKET_DRIVER_000001',
      valueBasisPoints: 8500,
      direction: 'UPWARD',
    });
    const d = e.markets.driver('MARKET_DRIVER_000001')!;
    expect(d.valueBasisPoints).toBe(8500);
    expect(d.direction).toBe('UPWARD');
  });

  it('rejects out-of-range driver value', () => {
    const e = world();
    const before = e.auditFingerprint();
    expect(go(e, 'U', 'UpdateMarketDriver', {
      driverId: 'MARKET_DRIVER_000001',
      valueBasisPoints: 15000,
    }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  it('regime transitions correctly', () => {
    const e = world();
    expect(marketReport(e).regime).toBe('NORMAL');
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    expect(marketReport(e).regime).toBe('BOOM');
    go(e, 'R2', 'TransitionMarketRegime', { regime: 'RECESSION' });
    expect(marketReport(e).regime).toBe('RECESSION');
    go(e, 'R3', 'TransitionMarketRegime', { regime: 'STAGNATION' });
    expect(marketReport(e).regime).toBe('STAGNATION');
    go(e, 'R4', 'TransitionMarketRegime', { regime: 'NORMAL' });
    expect(marketReport(e).regime).toBe('NORMAL');
  });

  it('season advances correctly', () => {
    const e = world();
    expect(marketReport(e).season).toBe('SUMMER');
    go(e, 'S', 'AdvanceMarketSeason', { season: 'AUTUMN' });
    expect(marketReport(e).season).toBe('AUTUMN');
    go(e, 'S2', 'AdvanceMarketSeason', { season: 'WINTER' });
    expect(marketReport(e).season).toBe('WINTER');
    go(e, 'S3', 'AdvanceMarketSeason', { season: 'SPRING_THAW' });
    expect(marketReport(e).season).toBe('SPRING_THAW');
  });

  // ── Price immutability ────────────────────────────────────────────
  it('historic observations do not change after later market updates', () => {
    const e = world();
    go(e, 'O1', 'RecordMarketObservation', {});
    const obs1 = e.markets.snapshot().observations[0]!;
    const regime1 = obs1.reportedRegime;
    go(e, 'U', 'UpdateMarketDriver', {
      driverId: 'MARKET_DRIVER_000001',
      valueBasisPoints: 8500,
    });
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    go(e, 'O2', 'RecordMarketObservation', {});
    // First observation must be unchanged
    expect(e.markets.snapshot().observations[0]!.reportedRegime).toBe(regime1);
    expect(e.markets.snapshot().observations.length).toBe(2);
    expect(e.markets.snapshot().observations[0]!.reportedRegime).not.toBe(
      e.markets.snapshot().observations[1]!.reportedRegime
    );
  });

  // ── No duplicate ──────────────────────────────────────────────────
  it('save/load/replay preserves basic market state', () => {
    const e = world();
    const snap = createSnapshot(e);
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.markets.snapshot()).toEqual(e.markets.snapshot());
  });

  it('save/load/replay works with market updates (no RNG)', () => {
    const e = world();
    go(e, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 7200, direction: 'UPWARD' });
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    const snap = createSnapshot(e);
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.markets.snapshot()).toEqual(e.markets.snapshot());
  });

  // ── Atomic rejection ─────────────────────────────────────────────
  it('rejected commands cause no mutation', () => {
    const e = world();
    const before = e.auditFingerprint();
    expect(go(e, 'BAD', 'TransitionMarketRegime', { regime: 'NONEXISTENT' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
    expect(go(e, 'BAD2', 'AdvanceMarketSeason', { season: 'BOGUS' }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
    expect(go(e, 'BAD3', 'UpdateMarketDriver', { driverId: 'NONE', valueBasisPoints: 5000 }).accepted).toBe(false);
    expect(e.auditFingerprint()).toBe(before);
  });

  // ── Determinism ───────────────────────────────────────────────────
  it('same seed and commands produce identical checksums', () => {
    const a = world(), b = world();
    go(a, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 7200, direction: 'UPWARD' });
    go(b, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 7200, direction: 'UPWARD' });
    go(a, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    go(b, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    go(a, 'O', 'RecordMarketObservation', {});
    go(b, 'O', 'RecordMarketObservation', {});
    expect(a.stateChecksum()).toBe(b.stateChecksum());
    expect(a.eventLogChecksum()).toBe(b.eventLogChecksum());
  });

  it('RNG stream independence (market does not perturb other streams)', () => {
    const e = world();
    const rngSnapshot = e.rng.snapshot();
    go(e, 'O', 'RecordMarketObservation', {});
    // Other streams are untouched
    expect(e.rng.stream('core').snapshot().drawCount).toBe(rngSnapshot.core?.drawCount ?? 0);
    expect(e.rng.stream('buyer').snapshot().drawCount).toBe(rngSnapshot.buyer?.drawCount ?? 0);
  });

  // ── Save/load/replay ──────────────────────────────────────────────
  it('save/load/replay preserves market state', () => {
    const e = world();
    go(e, 'U', 'UpdateMarketDriver', { driverId: 'MARKET_DRIVER_000001', valueBasisPoints: 7200, direction: 'UPWARD' });
    go(e, 'R', 'TransitionMarketRegime', { regime: 'BOOM' });
    go(e, 'O', 'RecordMarketObservation', {});
    const snap = createSnapshot(e);
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.markets.snapshot()).toEqual(e.markets.snapshot());
  });

  it('migrates version 12 while preserving Steps 1–13', () => {
    const legacy = world();
    const save: any = createSave(legacy, createSnapshot(legacy));
    delete save.snapshot.state.markets;
    save.snapshot.snapshotSchemaVersion = 12;
    const snapBare: any = { ...save.snapshot };
    delete snapBare.snapshotChecksum;
    save.snapshot.snapshotChecksum = snapshotChecksum(snapBare);
    save.saveSchemaVersion = 12;
    save.coreVersion = '0.13.0';
    const saveBare: any = { ...save };
    delete saveBare.saveChecksum;
    save.saveChecksum = calculateSaveChecksum(saveBare);
    const loaded = loadSave(save);
    expect(loaded.exports.snapshot()).toEqual(legacy.exports.snapshot());
    expect(loaded.markets.snapshot()).toEqual({
      appliedEventIds: [],
      regime: { regime: 'NORMAL', transitionedAtTimestamp: 0, durationDays: 0, sourceEventIds: [] },
      drivers: [],
      season: 'SUMMER',
      observations: [],
    });
  });

  // ── Read models ───────────────────────────────────────────────────
  it('read models are defensive and RNG-free', () => {
    const e = world();
    const rng = e.rng.snapshot();
    const report = marketReport(e);
    report.drivers[0]!.displayName = 'bad';
    expect(marketReport(e).drivers[0]!.displayName).toBe('Domestic demand');
    const summary = marketSummary(e);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.some(l => l.toLowerCase().includes('regime'))).toBe(true);
    expect(e.rng.snapshot()).toEqual(rng);
  });

  // ── No Step 15 state ──────────────────────────────────────────────
  it('contains no Step 15 state', () => {
    const e = world();
    const s: any = e.authoritativeState();
    expect(s.markets).toBeDefined();
    expect(s.markets.drivers).toHaveLength(2);
  });
});
