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

export interface GameState {
  player: Player;
  bosses: never[]; // Placeholder for later phases
  gameMode: GameMode;
  score: number;
  isGameOver: boolean;
  desks: Desk[];
}

export interface Desk {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPlayerDesk: boolean;
}



