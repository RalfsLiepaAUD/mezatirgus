export enum SimulationPhase {
  COMMANDS = 1,
  FINANCIAL_SETTLEMENTS = 2,
  JOB_PROGRESS = 3,
  PHYSICAL_STATE = 4,
  BUYER_CONSUMPTION = 5,
  CAPACITY_AND_CONTRACTS = 6,
  MARKET_DRIVERS = 7,
  PRICE_CARD_PUBLICATION = 8,
  AI_PERCEPTION_AND_DECISION = 9,
  INTEL_REPORTING_AND_AUTOPAUSE = 10,
  INVARIANT_CHECKS_AND_SNAPSHOT = 11,
}
export const PHASE_ORDER = Object.values(SimulationPhase).filter((v): v is SimulationPhase => typeof v === "number");