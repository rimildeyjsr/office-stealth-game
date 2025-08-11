// Game constants for Phase 1.1

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const PLAYER_SIZE = 20; // px square
export const PLAYER_SPEED = 2; // px per frame

// Office layout for Phase 1.2
export const DESK_WIDTH = 140;
export const DESK_HEIGHT = 80;
export const DESK_ROWS = 2;
export const DESK_COLS = 3;
export const WALKWAY_X = 100; // horizontal spacing between desks
export const WALKWAY_Y = 100; // vertical spacing between rows

// Boss constants for Phase 1.4
export const BOSS_SIZE = 30; // legacy default visual size for Phase 1 rendering
export const BOSS_SPEED = 1.6; // legacy default speed
export const BOSS_DETECTION_RADIUS = 100; // legacy default detection radius

// Scoring
export const POINTS_PER_SECOND = 5; // reference rate
export const POINTS_PER_TICK = 1; // increment amount per interval
export const SCORE_UPDATE_INTERVAL = 50; // ms (1 point every 0.05s)

// Phase 2.1: Boss hierarchy configs
import { BossType, CoworkerType } from './types.ts';
import type { BossConfig, CoworkerConfig, SuspicionSystem, QuestionChoice } from './types.ts';

export const BOSS_CONFIGS: Record<BossType, BossConfig> = {
  [BossType.MANAGER]: {
    type: BossType.MANAGER,
    color: '#FF8C00',
    size: 30,
    speed: 1.6,
    detectionRadius: 100,
    spawnProbability: 0.70,
    basePointsPerSecond: 20,
    spawnDelayMs: [8000, 15000],
    warningTimeMs: 3000,
  },
  [BossType.DIRECTOR]: {
    type: BossType.DIRECTOR,
    color: '#8A2BE2',
    size: 35,
    speed: 1.8,
    detectionRadius: 120,
    spawnProbability: 0.20,
    basePointsPerSecond: 60,
    spawnDelayMs: [10000, 20000],
    warningTimeMs: 2500,
  },
  [BossType.VP]: {
    type: BossType.VP,
    color: '#8B0000',
    size: 40,
    speed: 2.5,
    detectionRadius: 140,
    spawnProbability: 0.08,
    basePointsPerSecond: 100,
    spawnDelayMs: [12000, 25000],
    warningTimeMs: 2000,
  },
  [BossType.CEO]: {
    type: BossType.CEO,
    color: '#000000',
    size: 50,
    speed: 0.8,
    detectionRadius: 200,
    spawnProbability: 0.02,
    basePointsPerSecond: 200,
    spawnDelayMs: [15000, 35000],
    warningTimeMs: 1500,
  },
};

// Phase 2.3: Suspicion configuration
export const SUSPICION_CONFIG: SuspicionSystem = {
  current: 0,
  increaseRate: 2,
  decreaseRate: 1,
  maxSuspicion: 100,
  multiplierThresholds: [
    { threshold: 0, multiplier: 1, label: 'SAFE' },
    { threshold: 26, multiplier: 2, label: 'RISKY' },
    { threshold: 51, multiplier: 3, label: 'DANGEROUS' },
    { threshold: 76, multiplier: 5, label: 'CRITICAL' },
  ],
};

// Phase 2.3: Hybrid suspicion mechanics
export const SUSPICION_MECHANICS = {
  gamingHeatRate: 0.8,
  lineOfSightMultiplier: 8,
  dangerZoneDistance: 100,
  dangerZoneMultiplier: 2,
  workingRecoveryRate: 2.5,
  hiddenRecoveryRate: 0.8,
  noRecoveryRate: 1.0,
} as const;

// Phase 2.5: Warning display configuration
export const WARNING_CONFIG = {
  fadeInMs: 200,
  fadeOutMs: 300,
  pulseIntervalMs: 500,
  colors: {
    low: '#FFFF00',
    medium: '#FF8C00',
    high: '#FF0000',
  },
} as const;

// Phase 3.1: Coworker configuration
export const COWORKER_CONFIGS: Record<CoworkerType, CoworkerConfig> = {
  [CoworkerType.HELPFUL]: {
    type: CoworkerType.HELPFUL,
    color: '#00FF00',
    size: 18,
    speed: 1.2,
    spawnProbability: 0.7,
    actionCooldownMs: 15000,
    effectDurationMs: 2000,
  },
  [CoworkerType.SNITCH]: {
    type: CoworkerType.SNITCH,
    color: '#FFB020',
    size: 16,
    speed: 1.6,
    spawnProbability: 0.25,
    actionCooldownMs: 30000,
    effectDurationMs: 1000,
  },
  [CoworkerType.GOSSIP]: {
    type: CoworkerType.GOSSIP,
    color: '#FF69B4',
    size: 16,
    speed: 1.1,
    spawnProbability: 0.2,
    actionCooldownMs: 25000,
    effectDurationMs: 2000,
  },
  [CoworkerType.DISTRACTION]: {
    type: CoworkerType.DISTRACTION,
    color: '#1E90FF',
    size: 20,
    speed: 1.0,
    spawnProbability: 0.2,
    actionCooldownMs: 20000,
    effectDurationMs: 3000,
  },
};

export const COWORKER_SYSTEM = {
  maxActiveCoworkers: 3,
  spawnDelayMs: [2000, 5000] as [number, number],
  despawnDurationMs: [15000, 30000] as [number, number],
  // Probability per frame that a snitch will bias its next waypoint toward the player's desk
  // Lower values = more free patrol; higher values = stronger gravitation
  snitchBiasChancePerFrame: 0.03,
} as const;

// Phase 3.4: Boss UX / behavior tuning
export const BOSS_UX = {
  // Chance per check interval to shout (per active boss)
  shoutChance: 0.6,
  // Interval between shout checks
  shoutCheckMs: 2000,
  // How long a shout bubble stays on screen
  shoutDurationMs: 1200,
  // Possible shout lines
  shouts: [
    'Get back to work!',
    'No slacking!',
    'I better see progress!',
  ],
  // Suspicion spike when a boss is spawned by a snitch call
  snitchSpawnSuspicion: 50,
  // Suspicion threshold to bias boss toward player desk
  biasThreshold: 30,
  // Probability when above threshold to bias next waypoint toward player desk area
  biasChancePerRetarget: 0.6,
} as const;

// Phase 3.5: question pool and choices
export const WORK_QUESTIONS = [
  'Can you help me with this spreadsheet?',
  'Do you know where the printer paper is?',
  'What time is the team meeting?',
  'Can you review this email draft?',
  'Do you have the client\'s phone number?',
] as const;

export const QUESTION_CHOICES: Record<'answer' | 'ignore', QuestionChoice> = {
  answer: {
    action: 'answer',
    label: 'Help them (+10 pts)',
    scoreChange: 10,
    lockDurationMs: 3000,
  },
  ignore: {
    action: 'ignore',
    label: 'Ignore (-5 pts)',
    scoreChange: -5,
    lockDurationMs: 0,
  },
};



