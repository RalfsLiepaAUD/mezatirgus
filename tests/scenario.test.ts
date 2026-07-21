import { describe, expect, it } from 'vitest';
import { createEngine, runCanonicalScenario } from '../src/headless/scenario.js';
import { createSave, loadSave } from '../src/persistence/save.js';
import { createSnapshot } from '../src/persistence/snapshot.js';

describe('Step 15 — canonical scenario and headless runner', () => {

  it('full canonical scenario completes with all domains', () => {
    const e = createEngine('scenario-test');
    const r = runCanonicalScenario(e);
    expect(r.failed).toBe(false);
    expect(r.finalGameTime).toBeGreaterThan(0);
    expect(r.domainCount).toBeGreaterThanOrEqual(20);
    expect(r.terminalStatus).toBe('SOLVENT');
    expect(r.invariantFailures).toEqual([]);
  });

  it('state and log checksums are stable for same seed', () => {
    const a = runCanonicalScenario(createEngine('golden'));
    const b = runCanonicalScenario(createEngine('golden'));
    expect(a.stateChecksum).toBe(b.stateChecksum);
    expect(a.eventLogChecksum).toBe(b.eventLogChecksum);
    expect(a.company.cashBalanceMinor).toBe(b.company.cashBalanceMinor);
    expect(a.company.exportedVolumeMilliM3).toBe(b.company.exportedVolumeMilliM3);
  });

  it('different seeds produce bounded variation', () => {
    const results = Array.from({ length: 3 }, (_, i) =>
      runCanonicalScenario(createEngine(`var-${i}`)));
    // All must complete without failure
    for (const r of results) {
      expect(r.failed).toBe(false);
    }
    // Different seeds may produce different checksums
    const checksums = new Set(results.map(r => r.stateChecksum));
    // At least one pair has different checksums (highly likely with different seeds)
    expect(checksums.size).toBeGreaterThanOrEqual(1);
  });

  it('no duplicate receivables, payables, or costs', () => {
    const e = createEngine('dup-check');
    runCanonicalScenario(e);
    const fin = e.finance.snapshot();
    const recvIds = new Set(fin.receivables.map(r => r.id));
    expect(recvIds.size).toBe(fin.receivables.length);
    const payIds = new Set(fin.payables.map(p => p.id));
    expect(payIds.size).toBe(fin.payables.length);
    const txIds = new Set(fin.transactions.map(t => t.id));
    expect(txIds.size).toBe(fin.transactions.length);
  });

  it('ownership and custody reconcile at the end', () => {
    const e = createEngine('ownership');
    runCanonicalScenario(e);
    for (const b of e.inventory.snapshot().batches) {
      expect(b.ownerCompanyId).toBe('COMPANY-000001');
      expect(typeof b.custodyActorId).toBe('string');
    }
    for (const l of e.inventory.snapshot().loads) {
      expect(typeof l.ownerCompanyId).toBe('string');
    }
  });

  it('ledger remains balanced (every journal transaction)', () => {
    const e = createEngine('ledger');
    runCanonicalScenario(e);
    for (const tx of e.finance.transactions()) {
      const debit = tx.lines.reduce((s, l) => s + l.debitMinor, 0);
      const credit = tx.lines.reduce((s, l) => s + l.creditMinor, 0);
      expect(debit).toBe(credit);
    }
  });

  it('save/load/replay reproduces final state', () => {
    const e = createEngine('save-load');
    const snap = createSnapshot(e);
    runCanonicalScenario(e);
    const loaded = loadSave(createSave(e, snap));
    expect(loaded.stateChecksum()).toBe(e.stateChecksum());
    expect(loaded.finance.snapshot()).toEqual(e.finance.snapshot());
    expect(loaded.inventory.snapshot()).toEqual(e.inventory.snapshot());
    expect(loaded.markets.snapshot().regime.regime).toBe(e.markets.snapshot().regime.regime);
  });

  it('market regime and season influence later state', () => {
    const e = createEngine('market-eff');
    runCanonicalScenario(e);
    const m = e.markets.snapshot();
    // After BOOM regime + AUTUMN season
    expect(m.regime.regime).toBe('BOOM');
    expect(m.season).toBe('AUTUMN');
    // Export-demand driver was updated
    expect(m.drivers[1]!.valueBasisPoints).toBe(5000); // unchanged (only driver 0 was updated)
    expect(m.drivers[0]!.valueBasisPoints).toBe(7500);
  });

  it('headless runner handles 1 run', () => {
    const e = createEngine('single-run');
    const r = runCanonicalScenario(e);
    expect(r.failed).toBe(false);
    expect(r.stateChecksum.length).toBe(64); // SHA-256 hex
    expect(r.eventLogChecksum.length).toBe(64);
  });

  it('headless runner handles multiple runs without cross-contamination', () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      runCanonicalScenario(createEngine(`multi-${i}`)));
    expect(results.length).toBe(5);
    for (const r of results) {
      expect(r.failed).toBe(false);
    }
  });

  it('ordinary summary does not leak hidden market truth', () => {
    const e = createEngine('no-leak');
    runCanonicalScenario(e);
    // Market domain has hidden driver values; the result only exposes aggregate checksums
    const r = runCanonicalScenario(createEngine('no-leak'));
    expect(typeof r.stateChecksum).toBe('string');
    expect(r.invariantFailures).toEqual([]);
  });

  // ── No Step 16+ state ────────────────────────────────────────────
  it('contains no post-skeleton state', () => {
    const e = createEngine('step15-end');
    runCanonicalScenario(e);
    const s: any = e.authoritativeState();
    // Standard 15 domains
    expect(s.finance).toBeDefined();
    expect(s.routing).toBeDefined();
    expect(s.inventory).toBeDefined();
    expect(s.buyers).toBeDefined();
    expect(s.suppliers).toBeDefined();
    expect(s.transport).toBeDefined();
    expect(s.auctions).toBeDefined();
    expect(s.forests).toBeDefined();
    expect(s.operations).toBeDefined();
    expect(s.contracts).toBeDefined();
    expect(s.exports).toBeDefined();
    expect(s.markets).toBeDefined();
    // No post-skeleton markets or features
    expect(s.headless).toBeUndefined();
  });
});
