import type { DomainEvent } from '../core/events.js';
import type { ContractsSnapshot } from './types.js';
import type { InvariantMode } from '../core/constants.js';

const cp = <T>(x: T): T => structuredClone(x);

const EVENTS = new Set([
  'FrameAgreementCreated',
  'FrameAgreementActivated',
  'FrameAgreementSuspended',
  'FrameAgreementTerminated',
  'FrameAgreementExpired',
  'FrameAgreementFulfilled',
  'FrameAgreementBreached',
  'AgreementDeliveryRecorded',
  'AgreementDeliveryAccepted',
  'AgreementDeliverySettled',
  'AgreementVolumeSettled',
]);

export const emptyContracts = (): ContractsSnapshot => ({
  appliedEventIds: [],
  agreements: [],
  deliveries: [],
});

export class ContractsDomain {
  private state: ContractsSnapshot;
  private invariantMode: InvariantMode = 'FULL';
  setInvariantMode(m: InvariantMode) { this.invariantMode = m; }
  checkInvariants() { this.assertInvariants(); }

  constructor(initial?: ContractsSnapshot) {
    this.state = initial ? cp(initial) : emptyContracts();
    if (this.invariantMode === 'FULL') this.assertInvariants();
  }

  snapshot(): ContractsSnapshot { return cp(this.state); }

  agreement(id: string) { return this.state.agreements.find(x => x.id === id); }
  delivery(id: string) { return this.state.deliveries.find(x => x.id === id); }

  deliveriesForAgreement(agreementId: string) {
    return this.state.deliveries.filter(x => x.agreementId === agreementId);
  }

  activeAgreementForCounterparty(counterpartyId: string, counterpartyType: 'BUYER' | 'SUPPLIER') {
    return this.state.agreements.find(x =>
      x.counterpartyId === counterpartyId &&
      x.counterpartyType === counterpartyType &&
      ['ACTIVE'].includes(x.status)
    );
  }

  apply(event: DomainEvent) {
    if (!EVENTS.has(event.eventType)) return;
    if (this.state.appliedEventIds.includes(event.eventId))
      throw new Error('Duplicate contracts event: ' + event.eventId);

    const p = event.payload as any;

    if (event.eventType === 'FrameAgreementCreated') {
      const x = cp(p.agreement);
      x.sourceEventIds = [event.eventId];
      this.state.agreements.push(x);

    } else if (event.eventType === 'FrameAgreementActivated') {
      const a = this.agreement(p.agreementId);
      if (a && a.status === 'PROPOSED') {
        a.status = 'ACTIVE';
        a.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'FrameAgreementSuspended') {
      const a = this.agreement(p.agreementId);
      if (a && a.status === 'ACTIVE') {
        a.status = 'SUSPENDED';
        a.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'FrameAgreementTerminated') {
      const a = this.agreement(p.agreementId);
      if (a && !['FULFILLED', 'EXPIRED', 'TERMINATED'].includes(a.status)) {
        a.status = 'TERMINATED';
        a.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'FrameAgreementExpired') {
      const a = this.agreement(p.agreementId);
      if (a && a.status === 'ACTIVE') {
        a.status = 'EXPIRED';
        this.evaluateEndState(a, event);
      }

    } else if (event.eventType === 'FrameAgreementFulfilled') {
      const a = this.agreement(p.agreementId);
      if (a && a.status === 'ACTIVE') {
        a.status = 'FULFILLED';
        a.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'FrameAgreementBreached') {
      const a = this.agreement(p.agreementId);
      if (a && a.status === 'ACTIVE') {
        this.evaluateEndState(a, event);
      }

    } else if (event.eventType === 'AgreementDeliveryRecorded') {
      const d = cp(p.delivery);
      d.sourceEventIds = [event.eventId];
      this.state.deliveries.push(d);
      const a = this.agreement(p.delivery.agreementId);
      if (a) {
        a.deliveredVolumeMilliM3 += d.volumeMilliM3;
        a.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'AgreementDeliveryAccepted') {
      const d = this.delivery(p.deliveryId);
      if (d && d.status === 'DELIVERED') {
        d.status = 'ACCEPTED';
        d.acceptedVolumeMilliM3 = p.acceptedVolumeMilliM3;
        d.rejectedVolumeMilliM3 = p.rejectedVolumeMilliM3;
        d.rejectionReasonCodes = p.rejectionReasonCodes ?? [];
        d.rateMinorPerM3 = p.rateMinorPerM3;
        d.totalMinor = p.totalMinor;
        d.sourceEventIds.push(event.eventId);
        const a = this.agreement(d.agreementId);
        if (a) {
          a.acceptedVolumeMilliM3 += d.acceptedVolumeMilliM3;
          a.sourceEventIds.push(event.eventId);
        }
      }

    } else if (event.eventType === 'AgreementDeliverySettled') {
      const d = this.delivery(p.deliveryId);
      if (d && d.status === 'ACCEPTED') {
        d.status = 'SETTLED';
        d.receivableId = p.receivableId;
        d.transactionId = p.transactionId;
        d.costLayerId = p.costLayerId;
        d.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'AgreementVolumeSettled') {
      const a = this.agreement(p.agreementId);
      if (a && ['ACTIVE', 'EXPIRED', 'FULFILLED'].includes(a.status)) {
        // Calculate bonus/penalty at settlement (only if deliveries exist)
        const committed = a.committedVolumeMilliM3;
        const accepted = a.acceptedVolumeMilliM3;
        if (accepted > 0) {
          const toleranceVolume = Number(BigInt(committed) * BigInt(a.toleranceBasisPoints) / 10000n);
          const minVolume = committed - toleranceVolume;
          const maxVolume = committed + toleranceVolume;

          if (accepted < minVolume) {
            // Under-delivery penalty
            const shortfall = minVolume - accepted;
            a.penaltyMinor = Number(BigInt(shortfall) * BigInt(p.penaltyRateMinorPerM3 ?? 500) / 1000n);
            a.status = 'BREACHED';
          } else {
            // Within or above tolerance
            if (accepted > maxVolume) {
              const excess = accepted - maxVolume;
              a.bonusMinor = Number(BigInt(excess) * BigInt(p.bonusRateMinorPerM3 ?? 200) / 1000n);
            }
            a.status = 'FULFILLED';
          }
        }
        a.sourceEventIds.push(event.eventId);
      }
    }

    this.state.appliedEventIds.push(event.eventId);
    if (this.invariantMode === 'FULL') this.assertInvariants();
  }

  private evaluateEndState(a: { status: string; committedVolumeMilliM3: number; acceptedVolumeMilliM3: number; toleranceBasisPoints: number; bonusMinor: number; penaltyMinor: number; sourceEventIds: string[]; id: string }, event: DomainEvent) {
    // Only check volume commitment if there were deliveries
    const committed = a.committedVolumeMilliM3;
    const accepted = a.acceptedVolumeMilliM3;
    if (committed > 0 && accepted > 0) {
      const toleranceVolume = Number(BigInt(committed) * BigInt(a.toleranceBasisPoints) / 10000n);
      const minVolume = committed - toleranceVolume;
      if (accepted < minVolume) {
        a.status = 'BREACHED';
      } else {
        a.status = 'FULFILLED';
      }
    } else if (accepted > 0) {
      a.status = 'FULFILLED';
    } else {
      a.status = 'EXPIRED';
    }
    a.sourceEventIds.push(event.eventId);
  }

  assertInvariants() {
    if (new Set(this.state.appliedEventIds).size !== this.state.appliedEventIds.length)
      throw new Error('Duplicate contracts event ID');

    const ids = new Set<string>();
    for (const x of [...this.state.agreements, ...this.state.deliveries]) {
      if (ids.has(x.id)) throw new Error('Duplicate contracts ID: ' + x.id);
      ids.add(x.id);
    }

    for (const a of this.state.agreements) {
      if (!Number.isSafeInteger(a.committedVolumeMilliM3) || a.committedVolumeMilliM3 <= 0)
        throw new Error('Invalid agreement committed volume');
      if (a.deliveredVolumeMilliM3 < 0 || a.acceptedVolumeMilliM3 < 0)
        throw new Error('Invalid agreement volume');
      if (a.acceptedVolumeMilliM3 > a.deliveredVolumeMilliM3)
        throw new Error('Accepted volume exceeds delivered volume');
    }
  }
}
