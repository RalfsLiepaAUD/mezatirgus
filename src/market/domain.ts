import type { DomainEvent } from '../core/events.js';
import type { MarketObservation, MarketDriver, MarketRegimeState, MarketDirection, MarketRegime, MarketSnapshot, SeasonalWindow } from './types.js';

const cp = <T>(x: T): T => structuredClone(x);

const EVENTS = new Set([
  'MarketCreated',
  'MarketRegimeChanged',
  'MarketDriverUpdated',
  'MarketSeasonAdvanced',
  'MarketObservationRecorded',
]);

export const emptyMarket = (): MarketSnapshot => ({
  appliedEventIds: [],
  regime: { regime: 'NORMAL', transitionedAtTimestamp: 0, durationDays: 0, sourceEventIds: [] },
  drivers: [],
  season: 'SUMMER',
  observations: [],
});

export class MarketDomain {
  private state: MarketSnapshot;

  constructor(initial?: MarketSnapshot) {
    this.state = initial ? cp(initial) : emptyMarket();
    this.assertInvariants();
  }

  snapshot(): MarketSnapshot { return cp(this.state); }
  restore(s: MarketSnapshot) { this.state = cp(s); this.assertInvariants(); }

  get regime() { return this.state.regime; }
  get drivers() { return this.state.drivers; }
  get season() { return this.state.season; }
  get observations() { return this.state.observations; }

  driver(id: string) { return this.state.drivers.find(x => x.id === id); }

  apply(event: DomainEvent) {
    if (!EVENTS.has(event.eventType)) return;
    if (this.state.appliedEventIds.includes(event.eventId))
      throw new Error('Duplicate market event: ' + event.eventId);

    const p = event.payload as any;

    if (event.eventType === 'MarketCreated') {
      this.state.regime = cp(p.regime);
      this.state.drivers = cp(p.drivers);
      this.state.season = p.season as SeasonalWindow;
      this.state.regime.sourceEventIds = [event.eventId];
      for (const d of this.state.drivers) d.sourceEventIds = [event.eventId];

    } else if (event.eventType === 'MarketRegimeChanged') {
      this.state.regime.regime = p.regime as MarketRegime;
      this.state.regime.transitionedAtTimestamp = event.gameTime;
      this.state.regime.durationDays = 0;
      this.state.regime.sourceEventIds.push(event.eventId);

    } else if (event.eventType === 'MarketDriverUpdated') {
      const d = this.driver(p.driverId);
      if (d) {
        d.valueBasisPoints = p.valueBasisPoints;
        d.direction = p.direction as MarketDirection;
        d.lastUpdatedTimestamp = event.gameTime;
        d.sourceEventIds.push(event.eventId);
      }

    } else if (event.eventType === 'MarketSeasonAdvanced') {
      this.state.season = p.season as SeasonalWindow;

    } else if (event.eventType === 'MarketObservationRecorded') {
      const obs = cp(p.observation) as MarketObservation;
      obs.sourceEventId = event.eventId;
      this.state.observations.push(obs);
    }

    this.state.appliedEventIds.push(event.eventId);
    this.assertInvariants();
  }

  assertInvariants() {
    if (new Set(this.state.appliedEventIds).size !== this.state.appliedEventIds.length)
      throw new Error('Duplicate market event ID');
    if (!['SPRING_THAW', 'SUMMER', 'AUTUMN', 'WINTER'].includes(this.state.season))
      throw new Error('Invalid seasonal window');
    if (!['NORMAL', 'BOOM', 'RECESSION', 'STAGNATION'].includes(this.state.regime.regime))
      throw new Error('Invalid market regime');
    for (const d of this.state.drivers) {
      if (!Number.isSafeInteger(d.valueBasisPoints) || d.valueBasisPoints < 0 || d.valueBasisPoints > 10000)
        throw new Error('Driver valueBasisPoints out of range');
      if (!Number.isSafeInteger(d.weightBasisPoints) || d.weightBasisPoints < 0 || d.weightBasisPoints > 10000)
        throw new Error('Driver weightBasisPoints out of range');
    }
  }
}
