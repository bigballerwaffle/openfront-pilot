// Bot policy, not OpenFront's prices or combat rules.
// Durations below use game ticks (normally 10 ticks per second), except *_MS.
// Keep these values unchanged when reorganizing code: they affect gameplay.

export const DEFAULTS = Object.freeze({
  profile: 'balanced',
  economy: true,
  navy: true,
  nukes: true,
  learning: true,
  diplomacy: true,
});

export const PROFILES = Object.freeze({
  cautious: { reserve: 0.38, advantage: 1.85 },
  balanced: { reserve: 0.3, advantage: 1.67 },
  aggressive: { reserve: 0.24, advantage: 1.67 },
});

export const EARLY_GAME_TICKS = 6000;
export const EARLY_CAPACITY_THRESHOLD = 0.85;
export const NEAR_CAPACITY_THRESHOLD = 0.92;
export const STRUCTURE_DANGER_RADIUS = 28;
export const MIN_HUMAN_ATTACK_RATIO = 1.67;
export const MIN_AI_ATTACK_RATIO = 1.3;
export const MAX_TROOP_SEND_FRACTION = 0.72;

export const COOLDOWNS = Object.freeze({
  attack: 12,
  counter: 12,
  recall: 20,
  reinforcement: 20,
  emergencyBuild: 10,
  routineBuild: 25,
  buildingType: 40,
  emergencyBuildingType: 30,
  defensePost: 300,
  navalLanding: 180,
  nuclearRecheck: 150,
  nuclearStrike: 1200,
  diplomacy: 25,
  allianceResponse: 80,
  allianceRenewal: 120,
  allianceOffer: 300,
});

export const DEFENSE = Object.freeze({
  minimumIncomingTroops: 2000,
  minimumCapacityShare: 0.03,
  hugeAttackTroops: 10000,
  hugeAttackCapacityShare: 0.2,
  hugeAttackArmyShare: 0.45,
  normalPostLevels: 2,
  emergencyPostLevels: 6,
  defaultPostRange: 30,
  postBorderClearance: 16,
  structureBorderClearance: 24,
  inlandWaterClearance: 18,
});

export const NUCLEAR = Object.freeze({
  samDelayTicks: 900,
  economyMinimumAgeTicks: 1800,
  missileObservationTicks: 40,
  siloSavings: 1900000,
  hydrogenSavings: 5000000,
  defaultSamRange: 150,
  samSafetyMargin: 15,
});

export const SPAWN = Object.freeze({
  patchRadius: 4,
  recheckTicks: 20,
  crowdingRadius: 100,
  crowdingWeight: 220,
  nearbyPlayerLimit: 2,
  crowdingThreshold: 130,
  relocationImprovement: 50,
});

export const COMMAND_CONFIRMATION_TICKS = 65;
export const STALLED_CLOCK_WARNING_MS = 10000;
export const MAP_REFRESH_TICKS = 15;
export const STRONGER_NEIGHBOR_CAPACITY_RATIO = 1.1;
