import type { DomainEvent } from '../core/events.js';
import type { ExportsSnapshot } from './types.js';

const cp = <T>(x: T): T => structuredClone(x);

const EVENTS = new Set([
  'ExportBuyerCreated',
  'ExportQuoteCreated',
  'ExportQuoteAccepted',
  'ExportQuoteExpired',
  'ExportOrderCreated',
  'ExportDocumentsValidated',
  'ExportSlotConfirmed',
  'ExportLoadStarted',
  'ExportLoadCompleted',
  'ExportVesselDeparted',
  'ExportVesselArrived',
  'ExportCargoAccepted',
  'ExportCargoRejected',
  'ExportOrderSettled',
  'ExportOrderCancelled',
  'ExportCostPayableCreated',
]);

export const emptyExports = (): ExportsSnapshot => ({
  appliedEventIds: [],
  buyers: [],
  quotes: [],
  orders: [],
});

export class ExportsDomain {
  private state: ExportsSnapshot;

  constructor(initial?: ExportsSnapshot) {
    this.state = initial ? cp(initial) : emptyExports();
    this.assertInvariants();
  }

  snapshot(): ExportsSnapshot { return cp(this.state); }

  buyer(id: string) { return this.state.buyers.find(x => x.id === id); }
  quote(id: string) { return this.state.quotes.find(x => x.id === id); }
  order(id: string) { return this.state.orders.find(x => x.id === id); }

  apply(event: DomainEvent) {
    if (!EVENTS.has(event.eventType)) return;
    if (this.state.appliedEventIds.includes(event.eventId))
      throw new Error('Duplicate exports event: ' + event.eventId);

    const p = event.payload as any;

    if (event.eventType === 'ExportBuyerCreated') {
      const x = cp(p.buyer);
      x.sourceEventIds = [event.eventId];
      this.state.buyers.push(x);

    } else if (event.eventType === 'ExportQuoteCreated') {
      const x = cp(p.quote);
      x.sourceEventIds = [event.eventId];
      this.state.quotes.push(x);

    } else if (event.eventType === 'ExportQuoteAccepted') {
      const q = this.quote(p.quoteId);
      if (q?.status === 'OPEN') {
        q.status = 'ACCEPTED';
        q.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportQuoteExpired') {
      const q = this.quote(p.quoteId);
      if (q?.status === 'OPEN') {
        q.status = 'EXPIRED';
        q.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportOrderCreated') {
      const x = cp(p.order);
      x.sourceEventIds = [event.eventId];
      this.state.orders.push(x);

    } else if (event.eventType === 'ExportDocumentsValidated') {
      const o = this.order(p.orderId);
      if (o && o.status === 'QUOTED') {
        o.documentStatus = p.valid ? 'VALID' : 'MISSING';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportSlotConfirmed') {
      const o = this.order(p.orderId);
      if (o && o.documentStatus === 'VALID' && o.status === 'QUOTED') {
        o.bookingStatus = 'CONFIRMED';
        o.bookedSlotTimestamp = p.slotTimestamp;
        o.status = 'BOOKED';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportLoadStarted') {
      const o = this.order(p.orderId);
      if (o && o.status === 'BOOKED') {
        o.loadingStatus = 'LOADING';
        o.loadingStartTimestamp = event.gameTime;
        o.status = 'LOADING';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportLoadCompleted') {
      const o = this.order(p.orderId);
      if (o && o.status === 'LOADING') {
        o.loadingStatus = 'LOADED';
        o.status = 'LOADED';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportVesselDeparted') {
      const o = this.order(p.orderId);
      if (o && o.status === 'LOADED') {
        o.status = 'DEPARTED';
        o.departureTimestamp = event.gameTime;
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportVesselArrived') {
      const o = this.order(p.orderId);
      if (o && o.status === 'DEPARTED') {
        o.status = 'ARRIVED';
        o.arrivalTimestamp = event.gameTime;
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportCargoAccepted') {
      const o = this.order(p.orderId);
      if (o && o.status === 'ARRIVED') {
        o.acceptedVolumeMilliM3 = p.acceptedVolumeMilliM3;
        o.rejectedVolumeMilliM3 = p.rejectedVolumeMilliM3;
        o.totalRevenueMinor = Number(BigInt(p.acceptedVolumeMilliM3) * BigInt(o.rateMinorPerM3) / 1000n);
        o.status = 'ACCEPTED';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportOrderSettled') {
      const o = this.order(p.orderId);
      if (o && o.status === 'ACCEPTED') {
        o.status = 'SETTLED';
        o.receivableId = p.receivableId;
        o.transactionId = p.transactionId;
        o.costLayerId = p.costLayerId;
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportOrderCancelled') {
      const o = this.order(p.orderId);
      if (o && !['SETTLED', 'CANCELLED'].includes(o.status)) {
        o.status = 'CANCELLED';
        o.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'ExportCostPayableCreated') {
      const o = this.order(p.orderId);
      if (o) {
        o.payableId = p.payableId;
        o.sourceEventIds.push(event.eventId);
      }
    }

    this.state.appliedEventIds.push(event.eventId);
    this.assertInvariants();
  }

  assertInvariants() {
    if (new Set(this.state.appliedEventIds).size !== this.state.appliedEventIds.length)
      throw new Error('Duplicate exports event ID');

    const ids = new Set<string>();
    for (const x of [...this.state.buyers, ...this.state.quotes, ...this.state.orders]) {
      if (ids.has(x.id)) throw new Error('Duplicate exports ID: ' + x.id);
      ids.add(x.id);
    }

    for (const o of this.state.orders) {
      if (!Number.isSafeInteger(o.volumeMilliM3) || o.volumeMilliM3 <= 0)
        throw new Error('Invalid export order volume');
      if (!Number.isSafeInteger(o.rateMinorPerM3) || o.rateMinorPerM3 < 0)
        throw new Error('Invalid export rate');
    }
  }
}
