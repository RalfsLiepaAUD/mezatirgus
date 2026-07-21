export interface ExportBuyer {
  id: string;
  configId: string;
  displayName: string;
  fictional: true;
  buyerType: 'EXPORT_SAWMILL' | 'EXPORT_PULP' | 'EXPORT_ENERGY';
  companyId: string;
  locationId: string;
  status: 'ACTIVE' | 'INACTIVE';
  paymentTermsSeconds: number;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface ExportQuote {
  id: string;
  portLocationId: string;
  destinationLocationId: string;
  routeEdgeIds: string[];
  distanceMetres: number;
  travelSeconds: number;
  rateMinorPerM3: number;
  handlingCostMinor: number;
  documentationCostMinor: number;
  currency: 'EUR';
  status: 'OPEN' | 'ACCEPTED' | 'EXPIRED';
  createdTimestamp: number;
  expiryTimestamp: number;
  sourceEventIds: string[];
}

export interface ExportOrder {
  id: string;
  quoteId: string;
  companyId: string;
  exportBuyerId: string;
  portLocationId: string;
  destinationLocationId: string;
  routeEdgeIds: string[];
  volumeMilliM3: number;
  requiredDocumentTypes: string[];
  documentStatus: 'PENDING' | 'VALID' | 'MISSING';
  bookingStatus: 'PENDING' | 'CONFIRMED' | 'SLOT_MISSED';
  loadingStatus: 'PENDING' | 'LOADING' | 'LOADED';
  status: 'QUOTED' | 'BOOKED' | 'LOADING' | 'LOADED' | 'DEPARTED' | 'ARRIVED' | 'ACCEPTED' | 'SETTLED' | 'CANCELLED';
  bookedSlotTimestamp?: number;
  loadingStartTimestamp?: number;
  departureTimestamp?: number;
  arrivalTimestamp?: number;
  acceptedVolumeMilliM3: number;
  rejectedVolumeMilliM3: number;
  rateMinorPerM3: number;
  handlingCostMinor: number;
  documentationCostMinor: number;
  freightTotalMinor: number;
  totalRevenueMinor: number;
  receivableId?: string;
  payableId?: string;
  costLayerId?: string;
  transactionId?: string;
  createdTimestamp: number;
  sourceEventIds: string[];
}

export interface ExportsSnapshot {
  appliedEventIds: string[];
  buyers: ExportBuyer[];
  quotes: ExportQuote[];
  orders: ExportOrder[];
}
