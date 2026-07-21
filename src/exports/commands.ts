import type { CommandEnvelope, CommandResult } from '../core/commands.js';
import type { ScheduledEvent } from '../core/events.js';
import type { SimulationEngine } from '../core/engine.js';
import { SimulationPhase } from '../core/phases.js';
import type { CostLayer } from '../inventory/types.js';
import type { JournalTransaction, Payable, Receivable } from '../finance/types.js';
import type { ExportBuyer, ExportOrder, ExportQuote } from './types.js';

const reject = (c: CommandEnvelope, code: string, message: string): CommandResult => ({
  accepted: false, commandId: c.commandId, code, message,
});
const int = (x: unknown, min = 0) => Number.isSafeInteger(x) && Number(x) >= min;

function emit(e: SimulationEngine, c: CommandEnvelope, type: string, payload: Record<string, unknown>) {
  const i = e.reserveEventIdentity();
  return e.emitReservedEvent(i, {
    eventType: type, phase: SimulationPhase.COMMANDS, actorId: c.actorId,
    targetIds: [], parentCauseId: c.commandId, visibility: 'PLAYER_PRIVATE', payload,
  });
}

function scheduled(e: SimulationEngine, type: string, time: number, payload: Record<string, unknown>, cause: string): ScheduledEvent {
  const i = e.reserveEventIdentity();
  return {
    eventId: i.eventId, eventType: type, scheduledGameTime: time,
    phase: SimulationPhase.JOB_PROGRESS, actorId: 'actor.exports',
    targetIds: [], parentCauseId: cause, schemaVersion: 1,
    visibility: 'PLAYER_PRIVATE', payload, insertionSequence: i.insertionSequence,
  };
}

export function registerExportCommands(e: SimulationEngine) {
  // ── Export buyer ────────────────────────────────────────────────────
  e.registerCommandHandler('CreateExportBuyer', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    const loc = e.routing.location(String(p.locationId));
    if (!company || !loc || loc.status !== 'ACTIVE' || p.fictional !== true ||
        !String(p.configId) || !String(p.displayName) ||
        !['EXPORT_SAWMILL', 'EXPORT_PULP', 'EXPORT_ENERGY'].includes(String(p.buyerType)) ||
        !int(p.paymentTermsSeconds))
      return reject(c, 'INVALID_BUYER', 'Invalid export buyer');

    const buyer: ExportBuyer = {
      id: e.ids.next('export_buyer', 'EXBUYER'),
      configId: String(p.configId),
      displayName: String(p.displayName),
      fictional: true,
      buyerType: p.buyerType as ExportBuyer['buyerType'],
      companyId: company.id,
      locationId: loc.id,
      status: 'ACTIVE',
      paymentTermsSeconds: Number(p.paymentTermsSeconds),
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'ExportBuyerCreated', { buyer });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Export quote ────────────────────────────────────────────────────
  e.registerCommandHandler('CreateExportQuote', c => {
    const p = c.payload;
    const portLoc = e.routing.location(String(p.portLocationId));
    const destLoc = e.routing.location(String(p.destinationLocationId));
    if (!portLoc || !destLoc) return reject(c, 'INVALID_LOCATION', 'Invalid port or destination');
    if (!int(p.rateMinorPerM3, 1) || !int(p.handlingCostMinor) || !int(p.documentationCostMinor) ||
        !int(p.expiryTimestamp) || Number(p.expiryTimestamp) <= e.clock.currentGameTime)
      return reject(c, 'INVALID_QUOTE', 'Invalid quote parameters');

    let route;
    try { route = e.routing.route(portLoc.id, destLoc.id); }
    catch { return reject(c, 'NO_ROUTE', 'No sea route exists'); }

    const quote: ExportQuote = {
      id: e.ids.next('export_quote', 'EXQUOTE'),
      portLocationId: portLoc.id,
      destinationLocationId: destLoc.id,
      routeEdgeIds: route.edgeIds,
      distanceMetres: route.distanceMetres,
      travelSeconds: route.travelSeconds,
      rateMinorPerM3: Number(p.rateMinorPerM3),
      handlingCostMinor: Number(p.handlingCostMinor),
      documentationCostMinor: Number(p.documentationCostMinor),
      currency: 'EUR',
      status: 'OPEN',
      createdTimestamp: e.clock.currentGameTime,
      expiryTimestamp: Number(p.expiryTimestamp),
      sourceEventIds: [],
    };
    const expiryEvent = scheduled(e, 'ExportQuoteExpired', quote.expiryTimestamp, { quoteId: quote.id }, c.commandId);
    const x = emit(e, c, 'ExportQuoteCreated', { quote, scheduledEvents: [expiryEvent] });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('AcceptExportQuote', c => {
    const q = e.exports.quote(String(c.payload.quoteId));
    if (!q || q.status !== 'OPEN' || e.clock.currentGameTime >= q.expiryTimestamp)
      return reject(c, 'INVALID_ACCEPTANCE', 'Quote unavailable');
    const x = emit(e, c, 'ExportQuoteAccepted', { quoteId: q.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Export order ────────────────────────────────────────────────────
  e.registerCommandHandler('CreateExportOrder', c => {
    const p = c.payload;
    const q = e.exports.quote(String(p.quoteId));
    const eb = e.exports.buyer(String(p.exportBuyerId));
    if (!q || q.status !== 'ACCEPTED' || !eb || eb.status !== 'ACTIVE')
      return reject(c, 'INVALID_ORDER', 'Accepted quote and active buyer required');
    if (e.exports.snapshot().orders.some(o => o.quoteId === q.id && !['SETTLED', 'CANCELLED'].includes(o.status)))
      return reject(c, 'QUOTE_IN_USE', 'Quote already has an active order');
    if (!int(p.volumeMilliM3, 1))
      return reject(c, 'INVALID_VOLUME', 'Positive volume required');

    const docs = Array.isArray(p.requiredDocumentTypes) ? p.requiredDocumentTypes.map(String) : ['CERT_OF_ORIGIN', 'PHYTOSANITARY'];
    const freightTotal = Number(BigInt(Number(p.volumeMilliM3)) * BigInt(q.rateMinorPerM3) / 1000n) +
      q.handlingCostMinor + q.documentationCostMinor;
    if (!Number.isSafeInteger(freightTotal)) return reject(c, 'PRICE_OVERFLOW', 'Price overflow');

    const order: ExportOrder = {
      id: e.ids.next('export_order', 'EXORDER'),
      quoteId: q.id,
      companyId: eb.companyId,
      exportBuyerId: eb.id,
      portLocationId: q.portLocationId,
      destinationLocationId: q.destinationLocationId,
      routeEdgeIds: [...q.routeEdgeIds],
      volumeMilliM3: Number(p.volumeMilliM3),
      requiredDocumentTypes: docs,
      documentStatus: 'PENDING',
      bookingStatus: 'PENDING',
      loadingStatus: 'PENDING',
      status: 'QUOTED',
      acceptedVolumeMilliM3: 0,
      rejectedVolumeMilliM3: 0,
      rateMinorPerM3: q.rateMinorPerM3,
      handlingCostMinor: q.handlingCostMinor,
      documentationCostMinor: q.documentationCostMinor,
      freightTotalMinor: freightTotal,
      totalRevenueMinor: 0,
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'ExportOrderCreated', { order });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Document validation ─────────────────────────────────────────────
  e.registerCommandHandler('ValidateExportDocuments', c => {
    const o = e.exports.order(String(c.payload.orderId));
    if (!o || o.status !== 'QUOTED') return reject(c, 'INVALID_STATE', 'Order must be QUOTED');
    const missing = Array.isArray(c.payload.missingDocs) ? c.payload.missingDocs.map(String) : [];
    const valid = missing.length === 0;
    const x = emit(e, c, 'ExportDocumentsValidated', { orderId: o.id, valid, missingDocs: missing });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Slot / booking ──────────────────────────────────────────────────
  e.registerCommandHandler('ConfirmExportSlot', c => {
    const o = e.exports.order(String(c.payload.orderId));
    if (!o || o.documentStatus !== 'VALID' || o.status !== 'QUOTED')
      return reject(c, 'INVALID_STATE', 'Valid documents and QUOTED status required');
    const slotTimestamp = e.clock.currentGameTime + Number(c.payload.delaySeconds ?? 3600);
    const loadStart = slotTimestamp + 600;
    const depart = loadStart + Number(o.volumeMilliM3) / 1000 * 300; // 5 min per m³ loading
    let travelSeconds = 86400;
    try { travelSeconds = e.routing.route(o.portLocationId, o.destinationLocationId).travelSeconds; }
    catch { /* use default */ }
    const arrivalTimestamp = depart + travelSeconds;

    const scheduledEvents: ScheduledEvent[] = [
      scheduled(e, 'ExportLoadStarted', loadStart, { orderId: o.id }, c.commandId),
    ];

    const x = emit(e, c, 'ExportSlotConfirmed', {
      orderId: o.id, slotTimestamp, loadStartTimestamp: loadStart,
      departureTimestamp: depart, arrivalTimestamp,
      scheduledEvents,
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Loading ─────────────────────────────────────────────────────────
  e.registerCommandHandler('CompleteExportLoading', c => {
    const o = e.exports.order(String(c.payload.orderId));
    if (!o || o.status !== 'LOADING') return reject(c, 'INVALID_STATE', 'Order must be LOADING');
    const departTimestamp = e.clock.currentGameTime;
    const route = e.routing.route(o.portLocationId, o.destinationLocationId);
    const arrivalTimestamp = departTimestamp + route.travelSeconds;

    const scheduledEvents: ScheduledEvent[] = [
      scheduled(e, 'ExportVesselDeparted', departTimestamp, { orderId: o.id }, c.commandId),
      scheduled(e, 'ExportVesselArrived', arrivalTimestamp, { orderId: o.id, toLocationId: o.destinationLocationId }, c.commandId),
    ];
    const x = emit(e, c, 'ExportLoadCompleted', {
      orderId: o.id, scheduledEvents, departureTimestamp: departTimestamp, arrivalTimestamp,
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Acceptance ──────────────────────────────────────────────────────
  e.registerCommandHandler('AcceptExportCargo', c => {
    const p = c.payload;
    const o = e.exports.order(String(p.orderId));
    if (!o || o.status !== 'ARRIVED') return reject(c, 'INVALID_STATE', 'Order must be ARRIVED');
    const accepted = int(p.acceptedVolumeMilliM3, 1) ? Number(p.acceptedVolumeMilliM3) : o.volumeMilliM3;
    const rejected = o.volumeMilliM3 - accepted;
    if (accepted <= 0 || rejected < 0) return reject(c, 'INVALID_VOLUME', 'Invalid acceptance volume');

    const x = emit(e, c, 'ExportCargoAccepted', {
      orderId: o.id, acceptedVolumeMilliM3: accepted, rejectedVolumeMilliM3: rejected,
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Settlement ──────────────────────────────────────────────────────
  e.registerCommandHandler('SettleExportOrder', c => {
    const o = e.exports.order(String(c.payload.orderId));
    if (!o || o.status !== 'ACCEPTED' || o.receivableId)
      return reject(c, 'INVALID_STATE', 'Accepted unpaid order required');

    const eb = e.exports.buyer(o.exportBuyerId)!;
    const revenueMinor = Number(BigInt(o.acceptedVolumeMilliM3) * BigInt(o.rateMinorPerM3) / 1000n);
    const receivableId = e.ids.next('receivable', 'RECEIVABLE');
    const journalId = e.ids.next('journal', 'JOURNAL');
    const costLayerId = e.ids.next('cost_layer', 'COST');
    const payableId = e.ids.next('payable', 'PAYABLE');
    const identity = e.reserveEventIdentity();
    const dueTimestamp = e.clock.currentGameTime + eb.paymentTermsSeconds;

    const receivable: Receivable = {
      id: receivableId,
      companyId: o.companyId,
      counterpartyId: eb.id,
      principalMinor: revenueMinor,
      currency: 'EUR',
      invoiceTimestamp: e.clock.currentGameTime,
      dueTimestamp,
      status: 'OPEN',
      amountPaidMinor: 0,
      sourceEventId: identity.eventId,
      sourceObjectIds: [o.id, o.quoteId],
      expectedPaymentNote: `Export delivery ${o.id}`,
      agingState: 'NOT_DUE',
    };

    const tx: JournalTransaction = {
      id: journalId,
      timestamp: e.clock.currentGameTime,
      eventId: identity.eventId,
      companyId: o.companyId,
      description: `Export revenue ${o.id}`,
      schemaVersion: 1,
      sourceObjectIds: [o.id, o.quoteId],
      lines: [
        { accountId: e.finance.snapshot().accounts.find(a => a.companyId === o.companyId && a.code === 'ACCOUNTS_RECEIVABLE')!.id,
          debitMinor: revenueMinor, creditMinor: 0, currency: 'EUR', category: 'EXPORT_REVENUE',
          counterpartyId: eb.id, memo: `Export revenue ${o.id}`, ruleReference: 'STEP_13_EXPORT_RULES' },
        { accountId: e.finance.snapshot().accounts.find(a => a.companyId === o.companyId && a.code === 'REVENUE')!.id,
          debitMinor: 0, creditMinor: revenueMinor, currency: 'EUR', category: 'EXPORT_REVENUE',
          counterpartyId: eb.id, memo: `Export revenue ${o.id}`, ruleReference: 'STEP_13_EXPORT_RULES' },
      ],
    };

    const costLayer: CostLayer = {
      id: costLayerId,
      attachedToType: 'LOAD',
      attachedToId: o.id,
      sourceObjectId: o.id,
      category: 'OPERATIONAL',
      currency: 'EUR',
      totalMinor: revenueMinor,
      attributableVolumeMilliM3: o.acceptedVolumeMilliM3,
      allocationMethod: 'DIRECT',
      createdTimestamp: e.clock.currentGameTime,
      financeSourceId: receivableId,
      provenanceReference: 'STEP_13_EXPORT_RULES',
      status: 'ACTIVE',
    };

    // Port handling cost payable
    const costTotal = o.handlingCostMinor + o.documentationCostMinor;
    const costTx: JournalTransaction = {
      id: e.ids.next('journal', 'JOURNAL'),
      timestamp: e.clock.currentGameTime,
      eventId: identity.eventId,
      companyId: o.companyId,
      description: `Export handling ${o.id}`,
      schemaVersion: 1,
      sourceObjectIds: [o.id],
      lines: [
        { accountId: e.finance.snapshot().accounts.find(a => a.companyId === o.companyId && a.code === 'OPERATING_EXPENSE')!.id,
          debitMinor: costTotal, creditMinor: 0, currency: 'EUR', category: 'EXPORT_HANDLING',
          counterpartyId: 'port.fictional', memo: `Export handling ${o.id}`, ruleReference: 'STEP_13_EXPORT_RULES' },
        { accountId: e.finance.snapshot().accounts.find(a => a.companyId === o.companyId && a.code === 'ACCOUNTS_PAYABLE')!.id,
          debitMinor: 0, creditMinor: costTotal, currency: 'EUR', category: 'EXPORT_HANDLING',
          counterpartyId: 'port.fictional', memo: `Export handling ${o.id}`, ruleReference: 'STEP_13_EXPORT_RULES' },
      ],
    };

    const payable: Payable = {
      id: payableId,
      companyId: o.companyId,
      counterpartyId: 'port.fictional',
      principalMinor: costTotal,
      currency: 'EUR',
      createdTimestamp: e.clock.currentGameTime,
      dueTimestamp: dueTimestamp,
      status: 'COMMITTED',
      amountPaidMinor: 0,
      sourceEventId: identity.eventId,
      sourceObjectIds: [o.id],
    };

    const scheduledEvents: ScheduledEvent[] = [
      scheduled(e, 'PayableBecameDue', dueTimestamp, { payableId }, c.commandId),
      scheduled(e, 'PayableBecameOverdue', dueTimestamp + 1, { payableId }, c.commandId),
      scheduled(e, 'ReceivableBecameDue', dueTimestamp, { receivableId }, c.commandId),
      scheduled(e, 'ReceivableBecameOverdue', dueTimestamp + 1, { receivableId }, c.commandId),
    ];

    const settlementEvent = e.emitReservedEvent(identity, {
      eventType: 'ExportOrderSettled',
      phase: SimulationPhase.FINANCIAL_SETTLEMENTS,
      actorId: c.actorId, targetIds: [o.id],
      parentCauseId: c.commandId, visibility: 'PLAYER_PRIVATE',
      payload: {
        orderId: o.id, receivable, transaction: tx, costLayer,
        payable, costTransaction: costTx,
        scheduledEvents,
        receivableId, transactionId: journalId, costLayerId, payableId,
      },
    });

    // Emit separate cost payable event
    emit(e, c, 'ExportCostPayableCreated', {
      orderId: o.id, payableId, costTotal, transaction: costTx,
    });

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [settlementEvent.eventId] };
  });

  e.registerCommandHandler('CancelExportOrder', c => {
    const o = e.exports.order(String(c.payload.orderId));
    if (!o || ['SETTLED', 'CANCELLED'].includes(o.status))
      return reject(c, 'INVALID_STATE', 'Order cannot be cancelled');
    const x = emit(e, c, 'ExportOrderCancelled', { orderId: o.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });
}
