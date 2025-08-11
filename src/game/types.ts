// Core game types for Phase 1.1

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  position: Position;
  speed: number; // pixels per frame for Phase 1.1
  isSitting?: boolean;
}

export type GameMode = 'work' | 'gaming';

// Phase 2.1: Boss hierarchy types
export const BossType = {
  MANAGER: 'manager',
  DIRECTOR: 'director',
  VP: 'vp',
  CEO: 'ceo',
} as const;
export type BossType = typeof BossType[keyof typeof BossType];

export interface BossConfig {
  type: BossType;
  color: string;
  size: number;
  speed: number;
  detectionRadius: number;
  spawnProbability: number;
  basePointsPerSecond: number;
  spawnDelayMs: [number, number];
}

export interface Boss {
  id: string;
  // Phase 2.1 additions
  type: BossType;
  position: Position;
  speed: number;
  // Keep existing Phase 1 pathing fields
  patrolRoute: Position[];
  currentTarget: number;
  detectionRadius: number;
  // Visuals and scoring (Phase 2.1)
  size: number;
  color: string;
  basePointsPerSecond: number;
}

// Phase 2.3: Suspicion system types
export interface SuspicionSystem {
  current: number;
  increaseRate: number; // points per second
  decreaseRate: number; // points per second
  maxSuspicion: number;
  multiplierThresholds: Array<{
    threshold: number;
    multiplier: number;
    label: string;
  }>;
}

export interface GameState {
  player: Player;
  bosses: Boss[];
  gameMode: GameMode;
  score: number;
  isGameOver: boolean;
  desks: Desk[];
  modeOverlayStartMs?: number | null; // for 200ms fade on mode switch
  lastScoreUpdateMs?: number | null;
  // Phase 2.2: boss spawn scheduling
  nextBossSpawnMs?: number | null;
  activeBossDespawnMs?: number | null;
  // Phase 2.3: suspicion state and timing
  suspicion?: number; // 0-100
  lastUpdateMs?: number | null;
}

export interface Desk {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPlayerDesk: boolean;
}



