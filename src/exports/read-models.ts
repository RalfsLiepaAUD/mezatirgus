import type { SimulationEngine } from '../core/engine.js';
import type { ExportOrder, ExportQuote } from './types.js';

export interface ExportQuoteView {
  id: string;
  rateMinorPerM3: number;
  handlingCostMinor: number;
  documentationCostMinor: number;
  totalCostMinor: number;
  status: string;
  expiryTimestamp: number;
}

export interface ExportOrderView {
  id: string;
  status: string;
  volumeMilliM3: number;
  acceptedVolumeMilliM3: number;
  rejectedVolumeMilliM3: number;
  documentStatus: string;
  bookingStatus: string;
  loadingStatus: string;
  revenueMinor: number;
  receivableId: string | undefined;
  payableId: string | undefined;
}

export function exportQuoteList(e: SimulationEngine): ExportQuoteView[] {
  return e.exports.snapshot().quotes.map(q => ({
    id: q.id,
    rateMinorPerM3: q.rateMinorPerM3,
    handlingCostMinor: q.handlingCostMinor,
    documentationCostMinor: q.documentationCostMinor,
    totalCostMinor: q.rateMinorPerM3 + q.handlingCostMinor + q.documentationCostMinor,
    status: q.status,
    expiryTimestamp: q.expiryTimestamp,
  }));
}

export function exportOrderList(e: SimulationEngine): ExportOrderView[] {
  return e.exports.snapshot().orders.map(o => ({
    id: o.id,
    status: o.status,
    volumeMilliM3: o.volumeMilliM3,
    acceptedVolumeMilliM3: o.acceptedVolumeMilliM3,
    rejectedVolumeMilliM3: o.rejectedVolumeMilliM3,
    documentStatus: o.documentStatus,
    bookingStatus: o.bookingStatus,
    loadingStatus: o.loadingStatus,
    revenueMinor: o.totalRevenueMinor,
    receivableId: o.receivableId,
    payableId: o.payableId,
  }));
}

export function exportOrderDetail(e: SimulationEngine, orderId: string): ExportOrderView | undefined {
  return exportOrderList(e).find(x => x.id === orderId);
}

export function exportTimeline(e: SimulationEngine, orderId: string): string[] {
  const o = e.exports.order(orderId);
  if (!o) return ['Order not found'];
  const lines: string[] = [`Export order ${o.id}:`];
  lines.push(`  Status: ${o.status}`);
  lines.push(`  Volume: ${(o.volumeMilliM3 / 1000).toFixed(1)} m³`);
  lines.push(`  Accepted: ${(o.acceptedVolumeMilliM3 / 1000).toFixed(1)} m³`);
  lines.push(`  Documents: ${o.documentStatus}`);
  lines.push(`  Booking: ${o.bookingStatus}`);
  lines.push(`  Loading: ${o.loadingStatus}`);
  if (o.departureTimestamp) lines.push(`  Departed: t=${o.departureTimestamp}`);
  if (o.arrivalTimestamp) lines.push(`  Arrived: t=${o.arrivalTimestamp}`);
  if (o.receivableId) lines.push(`  Receivable: ${o.receivableId}`);
  if (o.payableId) lines.push(`  Payable: ${o.payableId}`);
  return lines;
}

export function exportsSummary(e: SimulationEngine): string[] {
  const lines: string[] = [];
  const buyers = e.exports.snapshot().buyers;
  const orders = e.exports.snapshot().orders;
  if (buyers.length) lines.push(`Export buyers: ${buyers.length}`);
  if (orders.length) {
    const active = orders.filter(o => !['SETTLED', 'CANCELLED'].includes(o.status));
    const settled = orders.filter(o => o.status === 'SETTLED');
    lines.push(`Export orders: ${orders.length} (${active.length} active, ${settled.length} settled)`);
  }
  return lines;
}
