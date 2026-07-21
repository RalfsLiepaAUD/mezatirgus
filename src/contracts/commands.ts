import type { CommandEnvelope, CommandResult } from '../core/commands.js';
import type { ScheduledEvent } from '../core/events.js';
import type { SimulationEngine } from '../core/engine.js';
import { SimulationPhase } from '../core/phases.js';
import type { AgreementDelivery, FrameAgreement, QualityThreshold } from './types.js';
import type { CostLayer } from '../inventory/types.js';
import type { JournalTransaction, Payable, Receivable } from '../finance/types.js';

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
    phase: SimulationPhase.JOB_PROGRESS, actorId: 'actor.contracts',
    targetIds: [], parentCauseId: cause, schemaVersion: 1,
    visibility: 'PLAYER_PRIVATE', payload, insertionSequence: i.insertionSequence,
  };
}

export function registerContractsCommands(e: SimulationEngine) {
  // ── Create ─────────────────────────────────────────────────────────
  e.registerCommandHandler('CreateFrameAgreement', c => {
    const p = c.payload;
    const company = e.finance.company(String(p.companyId));
    const counterpartyType = String(p.counterpartyType);
    if (!company || !['BUYER', 'SUPPLIER'].includes(counterpartyType) || !String(p.displayName))
      return reject(c, 'INVALID_AGREEMENT', 'Invalid company or counterparty');

    const counterparty = counterpartyType === 'BUYER'
      ? e.buyers.buyer(String(p.counterpartyId))
      : e.suppliers.snapshot().suppliers.find(s => s.id === String(p.counterpartyId));
    if (!counterparty) return reject(c, 'INVALID_COUNTERPARTY', 'Counterparty not found');

    if (!int(p.validFromTimestamp) || !int(p.validUntilTimestamp) ||
        Number(p.validUntilTimestamp) <= Number(p.validFromTimestamp))
      return reject(c, 'INVALID_VALIDITY', 'Invalid validity period');

    if (!int(p.committedVolumeMilliM3, 1))
      return reject(c, 'INVALID_VOLUME', 'Committed volume must be positive');
    if (!int(p.toleranceBasisPoints) || Number(p.toleranceBasisPoints) > 10_000)
      return reject(c, 'INVALID_TOLERANCE', 'Tolerance must be 0-10000 bp');

    if (!['FIXED_RATE', 'PRICE_CARD_LINKED'].includes(String(p.priceBasis)))
      return reject(c, 'INVALID_PRICE_BASIS', 'Price basis must be FIXED_RATE or PRICE_CARD_LINKED');

    const priceBasis = String(p.priceBasis) as 'FIXED_RATE' | 'PRICE_CARD_LINKED';
    if (priceBasis === 'FIXED_RATE' && !int(p.fixedRateMinorPerM3, 1))
      return reject(c, 'INVALID_RATE', 'Fixed rate required');

    if (!int(p.paymentTermsSeconds))
      return reject(c, 'INVALID_PAYMENT_TERMS', 'Payment terms required');

    if (p.currency !== 'EUR') return reject(c, 'INVALID_CURRENCY', 'Only EUR supported');

    const speciesIds = Array.isArray(p.requiredSpeciesIds) ? p.requiredSpeciesIds.map(String) : [];
    const assortmentIds = Array.isArray(p.requiredAssortmentIds) ? p.requiredAssortmentIds.map(String) : [];
    if (!speciesIds.length) return reject(c, 'INVALID_SPECS', 'At least one species required');
    if (!assortmentIds.length) return reject(c, 'INVALID_SPECS', 'At least one assortment required');

    const qThresholds: QualityThreshold[] = [];
    if (Array.isArray(p.qualityThresholds)) {
      for (const qt of p.qualityThresholds) {
        if (!String(qt.qualityId) || !int(qt.minBasisPoints) || !int(qt.maxBasisPoints) ||
            Number(qt.minBasisPoints) > Number(qt.maxBasisPoints))
          return reject(c, 'INVALID_QUALITY', 'Invalid quality threshold');
        qThresholds.push({
          qualityId: String(qt.qualityId),
          minBasisPoints: Number(qt.minBasisPoints),
          maxBasisPoints: Number(qt.maxBasisPoints),
        });
      }
    }

    // If PRICE_CARD_LINKED and counterparty is a buyer, optionally link to a price card
    let buyerId: string | undefined;
    let priceCardId: string | undefined;
    if (counterpartyType === 'BUYER') {
      buyerId = counterparty.id;
      if (priceBasis === 'PRICE_CARD_LINKED' && p.priceCardId) {
        const card = e.buyers.snapshot().priceCards.find(pc => pc.id === String(p.priceCardId) && pc.buyerId === buyerId);
        if (!card) return reject(c, 'INVALID_PRICE_CARD', 'Price card not found for this buyer');
        priceCardId = card.id;
      }
    }

    const agreement: FrameAgreement = {
      id: e.ids.next('agreement', 'AGREEMENT'),
      companyId: company.id,
      counterpartyType: counterpartyType as 'BUYER' | 'SUPPLIER',
      counterpartyId: counterparty.id,
      displayName: String(p.displayName),
      validFromTimestamp: Number(p.validFromTimestamp),
      validUntilTimestamp: Number(p.validUntilTimestamp),
      committedVolumeMilliM3: Number(p.committedVolumeMilliM3),
      toleranceBasisPoints: Number(p.toleranceBasisPoints),
      deliveredVolumeMilliM3: 0,
      acceptedVolumeMilliM3: 0,
      priceBasis,
      ...(priceBasis === 'FIXED_RATE' ? { fixedRateMinorPerM3: Number(p.fixedRateMinorPerM3) } : {}),
      priceCardId: priceCardId ?? '',
      buyerId: buyerId ?? '',
      currency: 'EUR',
      paymentTermsSeconds: Number(p.paymentTermsSeconds),
      requiredSpeciesIds: speciesIds,
      requiredAssortmentIds: assortmentIds,
      qualityThresholds: qThresholds,
      status: 'PROPOSED',
      bonusMinor: 0,
      penaltyMinor: 0,
      createdTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    };
    const x = emit(e, c, 'FrameAgreementCreated', { agreement });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Lifecycle ──────────────────────────────────────────────────────
  e.registerCommandHandler('ActivateFrameAgreement', c => {
    const a = e.contracts.agreement(String(c.payload.agreementId));
    if (!a || a.status !== 'PROPOSED') return reject(c, 'INVALID_STATE', 'Agreement must be PROPOSED');
    if (e.clock.currentGameTime < a.validFromTimestamp || e.clock.currentGameTime > a.validUntilTimestamp)
      return reject(c, 'OUTSIDE_VALIDITY', 'Cannot activate outside validity period');

    const expiryEvent = scheduled(e, 'FrameAgreementExpired', a.validUntilTimestamp, { agreementId: a.id }, c.commandId);
    const x = emit(e, c, 'FrameAgreementActivated', { agreementId: a.id, scheduledEvents: [expiryEvent] });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('SuspendFrameAgreement', c => {
    const a = e.contracts.agreement(String(c.payload.agreementId));
    if (!a || a.status !== 'ACTIVE') return reject(c, 'INVALID_STATE', 'Agreement must be ACTIVE');
    const x = emit(e, c, 'FrameAgreementSuspended', { agreementId: a.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('TerminateFrameAgreement', c => {
    const a = e.contracts.agreement(String(c.payload.agreementId));
    if (!a || ['FULFILLED', 'EXPIRED', 'TERMINATED', 'BREACHED'].includes(a.status))
      return reject(c, 'INVALID_STATE', 'Agreement cannot be terminated');
    const x = emit(e, c, 'FrameAgreementTerminated', { agreementId: a.id });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  // ── Delivery ───────────────────────────────────────────────────────
  e.registerCommandHandler('RecordAgreementDelivery', c => {
    const p = c.payload;
    const agreement = e.contracts.agreement(String(p.agreementId));
    const load = e.inventory.load(String(p.loadId));

    if (!agreement || agreement.status !== 'ACTIVE')
      return reject(c, 'INVALID_AGREEMENT', 'Active agreement required');
    if (!load || !['ALLOCATED', 'READY', 'MOVED'].includes(load.status))
      return reject(c, 'INVALID_LOAD', 'Load must be allocated and ready');
    if (!int(p.volumeMilliM3, 1))
      return reject(c, 'INVALID_VOLUME', 'Positive volume required');

    // Check load composition matches agreement specs
    const batch = e.inventory.snapshot().batches.find(b =>
      e.inventory.snapshot().allocations.some(a =>
        a.batchId === b.id && a.loadId === load.id && ['ACTIVE', 'FINALIZED'].includes(a.status)
      )
    );

    if (batch) {
      // Check species
      const batchSpeciesIds = batch.composition.species.map(s => s.id);
      const matchSpecies = batchSpeciesIds.some(sid => agreement.requiredSpeciesIds.includes(sid));
      if (!matchSpecies) return reject(c, 'SPECIES_MISMATCH', 'Batch species not in agreement');

      // Check assortment
      const batchAssortmentIds = batch.composition.assortment.map(a => a.id);
      const matchAssortment = batchAssortmentIds.some(aid => agreement.requiredAssortmentIds.includes(aid));
      if (!matchAssortment) return reject(c, 'ASSORTMENT_MISMATCH', 'Batch assortment not in agreement');

      // Check quality thresholds if configured
      if (agreement.qualityThresholds.length > 0) {
        for (const qt of agreement.qualityThresholds) {
          const batchQuality = batch.composition.quality.find(q => q.id === qt.qualityId);
          if (batchQuality && (batchQuality.basisPoints < qt.minBasisPoints || batchQuality.basisPoints > qt.maxBasisPoints)) {
            return reject(c, 'QUALITY_REJECTED', `Batch quality ${qt.qualityId} outside agreement threshold`);
          }
        }
      }
    }

    // Calculate price
    let rateMinorPerM3: number;
    if (agreement.priceBasis === 'FIXED_RATE') {
      rateMinorPerM3 = agreement.fixedRateMinorPerM3!;
    } else if (agreement.priceBasis === 'PRICE_CARD_LINKED' && agreement.priceCardId) {
      const card = e.buyers.snapshot().priceCards.find(pc => pc.id === agreement.priceCardId);
      if (!card) return reject(c, 'NO_PRICE_CARD', 'Linked price card not found');
      rateMinorPerM3 = card.breakdown.finalRateMinorPerM3;
    } else {
      // Default rate
      rateMinorPerM3 = 5_000; // €50/m³ placeholder
    }

    const volume = Number(p.volumeMilliM3);
    const totalMinor = Number(BigInt(volume) * BigInt(rateMinorPerM3) / 1000n);
    if (!Number.isSafeInteger(totalMinor)) return reject(c, 'PRICE_OVERFLOW', 'Price calculation overflow');

    const delivery: AgreementDelivery = {
      id: e.ids.next('agreement_delivery', 'DELIVERY'),
      agreementId: agreement.id,
      loadId: load.id,
      volumeMilliM3: volume,
      acceptedVolumeMilliM3: 0,
      rejectedVolumeMilliM3: 0,
      rejectionReasonCodes: [],
      rateMinorPerM3,
      totalMinor,
      deliveredTimestamp: e.clock.currentGameTime,
      status: 'DELIVERED',
      sourceEventIds: [],
    };

    const x = emit(e, c, 'AgreementDeliveryRecorded', { delivery });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('AcceptAgreementDelivery', c => {
    const p = c.payload;
    const d = e.contracts.delivery(String(p.deliveryId));
    const agreement = d ? e.contracts.agreement(d.agreementId) : undefined;
    if (!d || d.status !== 'DELIVERED' || !agreement) return reject(c, 'INVALID_DELIVERY', 'Unprocessed delivery required');

    const volume = d.volumeMilliM3;
    const acceptedVolume = int(p.acceptedVolumeMilliM3, 1) ? Number(p.acceptedVolumeMilliM3) : volume;
    const rejectedVolume = volume - acceptedVolume;
    const rejectionCodes = p.rejectionReasonCodes ? (Array.isArray(p.rejectionReasonCodes) ? p.rejectionReasonCodes.map(String) : []) : [];

    // Use snapped rate from delivery (set at recording time)
    const rateMinorPerM3 = d.rateMinorPerM3;
    if (!int(rateMinorPerM3, 1)) return reject(c, 'INVALID_RATE', 'No snapped rate on delivery');
    const totalMinor = Number(BigInt(acceptedVolume) * BigInt(rateMinorPerM3) / 1000n);
    if (!Number.isSafeInteger(totalMinor)) return reject(c, 'PRICE_OVERFLOW', 'Price overflow');

    const x = emit(e, c, 'AgreementDeliveryAccepted', {
      deliveryId: d.id, acceptedVolumeMilliM3: acceptedVolume,
      rejectedVolumeMilliM3: rejectedVolume, rejectionReasonCodes: rejectionCodes,
      rateMinorPerM3, totalMinor,
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('SettleAgreementDelivery', c => {
    const p = c.payload;
    const d = e.contracts.delivery(String(p.deliveryId));
    const agreement = d ? e.contracts.agreement(d.agreementId) : undefined;
    if (!d || d.status !== 'ACCEPTED' || !agreement) return reject(c, 'INVALID_SETTLEMENT', 'Accepted delivery required');

    const rateMinorPerM3 = d.rateMinorPerM3;
    if (!int(rateMinorPerM3, 1)) return reject(c, 'INVALID_RATE', 'No snapped rate on delivery');
    const totalMinor = Number(BigInt(d.acceptedVolumeMilliM3) * BigInt(rateMinorPerM3) / 1000n);
    if (!Number.isSafeInteger(totalMinor)) return reject(c, 'PRICE_OVERFLOW', 'Price overflow');

    const isBuyer = agreement.counterpartyType === 'BUYER';
    const financeId = e.ids.next(isBuyer ? 'receivable' : 'payable', isBuyer ? 'RECEIVABLE' : 'PAYABLE');
    const journalId = e.ids.next('journal', 'JOURNAL');
    const costLayerId = e.ids.next('cost_layer', 'COST');
    const identity = e.reserveEventIdentity();
    const dueTimestamp = e.clock.currentGameTime + agreement.paymentTermsSeconds;

    const tx: JournalTransaction = {
      id: journalId,
      timestamp: e.clock.currentGameTime,
      eventId: identity.eventId,
      companyId: agreement.companyId,
      description: `Agreement delivery ${d.id}`,
      schemaVersion: 1,
      sourceObjectIds: [d.id, d.loadId, agreement.id],
      lines: [
        { accountId: isBuyer
            ? e.finance.snapshot().accounts.find(a => a.companyId === agreement.companyId && a.code === 'ACCOUNTS_RECEIVABLE')!.id
            : e.finance.snapshot().accounts.find(a => a.companyId === agreement.companyId && a.code === 'OPERATING_EXPENSE')!.id,
          debitMinor: totalMinor, creditMinor: 0, currency: 'EUR',
          category: 'AGREEMENT_SETTLEMENT', counterpartyId: agreement.counterpartyId,
          memo: `Agreement delivery ${d.id}`, ruleReference: 'STEP_12_AGREEMENT_RULES' },
        { accountId: isBuyer
            ? e.finance.snapshot().accounts.find(a => a.companyId === agreement.companyId && a.code === 'REVENUE')!.id
            : e.finance.snapshot().accounts.find(a => a.companyId === agreement.companyId && a.code === 'ACCOUNTS_PAYABLE')!.id,
          debitMinor: 0, creditMinor: totalMinor, currency: 'EUR',
          category: 'AGREEMENT_SETTLEMENT', counterpartyId: agreement.counterpartyId,
          memo: `Agreement delivery ${d.id}`, ruleReference: 'STEP_12_AGREEMENT_RULES' },
      ],
    };

    const costLayer: CostLayer = {
      id: costLayerId,
      attachedToType: 'LOAD',
      attachedToId: d.loadId,
      sourceObjectId: d.id,
      category: 'OPERATIONAL',
      currency: 'EUR',
      totalMinor,
      attributableVolumeMilliM3: d.acceptedVolumeMilliM3,
      allocationMethod: 'DIRECT',
      createdTimestamp: e.clock.currentGameTime,
      financeSourceId: financeId,
      provenanceReference: 'STEP_12_AGREEMENT_RULES',
      status: 'ACTIVE',
    };

    let settlementPayload: Record<string, unknown>;

    if (isBuyer) {
      const receivable: Receivable = {
        id: financeId,
        companyId: agreement.companyId,
        counterpartyId: agreement.counterpartyId,
        principalMinor: totalMinor,
        currency: 'EUR',
        invoiceTimestamp: e.clock.currentGameTime,
        dueTimestamp,
        status: 'OPEN',
        amountPaidMinor: 0,
        sourceEventId: identity.eventId,
        sourceObjectIds: [d.id, d.loadId, agreement.id],
        expectedPaymentNote: `Agreement delivery ${d.id}`,
        agingState: 'NOT_DUE',
      };
      settlementPayload = {
        deliveryId: d.id, agreementId: agreement.id, financeObjectType: 'RECEIVABLE',
        receivable, transaction: tx, costLayer,
        scheduledEvents: [
          scheduled(e, 'ReceivableBecameDue', dueTimestamp, { receivableId: financeId }, c.commandId),
          scheduled(e, 'ReceivableBecameOverdue', dueTimestamp + 1, { receivableId: financeId }, c.commandId),
        ],
        receivableId: financeId, transactionId: journalId, costLayerId,
      };
    } else {
      const payable: Payable = {
        id: financeId,
        companyId: agreement.companyId,
        counterpartyId: agreement.counterpartyId,
        principalMinor: totalMinor,
        currency: 'EUR',
        createdTimestamp: e.clock.currentGameTime,
        dueTimestamp,
        status: 'COMMITTED',
        amountPaidMinor: 0,
        sourceEventId: identity.eventId,
        sourceObjectIds: [d.id, d.loadId, agreement.id],
      };
      settlementPayload = {
        deliveryId: d.id, agreementId: agreement.id, financeObjectType: 'PAYABLE',
        payable, transaction: tx, costLayer,
        scheduledEvents: [
          scheduled(e, 'PayableBecameDue', dueTimestamp, { payableId: financeId }, c.commandId),
          scheduled(e, 'PayableBecameOverdue', dueTimestamp + 1, { payableId: financeId }, c.commandId),
        ],
        payableId: financeId, transactionId: journalId, costLayerId,
      };
    }

    const settlementEvent = e.emitReservedEvent(identity, {
      eventType: 'AgreementDeliverySettled',
      phase: SimulationPhase.FINANCIAL_SETTLEMENTS,
      actorId: c.actorId, targetIds: [d.id, agreement.id],
      parentCauseId: c.commandId, visibility: 'PLAYER_PRIVATE',
      payload: settlementPayload,
    });

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [settlementEvent.eventId] };
  });

  // ── Volume settlement (end-of-agreement bonus/penalty) ────────────
  e.registerCommandHandler('SettleAgreementVolume', c => {
    const a = e.contracts.agreement(String(c.payload.agreementId));
    if (!a || !['ACTIVE', 'EXPIRED', 'FULFILLED'].includes(a.status))
      return reject(c, 'INVALID_STATE', 'Agreement must be active or expired');
    const x = emit(e, c, 'AgreementVolumeSettled', {
      agreementId: a.id,
      bonusRateMinorPerM3: Number(c.payload.bonusRateMinorPerM3 ?? 200),
      penaltyRateMinorPerM3: Number(c.payload.penaltyRateMinorPerM3 ?? 500),
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });
}
