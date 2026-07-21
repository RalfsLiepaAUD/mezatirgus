import type { SimulationEngine } from '../core/engine.js';
import type { FrameAgreement, AgreementDelivery } from './types.js';

export interface AgreementCardView {
  id: string;
  displayName: string;
  counterpartyType: string;
  counterpartyDisplayName: string | undefined;
  status: string;
  validFromTimestamp: number;
  validUntilTimestamp: number;
  committedVolumeMilliM3: number;
  deliveredVolumeMilliM3: number;
  acceptedVolumeMilliM3: number;
  remainingVolumeMilliM3: number;
  toleranceBasisPoints: number;
  volumeUtilizationBasisPoints: number;
  priceDescription: string;
  deliveryCount: number;
  bonusMinor: number;
  penaltyMinor: number;
}

export interface AgreementDeliveryView {
  id: string;
  loadId: string;
  volumeMilliM3: number;
  acceptedVolumeMilliM3: number;
  rejectedVolumeMilliM3: number;
  status: string;
  rateMinorPerM3: number;
  totalMinor: number;
}

export function agreementList(e: SimulationEngine): AgreementCardView[] {
  return e.contracts.snapshot().agreements.map(a => {
    const counterpartyName = a.counterpartyType === 'BUYER'
      ? e.buyers.buyer(a.counterpartyId)?.displayName
      : e.suppliers.snapshot().suppliers.find(s => s.id === a.counterpartyId)?.displayName;

    const deliveries = e.contracts.deliveriesForAgreement(a.id);
    const remaining = a.committedVolumeMilliM3 - a.acceptedVolumeMilliM3;

    return {
      id: a.id,
      displayName: a.displayName,
      counterpartyType: a.counterpartyType,
      counterpartyDisplayName: counterpartyName,
      status: a.status,
      validFromTimestamp: a.validFromTimestamp,
      validUntilTimestamp: a.validUntilTimestamp,
      committedVolumeMilliM3: a.committedVolumeMilliM3,
      deliveredVolumeMilliM3: a.deliveredVolumeMilliM3,
      acceptedVolumeMilliM3: a.acceptedVolumeMilliM3,
      remainingVolumeMilliM3: Math.max(0, remaining),
      toleranceBasisPoints: a.toleranceBasisPoints,
      volumeUtilizationBasisPoints: a.committedVolumeMilliM3 > 0
        ? Math.floor(a.acceptedVolumeMilliM3 * 10_000 / a.committedVolumeMilliM3)
        : 0,
      priceDescription: a.priceBasis === 'FIXED_RATE'
        ? `€${(a.fixedRateMinorPerM3! / 100).toFixed(2)}/m³`
        : 'Price card linked',
      deliveryCount: deliveries.length,
      bonusMinor: a.bonusMinor,
      penaltyMinor: a.penaltyMinor,
    };
  });
}

export function agreementDetail(e: SimulationEngine, agreementId: string): AgreementCardView | undefined {
  return agreementList(e).find(x => x.id === agreementId);
}

export function agreementDeliveries(e: SimulationEngine, agreementId: string): AgreementDeliveryView[] {
  return e.contracts.deliveriesForAgreement(agreementId).map(d => ({
    id: d.id,
    loadId: d.loadId,
    volumeMilliM3: d.volumeMilliM3,
    acceptedVolumeMilliM3: d.acceptedVolumeMilliM3,
    rejectedVolumeMilliM3: d.rejectedVolumeMilliM3,
    status: d.status,
    rateMinorPerM3: d.rateMinorPerM3,
    totalMinor: d.totalMinor,
  }));
}

export function agreementsSummary(e: SimulationEngine): string[] {
  const lines: string[] = [];
  const agreements = agreementList(e);
  if (!agreements.length) return ['No frame agreements'];
  lines.push(`Frame agreements: ${agreements.length}`);
  for (const a of agreements) {
    const pct = (a.volumeUtilizationBasisPoints / 100).toFixed(1);
    lines.push(`  ${a.displayName} (${a.status}): ${Math.floor(a.acceptedVolumeMilliM3 / 1000)}/${Math.floor(a.committedVolumeMilliM3 / 1000)} m³ (${pct}%)`);
    if (a.bonusMinor > 0) lines.push(`    Bonus: €${(a.bonusMinor / 100).toFixed(2)}`);
    if (a.penaltyMinor > 0) lines.push(`    Penalty: €${(a.penaltyMinor / 100).toFixed(2)}`);
    lines.push(`    Deliveries: ${a.deliveryCount}`);
  }
  return lines;
}
