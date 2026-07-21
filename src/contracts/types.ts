export interface QualityThreshold {
  qualityId: string;
  minBasisPoints: number;
  maxBasisPoints: number;
}

export interface FrameAgreement {
  id: string;
  companyId: string;
  counterpartyType: 'BUYER' | 'SUPPLIER';
  counterpartyId: string;
  displayName: string;
  validFromTimestamp: number;
  validUntilTimestamp: number;
  committedVolumeMilliM3: number;
  toleranceBasisPoints: number;
  deliveredVolumeMilliM3: number;
  acceptedVolumeMilliM3: number;
  priceBasis: 'FIXED_RATE' | 'PRICE_CARD_LINKED';
  fixedRateMinorPerM3?: number;
  priceCardId: string;
  buyerId: string;
  currency: 'EUR';
  paymentTermsSeconds: number;
  requiredSpeciesIds: string[];
  requiredAssortmentIds: string[];
  qualityThresholds: QualityThreshold[];
  status: 'PROPOSED' | 'ACTIVE' | 'SUSPENDED' | 'FULFILLED' | 'EXPIRED' | 'TERMINATED' | 'BREACHED';
  bonusMinor: number;
  penaltyMinor: number;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface AgreementDelivery {
  id: string;
  agreementId: string;
  loadId: string;
  volumeMilliM3: number;
  acceptedVolumeMilliM3: number;
  rejectedVolumeMilliM3: number;
  rejectionReasonCodes: string[];
  rateMinorPerM3: number;
  totalMinor: number;
  receivableId?: string;
  transactionId?: string;
  costLayerId?: string;
  deliveredTimestamp: number;
  status: 'DELIVERED' | 'ACCEPTED' | 'REJECTED' | 'SETTLED';
  sourceEventIds: string[];
}

export interface ContractsSnapshot {
  appliedEventIds: string[];
  agreements: FrameAgreement[];
  deliveries: AgreementDelivery[];
}
