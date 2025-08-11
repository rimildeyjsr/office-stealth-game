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
import { BossType } from './types.ts';
import type { BossConfig, SuspicionSystem } from './types.ts';

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



