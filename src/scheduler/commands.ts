import type { CommandEnvelope, CommandResult } from '../core/commands.js';
import type { ScheduledEvent } from '../core/events.js';
import type { SimulationEngine } from '../core/engine.js';
import { SimulationPhase } from '../core/phases.js';
import { TICK_DURATION_SECONDS } from '../core/constants.js';
import type { Offer } from '../supplier/types.js';

const reject = (c: CommandEnvelope, code: string, message: string): CommandResult => ({
  accepted: false, commandId: c.commandId, code, message,
});

function scheduleNext(e: SimulationEngine, cmdType: string, interval: number, phase: SimulationPhase, payload: Record<string, unknown>, cause: string) {
  const identity = e.reserveEventIdentity();
  const next: ScheduledEvent = {
    eventId: identity.eventId, eventType: 'AutonomousCommand',
    scheduledGameTime: e.clock.currentGameTime + interval, phase,
    actorId: 'actor.autonomous', targetIds: [], parentCauseId: cause,
    schemaVersion: 1, visibility: 'DEBUG_ONLY',
    payload: { commandType: cmdType, commandPayload: payload, interval, phase },
    insertionSequence: identity.insertionSequence,
  };
  e.queue.schedule(next);
}

/** Defensive competitor-facing view — only public offer fields, no hidden truth. */
export interface PublicOfferSummary {
  id: string; supplierId: string; companyId: string;
  status: string; offeredVolumeMilliM3: number; baseRateMinorPerM3: number;
  effectiveRateMinorPerM3: number; expiryTimestamp: number;
}
export function publicOffers(e: SimulationEngine, companyId: string): PublicOfferSummary[] {
  return e.suppliers.snapshot().offers
    .filter(o => o.companyId === companyId)
    .map(o => ({
      id: o.id, supplierId: o.supplierId, companyId: o.companyId,
      status: o.status, offeredVolumeMilliM3: o.offeredVolumeMilliM3,
      baseRateMinorPerM3: o.baseRateMinorPerM3,
      effectiveRateMinorPerM3: o.effectiveRateMinorPerM3,
      expiryTimestamp: o.expiryTimestamp,
    }));
}

const composition = {
  species: [{ id: 'species.birch', basisPoints: 10000 }],
  assortment: [{ id: 'assortment.sawlogs', basisPoints: 10000 }],
  quality: [{ id: 'quality.birch.b', basisPoints: 10000 }],
};

export function registerSchedulerCommands(e: SimulationEngine) {
  // ── Buyer consumption (every tick) ────────────────────────────────
  e.registerCommandHandler('_AutoTickConsumption', c => {
    for (const buyer of e.buyers.snapshot().buyers) {
      if (buyer.status !== 'ACTIVE') continue;
      const volume = Math.round(buyer.consumptionMilliM3PerDay * TICK_DURATION_SECONDS / 86400);
      if (volume <= 0 || volume > buyer.stockMilliM3) continue;
      e.execute({
        commandId: '_auto_consume_' + buyer.id, commandType: 'ConsumeBuyerStock',
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

  // ── Supplier offer generation (every 12 ticks ≈ 2 per day per active supplier) ──
  e.registerCommandHandler('_AutoTickSupplierOffers', c => {
    const rng = e.rng.stream('autonomous');
    for (const supplier of e.suppliers.snapshot().suppliers) {
      if (supplier.status !== 'ACTIVE') continue;
      const offeredVolume = 20_000 + rng.nextUint32() % 15_000; // 20-35k
      const rateBase = 4_000 + rng.nextUint32() % 3_000; // €40-70/m³
      const contact = e.suppliers.snapshot().contacts.find(ct => ct.supplierId === supplier.id);
      if (!contact) continue;
      // Look up company from relationship (supplier is not directly associated)
      const rel = e.suppliers.snapshot().relationships.find(r => r.supplierId === supplier.id);
      const companyId = rel?.companyId ?? 'COMPANY-000001';
      const locId = e.routing.snapshot().locations.find(l => l.roles.includes('ROADSIDE'))?.id ?? e.routing.snapshot().locations[0]?.id;
      if (!locId) continue;
      const offerResult = e.execute({
        commandId: '_auto_offer_' + supplier.id + '_' + e.clock.currentGameTime,
        commandType: 'CreateOffer',
        issuedGameTime: e.clock.currentGameTime,
        requestedExecutionTime: e.clock.currentGameTime,
        actorId: 'actor.autonomous',
        payload: {
          supplierId: supplier.id, contactId: contact.id, companyId,
          locationId: locId, expiryTimestamp: e.clock.currentGameTime + 86400 * 3,
          volumeBasis: 'AGREED_VOLUME', offeredVolumeMilliM3: offeredVolume,
          baseRateMinorPerM3: rateBase, requiredDocumentTypes: ['DELIVERY_NOTE'],
          beliefVolumeMinMilliM3: offeredVolume - 2000, beliefVolumeMaxMilliM3: offeredVolume + 2000,
          actualVolumeMilliM3: offeredVolume, actualFreshness: 'FRESH',
          truthComposition: composition,
        },
        schemaVersion: 1,
      });
      // Validate documents by emitting events directly (commands don't exist yet)
      if (offerResult.accepted) {
        const docSet = e.suppliers.snapshot().documentSets
          .filter(d => d.status === 'PENDING')[0];
        if (docSet) {
          const docId = e.ids.next('supplier_document', 'DOCUMENT');
          const docIdentity = e.reserveEventIdentity();
          e.emitReservedEvent(docIdentity, {
            eventType: 'DocumentAdded',
            phase: SimulationPhase.COMMANDS,
            actorId: 'actor.autonomous',
            targetIds: [docSet.offerId], parentCauseId: c.commandId,
            visibility: 'PLAYER_PRIVATE',
            payload: {
              documentSetId: docSet.id,
              document: { id: docId, documentSetId: docSet.id, documentType: 'DELIVERY_NOTE',
                issuer: supplier.displayName, reference: 'AUTO-' + e.clock.currentGameTime,
                validFromTimestamp: 0, validUntilTimestamp: e.clock.currentGameTime + 86400 * 30,
                sourceEventIds: [] },
            },
          });
          const valIdentity = e.reserveEventIdentity();
          e.emitReservedEvent(valIdentity, {
            eventType: 'DocumentSetValidated',
            phase: SimulationPhase.COMMANDS,
            actorId: 'actor.autonomous',
            targetIds: [docSet.offerId], parentCauseId: c.commandId,
            visibility: 'PLAYER_PRIVATE',
            payload: { documentSetId: docSet.id, status: 'VALID', missingTypes: [] },
          });
        }
      }
    }
    scheduleNext(e, '_AutoTickSupplierOffers', TICK_DURATION_SECONDS * 12, SimulationPhase.CAPACITY_AND_CONTRACTS, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });

  // ── Competitor action (every 12 ticks, uses own companyId + cash) ──
  e.registerCommandHandler('_AutoTickCompetitor', c => {
    const rng = e.rng.stream('autonomous');
    const competitorId = 'COMPANY-000002';
    const comp = e.finance.company(competitorId);
    if (!comp) { scheduleNext(e, '_AutoTickCompetitor', TICK_DURATION_SECONDS * 12, SimulationPhase.AI_PERCEPTION_AND_DECISION, {}, c.commandId); return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] }; }

    // Check competitor's cash position (free cash after commitments)
    const cash = e.finance.balanceByCode(competitorId, 'OPERATING_CASH');
    const commitments = e.finance.snapshot().commitments
      .filter(cmt => cmt.companyId === competitorId && cmt.status === 'ACTIVE')
      .reduce((s, cmt) => s + cmt.amountMinor, 0);
    const freeCash = cash - commitments;
    if (freeCash <= 0) {
      scheduleNext(e, '_AutoTickCompetitor', TICK_DURATION_SECONDS * 12, SimulationPhase.AI_PERCEPTION_AND_DECISION, {}, c.commandId);
      return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
    }

    // Read only public offer data via defensive read model
    const myOffers = publicOffers(e, competitorId).filter(o =>
      o.status === 'OPEN' && o.expiryTimestamp > e.clock.currentGameTime);
    if (myOffers.length > 0) {
      // Pick cheapest affordable offer
      const affordable = myOffers
        .map(o => ({ offer: o, cost: Math.round(o.baseRateMinorPerM3 * o.offeredVolumeMilliM3 / 1000) }))
        .filter(x => x.cost > 0 && x.cost <= freeCash)
        .sort((a, b) => a.cost - b.cost);
      if (affordable.length > 0) {
        const pick = affordable[0]!;
        e.execute({
          commandId: '_auto_accept_comp_' + pick.offer.id,
          commandType: 'AcceptOffer',
          issuedGameTime: e.clock.currentGameTime,
          requestedExecutionTime: e.clock.currentGameTime,
          actorId: 'actor.autonomous',
          payload: { offerId: pick.offer.id },
          schemaVersion: 1,
        });
      }
    }
    scheduleNext(e, '_AutoTickCompetitor', TICK_DURATION_SECONDS * 12, SimulationPhase.AI_PERCEPTION_AND_DECISION, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });

  // ── Financial pressure (every 24 ticks = 1 day) ──────────────────
  e.registerCommandHandler('_AutoTickFinancial', c => {
    for (const emp of e.operations.snapshot().employees) {
      if (emp.status === 'UNAVAILABLE') continue;
      const dailyWage = Math.round(emp.wageMinorPerHour * 24);
      if (dailyWage <= 0) continue;
      e.execute({
        commandId: '_auto_payroll_' + emp.id, commandType: 'PostOperationsCost',
        issuedGameTime: e.clock.currentGameTime,
        requestedExecutionTime: e.clock.currentGameTime,
        actorId: 'actor.autonomous',
        payload: { companyId: 'COMPANY-000001', amountMinor: dailyWage, category: 'PAYROLL', description: `Payroll ${emp.displayName}` },
        schemaVersion: 1,
      });
    }
    for (const yard of e.operations.snapshot().yards) {
      if (yard.status === 'INACTIVE' || yard.usedCapacityMilliM3 <= 0) continue;
      const storageCost = Math.round(yard.storageCostMinorPerTickPerM3 * yard.usedCapacityMilliM3);
      if (storageCost > 0) {
        e.execute({
          commandId: '_auto_storage_' + yard.id, commandType: 'PostOperationsCost',
          issuedGameTime: e.clock.currentGameTime,
          requestedExecutionTime: e.clock.currentGameTime,
          actorId: 'actor.autonomous',
          payload: { companyId: 'COMPANY-000001', amountMinor: storageCost, category: 'STORAGE', description: `Storage ${yard.displayName}` },
          schemaVersion: 1,
        });
      }
    }
    scheduleNext(e, '_AutoTickFinancial', TICK_DURATION_SECONDS * 24, SimulationPhase.FINANCIAL_SETTLEMENTS, {}, c.commandId);
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [] };
  });
}

export function setupAutonomousScheduler(e: SimulationEngine) {
  const now = e.clock.currentGameTime;
  const configs: Array<{ cmd: string; interval: number; phase: SimulationPhase }> = [
    { cmd: '_AutoTickConsumption', interval: TICK_DURATION_SECONDS, phase: SimulationPhase.BUYER_CONSUMPTION },
    { cmd: '_AutoTickSupplierOffers', interval: TICK_DURATION_SECONDS * 12, phase: SimulationPhase.CAPACITY_AND_CONTRACTS },
    { cmd: '_AutoTickCompetitor', interval: TICK_DURATION_SECONDS * 12, phase: SimulationPhase.AI_PERCEPTION_AND_DECISION },
    { cmd: '_AutoTickFinancial', interval: TICK_DURATION_SECONDS * 24, phase: SimulationPhase.FINANCIAL_SETTLEMENTS },
  ];
  for (const cfg of configs) {
    const identity = e.reserveEventIdentity();
    e.queue.schedule({
      eventId: identity.eventId, eventType: 'AutonomousCommand',
      scheduledGameTime: now + cfg.interval, phase: cfg.phase,
      actorId: 'actor.autonomous', targetIds: [], parentCauseId: '_auto_setup',
      schemaVersion: 1, visibility: 'DEBUG_ONLY',
      payload: { commandType: cfg.cmd, commandPayload: {}, interval: cfg.interval, phase: cfg.phase },
      insertionSequence: identity.insertionSequence,
    });
  }
}
