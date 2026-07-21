export type MarketRegime = 'NORMAL' | 'BOOM' | 'RECESSION' | 'STAGNATION';
export type MarketDirection = 'UPWARD' | 'DOWNWARD' | 'STABLE';
export type SeasonalWindow = 'SPRING_THAW' | 'SUMMER' | 'AUTUMN' | 'WINTER';

export interface MarketDriver {
  id: string;
  displayName: string;
  category: 'DOMESTIC_DEMAND' | 'EXPORT_DEMAND' | 'SUPPLY_PRESSURE' | 'REGULATORY' | 'SEASONAL';
  valueBasisPoints: number;  // 0-10000, hidden truth intensity
  weightBasisPoints: number; // influence weight
  direction: MarketDirection;
  lastUpdatedTimestamp: number;
  sourceEventIds: string[];
}

export interface MarketRegimeState {
  regime: MarketRegime;
  transitionedAtTimestamp: number;
  durationDays: number; // how long since transition or creation
  sourceEventIds: string[];
}

export interface MarketObservation {
  id: string;
  timestamp: number;
  season: SeasonalWindow;
  reportedRegime: string;
  driverObservations: {
    driverId: string;
    displayName: string;
    reportedDirection: string;
    confidenceBasisPoints: number; // 0-10000, how certain the observation is
  }[];
  sourceEventId: string;
}

export interface MarketSnapshot {
  appliedEventIds: string[];
  regime: MarketRegimeState;
  drivers: MarketDriver[];
  season: SeasonalWindow;
  observations: MarketObservation[];
}
