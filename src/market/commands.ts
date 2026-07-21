import type { CommandEnvelope, CommandResult } from '../core/commands.js';
import type { SimulationEngine } from '../core/engine.js';
import { SimulationPhase } from '../core/phases.js';
import type { MarketDirection, MarketRegime, SeasonalWindow } from './types.js';
import { hunger, priceBreakdown } from '../buyer/pricing.js';

const reject = (c: CommandEnvelope, code: string, message: string): CommandResult => ({
  accepted: false, commandId: c.commandId, code, message,
});

const validRegimes = ['NORMAL', 'BOOM', 'RECESSION', 'STAGNATION'] as const;
const validSeasons = ['SPRING_THAW', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
const validDriverCategories = ['DOMESTIC_DEMAND', 'EXPORT_DEMAND', 'SUPPLY_PRESSURE', 'REGULATORY', 'SEASONAL'] as const;

function emit(e: SimulationEngine, c: CommandEnvelope, type: string, payload: Record<string, unknown>) {
  const i = e.reserveEventIdentity();
  return e.emitReservedEvent(i, {
    eventType: type, phase: SimulationPhase.COMMANDS, actorId: c.actorId,
    targetIds: [], parentCauseId: c.commandId, visibility: 'PLAYER_PRIVATE', payload,
  });
}

export function registerMarketCommands(e: SimulationEngine) {
  e.registerCommandHandler('CreateMarket', c => {
    const p = c.payload;
    const initialDrivers = Array.isArray(p.drivers) ? p.drivers : [];
    if (!Array.isArray(initialDrivers) || initialDrivers.length === 0)
      return reject(c, 'NO_DRIVERS', 'At least one market driver required');

    const regime = validRegimes.includes(String(p.regime) as any) ? String(p.regime) as MarketRegime : 'NORMAL';
    const season = validSeasons.includes(String(p.season) as any) ? String(p.season) as SeasonalWindow : 'SUMMER';

    const drivers = initialDrivers.map((d: any, i: number) => ({
      id: `MARKET_DRIVER_${String(i + 1).padStart(6, '0')}`,
      displayName: String(d.displayName ?? `Driver ${i + 1}`),
      category: validDriverCategories.includes(String(d.category) as any) ? String(d.category) : 'DOMESTIC_DEMAND',
      valueBasisPoints: Number(d.valueBasisPoints ?? 5000),
      weightBasisPoints: Number(d.weightBasisPoints ?? 5000),
      direction: (['UPWARD', 'DOWNWARD', 'STABLE'].includes(String(d.direction)) ? String(d.direction) : 'STABLE') as MarketDirection,
      lastUpdatedTimestamp: e.clock.currentGameTime,
      sourceEventIds: [],
    }));

    const regimeState = {
      regime,
      transitionedAtTimestamp: e.clock.currentGameTime,
      durationDays: 0,
      sourceEventIds: [],
    };

    const x = emit(e, c, 'MarketCreated', { regime: regimeState, drivers, season });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [x.eventId] };
  });

  e.registerCommandHandler('UpdateMarketDriver', c => {
    const d = e.markets.driver(String(c.payload.driverId));
    const value = Number(c.payload.valueBasisPoints);
    if (!d) return reject(c, 'DRIVER_NOT_FOUND', 'Market driver not found');
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000)
      return reject(c, 'INVALID_VALUE', 'valueBasisPoints must be 0-10000');
    const direction = ['UPWARD', 'DOWNWARD', 'STABLE'].includes(String(c.payload.direction))
      ? String(c.payload.direction) as MarketDirection : d.direction;
    const marketEvent = emit(e, c, 'MarketDriverUpdated', {
      driverId: d.id, valueBasisPoints: value, direction,
    });
    const ids = [marketEvent.eventId];

    // Integration: export-demand driver changes propagate to buyer price cards
    if (d.category === 'EXPORT_DEMAND') {
      const s = e.buyers.snapshot();
      const adjustmentBp = Math.round((value - 5000) * 200 / 5000); // ±2000bp at extremes
      for (const buyer of s.buyers) {
        if (buyer.status !== 'ACTIVE') continue;
        const activeCards = s.priceCards.filter(pc =>
          pc.buyerId === buyer.id && pc.status === 'ACTIVE');
        for (const oldCard of activeCards) {
          const newBase = Math.round(oldCard.breakdown.baseRateMinorPerM3 * (10000 + adjustmentBp) / 10000);
          const bd = priceBreakdown(newBase, buyer.hungerBasisPoints, buyer.stockMilliM3, buyer.capacityMilliM3,
            oldCard.paymentOption === 'INSTANT' ? buyer.instantPaymentDiscountMinorPerM3 : 0);
          const identity = e.reserveEventIdentity();
          const priceCard = {
            id: e.ids.next('price_card', 'PRICECARD'),
            buyerId: buyer.id,
            schemaVersion: 1 as const,
            currency: 'EUR' as const,
            speciesId: oldCard.speciesId,
            assortmentId: oldCard.assortmentId,
            paymentOption: oldCard.paymentOption,
            createdTimestamp: e.clock.currentGameTime,
            breakdown: { ...bd, causeEventIds: [marketEvent.eventId, ...buyer.sourceEventIds] },
            status: 'ACTIVE' as const,
            sourceEventIds: [],
          };
          const pcEvent = e.emitReservedEvent(identity, {
            eventType: 'BuyerPriceCardPublished',
            phase: SimulationPhase.COMMANDS,
            actorId: c.actorId,
            targetIds: [buyer.id],
            parentCauseId: c.commandId,
            visibility: 'PLAYER_PRIVATE',
            payload: { priceCard },
          });
          ids.push(pcEvent.eventId);
        }
      }
    }

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: ids };
  });

  e.registerCommandHandler('TransitionMarketRegime', c => {
    const regime = String(c.payload.regime);
    if (!validRegimes.includes(regime as any))
      return reject(c, 'INVALID_REGIME', 'Invalid market regime');
    const regimeEvent = emit(e, c, 'MarketRegimeChanged', { regime });
    const ids = [regimeEvent.eventId];

    // Integration: regime change adjusts buyer demand (affects hunger → price cards)
    const regimeMultipliers: Record<string, number> = { NORMAL: 100, BOOM: 115, RECESSION: 85, STAGNATION: 95 };
    const mult = regimeMultipliers[regime] ?? 100;
    for (const buyer of e.buyers.snapshot().buyers) {
      if (buyer.status !== 'ACTIVE') continue;
      const newTarget = Math.round(buyer.targetStockMilliM3 * mult / 100);
      const newConsumption = Math.round(buyer.consumptionMilliM3PerDay * mult / 100);
      if (newTarget === buyer.targetStockMilliM3 && newConsumption === buyer.consumptionMilliM3PerDay) continue;
      const identity = e.reserveEventIdentity();
      const demandEvent = e.emitReservedEvent(identity, {
        eventType: 'BuyerDemandChanged',
        phase: SimulationPhase.COMMANDS,
        actorId: c.actorId,
        targetIds: [buyer.id],
        parentCauseId: c.commandId,
        visibility: 'PLAYER_PRIVATE',
        payload: {
          buyerId: buyer.id, targetStockMilliM3: newTarget, consumptionMilliM3PerDay: newConsumption,
          hungerBasisPoints: hunger(buyer.stockMilliM3, newTarget),
          regimeEventId: regimeEvent.eventId,
        },
      });
      ids.push(demandEvent.eventId);
    }

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: ids };
  });

  e.registerCommandHandler('AdvanceMarketSeason', c => {
    const season = String(c.payload.season);
    if (!validSeasons.includes(season as any))
      return reject(c, 'INVALID_SEASON', 'Invalid seasonal window');
    const currentSeason = e.markets.snapshot().season;
    const x = emit(e, c, 'MarketSeasonAdvanced', { season });
    const ids = [x.eventId];

    // Integration: SPRING_THAW blocks GRAVEL and FOREST_ROAD; other seasons restore them
    const thawAffected = ['GRAVEL', 'FOREST_ROAD'];
    if (currentSeason !== 'SPRING_THAW' && season === 'SPRING_THAW') {
      for (const edge of e.routing.snapshot().edges) {
        if (thawAffected.includes(edge.accessClass) && edge.accessState === 'OPEN') {
          const ev = emit(e, c, 'RouteEdgeAccessChanged', { edgeId: edge.id, accessState: 'BLOCKED' });
          ids.push(ev.eventId);
        }
      }
    } else if (currentSeason === 'SPRING_THAW' && season !== 'SPRING_THAW') {
      for (const edge of e.routing.snapshot().edges) {
        if (thawAffected.includes(edge.accessClass) && edge.accessState === 'BLOCKED') {
          const ev = emit(e, c, 'RouteEdgeAccessChanged', { edgeId: edge.id, accessState: 'OPEN' });
          ids.push(ev.eventId);
        }
      }
    }

    // Integration: seasonal degradation of inventory batches
    const rate = { SPRING_THAW: 3000, SUMMER: 8000, AUTUMN: 5000, WINTER: 2000 }[season] ?? 5000;
    const thresholdAging = 3000; // FRESH→AGING at or above this rate
    const thresholdDegraded = 6000; // AGING→DEGRADED at or above this rate
    for (const batch of e.inventory.snapshot().batches) {
      if (['SPLIT', 'MERGED', 'DEPLETED', 'CANCELLED', 'CLOSED'].includes(batch.status)) continue;
      const prev = batch.freshness;
      let next = prev;
      if (prev === 'FRESH' && rate >= thresholdAging) next = 'AGING';
      else if (prev === 'AGING' && rate >= thresholdDegraded) next = 'DEGRADED';
      if (next === prev) continue;
      const identity = e.reserveEventIdentity();
      const degEvent = e.emitReservedEvent(identity, {
        eventType: 'BatchDegradationRecorded',
        phase: SimulationPhase.PHYSICAL_STATE,
        actorId: c.actorId,
        targetIds: [batch.id],
        parentCauseId: c.commandId,
        visibility: 'PLAYER_PRIVATE',
        payload: {
          batchId: batch.id, seasonalRateBasisPoints: rate,
          previousFreshness: prev, newFreshness: next,
        },
      });
      ids.push(degEvent.eventId);
    }

    return { accepted: true as const, commandId: c.commandId, emittedEventIds: ids };
  });

  e.registerCommandHandler('RecordMarketObservation', c => {
    const m = e.markets.snapshot();
    const season = m.season;
    const rng = e.rng.stream('market');
    const noiseDraws: number[] = [];
    const driverObservations = m.drivers.map(d => {
      const actualDir = d.direction;
      let reportedDirection: string;
      let confidenceBasisPoints = 7500;
      const noiseRoll = rng.nextUint32() % 100;
      noiseDraws.push(noiseRoll);
      if (actualDir === 'UPWARD') {
        reportedDirection = noiseRoll < 20 ? 'STABLE' : 'UPWARD';
      } else if (actualDir === 'DOWNWARD') {
        reportedDirection = noiseRoll < 20 ? 'STABLE' : 'DOWNWARD';
      } else {
        reportedDirection = 'STABLE';
        confidenceBasisPoints = 6000;
      }
      return {
        driverId: d.id,
        displayName: d.displayName,
        reportedDirection,
        confidenceBasisPoints,
      };
    });

    const identity = e.reserveEventIdentity();
    const observation = {
      id: e.ids.next('market_observation', 'OBS'),
      timestamp: e.clock.currentGameTime,
      season,
      reportedRegime: m.regime.regime,
      driverObservations,
    };

    const obsEvent = e.emitReservedEvent(identity, {
      eventType: 'MarketObservationRecorded',
      phase: SimulationPhase.INTEL_REPORTING_AND_AUTOPAUSE,
      actorId: c.actorId,
      targetIds: [],
      parentCauseId: c.commandId,
      visibility: 'PLAYER_PRIVATE',
      payload: { observation, useMarketRng: true, noiseRngValues: noiseDraws, rngDriverCount: m.drivers.length },
    });
    return { accepted: true as const, commandId: c.commandId, emittedEventIds: [obsEvent.eventId] };
  });
}
