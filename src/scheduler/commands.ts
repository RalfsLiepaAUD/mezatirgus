import type { CommandEnvelope, CommandResult } from '../core/commands.js';
import type { ScheduledEvent } from '../core/events.js';
import type { SimulationEngine } from '../core/engine.js';
import { SimulationPhase } from '../core/phases.js';
import { TICK_DURATION_SECONDS } from '../core/constants.js';

const reject = (c: CommandEnvelope, code: string, message: string): CommandResult => ({
  accepted: false, commandId: c.commandId, code, message,
});

function scheduleNext(e: SimulationEngine, cmdType: string, interval: number, phase: SimulationPhase, payload: Record<string, unknown>, cause: string) {
  const identity = e.reserveEventIdentity();
  const next: ScheduledEvent = {
    eventId: identity.eventId,
    eventType: 'AutonomousCommand',
    scheduledGameTime: e.clock.currentGameTime + interval,
    phase,
    actorId: 'actor.autonomous',
    targetIds: [],
    parentCauseId: cause,
    schemaVersion: 1,
    visibility: 'DEBUG_ONLY',
    payload: { commandType: cmdType, commandPayload: payload, interval, phase },
    insertionSequence: identity.insertionSequence,
  };
  e.queue.schedule(next);
}

export function registerSchedulerCommands(e: SimulationEngine) {
  // ── Buyer consumption (every tick) ────────────────────────────────
  e.registerCommandHandler('_AutoTickConsumption', c => {
    for (const buyer of e.buyers.snapshot().buyers) {
      if (buyer.status !== 'ACTIVE') continue;
      const volume = Math.round(buyer.consumptionMilliM3PerDay * TICK_DURATION_SECONDS / 86400);
      if (volume <= 0 || volume > buyer.stockMilliM3) continue;
      const result = e.execute({
        commandId: '_auto_consume_' + buyer.id,
        commandType: 'ConsumeBuyerStock',
        issuedGameTime: e.clock.currentGameTime,
        requestedExecutionTime: e.clock.currentGameTime,
        actorId: 'actor.autonomous',
        payload: { buyerId: buyer.id, volumeMilliM3: volume },
        schemaVersion: 1,
      });
    }
    scheduleNext(e, '_AutoTickConsumption', TICK_DURATION_SECONDS, SimulationPhase.BUYER_CONSUMPTION, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });

  // ── Supplier offer generation (every 3 ticks) ─────────────────────
  e.registerCommandHandler('_AutoTickSupplierOffers', c => {
    const rng = e.rng.stream('autonomous');
    for (const supplier of e.suppliers.snapshot().suppliers) {
      if (supplier.status !== 'ACTIVE') continue;
      const offeredVolume = 20_000 + rng.nextUint32() % 20_000; // 20-40k
      const rateBase = 4_000 + rng.nextUint32() % 3_000; // €40-70/m³
      const contact = e.suppliers.snapshot().contacts.find(ct => ct.supplierId === supplier.id);
      if (!contact) continue;
      const locId = e.routing.snapshot().locations.find(l => l.roles.includes('ROADSIDE'))?.id ?? e.routing.snapshot().locations[0]?.id;
      if (!locId) continue;
      const result = e.execute({
        commandId: '_auto_offer_' + supplier.id,
        commandType: 'CreateOffer',
        issuedGameTime: e.clock.currentGameTime,
        requestedExecutionTime: e.clock.currentGameTime,
        actorId: 'actor.autonomous',
        payload: {
          supplierId: supplier.id, contactId: contact.id, companyId: 'COMPANY-000001',
          locationId: locId, expiryTimestamp: e.clock.currentGameTime + 86400 * 3,
          volumeBasis: 'AGREED_VOLUME', offeredVolumeMilliM3: offeredVolume,
          baseRateMinorPerM3: rateBase, requiredDocumentTypes: ['DELIVERY_NOTE'],
          beliefVolumeMinMilliM3: offeredVolume - 2000, beliefVolumeMaxMilliM3: offeredVolume + 2000,
          actualVolumeMilliM3: offeredVolume, actualFreshness: 'FRESH',
          truthComposition: {
            species: [{ id: 'species.birch', basisPoints: 10000 }],
            assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
            quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
          },
        },
        schemaVersion: 1,
      });
    }
    scheduleNext(e, '_AutoTickSupplierOffers', TICK_DURATION_SECONDS * 3, SimulationPhase.CAPACITY_AND_CONTRACTS, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });

  // ── Competitor action (every 6 ticks) ─────────────────────────────
  e.registerCommandHandler('_AutoTickCompetitor', c => {
    const rng = e.rng.stream('autonomous');
    // Simple policy: accept the cheapest available open offer
    const offers = e.suppliers.snapshot().offers.filter(o =>
      o.status === 'OPEN' && o.expiryTimestamp > e.clock.currentGameTime);
    if (offers.length > 0) {
      // Pick cheapest by total cost
      const sorted = [...offers].sort((a, b) =>
        (a.baseRateMinorPerM3 * a.offeredVolumeMilliM3) - (b.baseRateMinorPerM3 * b.offeredVolumeMilliM3));
      const pick = sorted[0]!;
      const cash = e.finance.balanceByCode('COMPANY-000001', 'OPERATING_CASH');
      const cost = pick.baseRateMinorPerM3 * pick.offeredVolumeMilliM3;
      if (cost > 0 && cost <= cash * 10) { // can commit up to 10× cash (credit-like)
        e.execute({
          commandId: '_auto_accept_' + pick.id,
          commandType: 'AcceptOffer',
          issuedGameTime: e.clock.currentGameTime,
          requestedExecutionTime: e.clock.currentGameTime,
          actorId: 'actor.autonomous',
          payload: { offerId: pick.id },
          schemaVersion: 1,
        });
      }
    }
    scheduleNext(e, '_AutoTickCompetitor', TICK_DURATION_SECONDS * 6, SimulationPhase.AI_PERCEPTION_AND_DECISION, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });

  // ── Financial pressure (every 24 ticks = 1 day) ──────────────────
  e.registerCommandHandler('_AutoTickFinancial', c => {
    // Payroll: post cost per employee per day
    for (const emp of e.operations.snapshot().employees) {
      if (emp.status === 'UNAVAILABLE') continue;
      const dailyWage = Math.round(emp.wageMinorPerHour * 24); // assume 24h for skeleton
      if (dailyWage <= 0) continue;
      e.execute({
        commandId: '_auto_payroll_' + emp.id,
        commandType: 'PostOperationsCost',
        issuedGameTime: e.clock.currentGameTime,
        requestedExecutionTime: e.clock.currentGameTime,
        actorId: 'actor.autonomous',
        payload: { companyId: 'COMPANY-000001', amountMinor: dailyWage, category: 'PAYROLL', description: `Payroll ${emp.displayName}` },
        schemaVersion: 1,
      });
    }
    // Yard storage cost
    for (const yard of e.operations.snapshot().yards) {
      if (yard.status === 'INACTIVE') continue;
      if (yard.usedCapacityMilliM3 > 0) {
        const storageCost = Math.round(yard.storageCostMinorPerTickPerM3 * yard.usedCapacityMilliM3);
        if (storageCost > 0) {
          e.execute({
            commandId: '_auto_storage_' + yard.id,
            commandType: 'PostOperationsCost',
            issuedGameTime: e.clock.currentGameTime,
            requestedExecutionTime: e.clock.currentGameTime,
            actorId: 'actor.autonomous',
            payload: { companyId: 'COMPANY-000001', amountMinor: storageCost, category: 'STORAGE', description: `Storage ${yard.displayName}` },
            schemaVersion: 1,
          });
        }
      }
    }
    scheduleNext(e, '_AutoTickFinancial', TICK_DURATION_SECONDS * 24, SimulationPhase.FINANCIAL_SETTLEMENTS, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });
}

export function setupAutonomousScheduler(e: SimulationEngine) {
  const now = e.clock.currentGameTime;
  const events: ScheduledEvent[] = [];
  const configs: Array<{ cmd: string; interval: number; phase: SimulationPhase }> = [
    { cmd: '_AutoTickConsumption', interval: TICK_DURATION_SECONDS, phase: SimulationPhase.BUYER_CONSUMPTION },
    { cmd: '_AutoTickSupplierOffers', interval: TICK_DURATION_SECONDS * 3, phase: SimulationPhase.CAPACITY_AND_CONTRACTS },
    { cmd: '_AutoTickCompetitor', interval: TICK_DURATION_SECONDS * 6, phase: SimulationPhase.AI_PERCEPTION_AND_DECISION },
    { cmd: '_AutoTickFinancial', interval: TICK_DURATION_SECONDS * 24, phase: SimulationPhase.FINANCIAL_SETTLEMENTS },
  ];
  for (const cfg of configs) {
    const identity = e.reserveEventIdentity();
    events.push({
      eventId: identity.eventId,
      eventType: 'AutonomousCommand',
      scheduledGameTime: now + cfg.interval,
      phase: cfg.phase,
      actorId: 'actor.autonomous',
      targetIds: [],
      parentCauseId: '_auto_setup',
      schemaVersion: 1,
      visibility: 'DEBUG_ONLY',
      payload: { commandType: cfg.cmd, commandPayload: {}, interval: cfg.interval, phase: cfg.phase },
      insertionSequence: identity.insertionSequence,
    });
  }
  for (const ev of events) e.queue.schedule(ev);
}
