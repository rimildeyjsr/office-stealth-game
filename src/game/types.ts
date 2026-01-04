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
  // Phase 2.5: pre-spawn warning window per type
  warningTimeMs?: number;
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
  // Phase 2.5: warning system
  bossWarning?: BossWarning | null;
  upcomingBossType?: BossType | null;
  // Phase 3.4: boss UX shouts and snitch-trigger tracking
  bossShouts?: BossShout[];
  nextBossShoutCheckMs?: number | null;
  nextBossSpawnIsSnitch?: boolean | null;
  // Phase 3.1: coworker system state
  coworkers: Coworker[];
  nextCoworkerSpawnMs?: number | null;
  coworkerWarnings?: CoworkerWarning[];
  // Phase 3.3: snitch check cadence
  nextSnitchCheckMs?: number | null;
  // Snitch guarantee timers
  lastSnitchMs?: number | null;
  nextForcedSnitchMs?: number | null;
  // Phase 3.4: conversation lock state and scheduling
  conversationState?: ConversationState | null;
  nextGossipCheckMs?: number | null;
  // Phase 3.5: distraction question system
  activeQuestion?: WorkQuestion | null;
  questionLockUntilMs?: number | null;
  nextDistractionCheckMs?: number | null;
  // Interruption guarantee timers
  lastInterruptionMs?: number | null;
  nextForcedInterruptionMs?: number | null;
  // Phase 3.6: Concentration system state
  concentration: ConcentrationState;
  pendingToggleMs?: number | null; // for delayed mode switching
  coffeeAreaCooldowns?: Record<string, number>; // area label -> next available time
  // Phase System State
  phaseState: PhaseState;
}

// Phase 2.5: warning interface
export interface BossWarning {
  bossType: BossType;
  remainingMs: number;
  totalWarningMs: number;
  isActive: boolean;
}

export interface Desk {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPlayerDesk: boolean;
}


// Phase 3.1: Coworker foundations
export const CoworkerType = {
  HELPFUL: 'helpful',
  SNITCH: 'snitch',
  GOSSIP: 'gossip',
  DISTRACTION: 'distraction',
} as const;
export type CoworkerType = typeof CoworkerType[keyof typeof CoworkerType];

export interface CoworkerConfig {
  type: CoworkerType;
  color: string;
  size: number;
  speed: number;
  spawnProbability: number;
  actionCooldownMs: number;
  effectDurationMs: number;
}

export interface Coworker {
  id: string;
  type: CoworkerType;
  position: Position;
  speed: number;
  patrolRoute: Position[];
  currentTarget: number;
  size: number;
  color: string;
  lastActionMs: number;
  isActive: boolean;
  // Internal scheduling (Phase 3.1): when to despawn; optional to keep spec flexible
  despawnAtMs?: number | null;
  // Phase 3.2: rushing behavior to warn player
  rushUntilMs?: number | null;
  rushTarget?: Position | null;
  // Phase 3.3: proximity memory for snitch logic
  lastNearPlayerMs?: number | null;
}

// Phase 3.2 forward-declared to keep GameState shape ready
export interface CoworkerWarning {
  coworkerId: string;
  type: 'boss_warning' | 'snitch_warning' | 'gossip_warning';
  message: string;
  position: Position;
  remainingMs: number;
  scoreReduction: number;
}

// Phase 3.4: Boss shout UX model
export interface BossShout {
  bossId: string;
  message: string;
  position: Position;
  remainingMs: number;
}




// Phase 3.4: Conversation state for gossip interruptions
export interface ConversationState {
  isActive: boolean;
  coworkerId: string;
  startMs: number;
  durationMs: number;
  message: string;
}

// Phase 3.5: work question system
export interface WorkQuestion {
  id: string;
  coworkerId: string;
  question: string;
  isActive: boolean;
  startMs: number;
  timeoutMs: number;
}

export interface QuestionChoice {
  action: 'answer' | 'ignore';
  label: string;
  scoreChange: number;
  lockDurationMs: number;
}

// Phase 3.6: Concentration system
export interface ConcentrationState {
  current: number; // 0-100
  lastUpdateMs: number;
  recoveryRate: number; // per second
  switchDelayMs: number; // additional delay when low
  recentLosses: Array<{ amount: number; timestampMs: number }>; // track recent concentration losses
}

export interface CoffeeArea {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  restoration: number;
  cooldownMs: number;
}

// Phase System Types
export interface GamePhase {
  id: number;
  name: string;
  goal: number; // score needed to complete this phase
  enabledBosses: BossType[]; // which boss types can spawn
  enabledCoworkers: CoworkerType[]; // which coworker types can spawn
  concentrationEnabled: boolean; // whether concentration system is active
  unlockMessage: string; // message shown when transitioning to next phase
}

export interface PhaseState {
  currentPhase: number; // 1-5
  phaseScore: number; // score accumulated in current phase
  totalScore: number; // all-time score across all phases
  showTransition: boolean; // whether to show phase transition screen
}

