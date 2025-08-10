// Core game types for Phase 1.1

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  position: Position;
  speed: number; // pixels per frame for Phase 1.1
}

export type GameMode = 'work' | 'gaming';

export interface GameState {
  player: Player;
  bosses: never[]; // Placeholder for later phases
  gameMode: GameMode;
  score: number;
  isGameOver: boolean;
}


