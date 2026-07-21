import type { SimulationEngine } from '../core/engine.js';
import type { MarketDriver, MarketRegime, MarketObservation, SeasonalWindow } from './types.js';

export interface MarketReport {
  season: SeasonalWindow;
  regime: MarketRegime;
  driverCount: number;
  drivers: Array<{
    id: string;
    displayName: string;
    category: string;
    direction: string;
    valueBasisPoints: number;
    weightBasisPoints: number;
  }>;
  observationCount: number;
  latestObservation: MarketObservation | undefined;
  seasonalDegradationRateBasisPoints: number;
}

const SEASONAL_DEGRADATION: Record<SeasonalWindow, number> = {
  SPRING_THAW: 3000,
  SUMMER: 8000,
  AUTUMN: 5000,
  WINTER: 2000,
};

export function seasonalDegradationRate(season: SeasonalWindow): number {
  return SEASONAL_DEGRADATION[season] ?? 5000;
}

export function marketReport(e: SimulationEngine): MarketReport {
  const s = e.markets.snapshot();
  return {
    season: s.season,
    regime: s.regime.regime,
    driverCount: s.drivers.length,
    drivers: s.drivers.map(d => ({
      id: d.id,
      displayName: d.displayName,
      category: d.category,
      direction: d.direction,
      valueBasisPoints: d.valueBasisPoints,
      weightBasisPoints: d.weightBasisPoints,
    })),
    observationCount: s.observations.length,
    seasonalDegradationRateBasisPoints: seasonalDegradationRate(s.season),
    latestObservation: s.observations.length > 0
      ? structuredClone(s.observations[s.observations.length - 1])
      : undefined,
  };
}

export function marketDriverReport(e: SimulationEngine, driverId: string) {
  const d = e.markets.driver(driverId);
  if (!d) return undefined;
  return {
    id: d.id,
    displayName: d.displayName,
    category: d.category,
    direction: d.direction,
    valueBasisPoints: d.valueBasisPoints,
    weightBasisPoints: d.weightBasisPoints,
  };
}

export function marketObservations(e: SimulationEngine) {
  return e.markets.snapshot().observations.map(o => ({
    ...o,
  }));
}

export function marketSummary(e: SimulationEngine): string[] {
  const r = marketReport(e);
  const lines: string[] = [];
  lines.push(`Market regime: ${r.regime}`);
  lines.push(`Season: ${r.season}`);
  lines.push(`Drivers (${r.driverCount}):`);
  for (const d of r.drivers) {
    lines.push(`  ${d.displayName} [${d.category}] value=${d.valueBasisPoints}bp dir=${d.direction} wt=${d.weightBasisPoints}bp`);
  }
  lines.push(`Seasonal degradation: ${r.seasonalDegradationRateBasisPoints}bp`);
  lines.push(`Observations recorded: ${r.observationCount}`);
  if (r.latestObservation) {
    lines.push(`Latest observation: t=${r.latestObservation.timestamp} regime=${r.latestObservation.reportedRegime}`);
  }
  return lines;
}
