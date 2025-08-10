import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_SIZE, PLAYER_SPEED } from './constants.ts';
import type { GameState, Player } from './types.ts';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export function createInitialState(): GameState {
  const player: Player = {
    position: { x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2, y: CANVAS_HEIGHT / 2 - PLAYER_SIZE / 2 },
    speed: PLAYER_SPEED,
  };

  return {
    player,
    bosses: [],
    gameMode: 'work',
    score: 0,
    isGameOver: false,
  };
}

export function updateGameState(state: GameState, input: InputState): GameState {
  const { player } = state;

  // Movement based on input
  let nextX = player.position.x;
  let nextY = player.position.y;

  if (input.up) nextY -= player.speed;
  if (input.down) nextY += player.speed;
  if (input.left) nextX -= player.speed;
  if (input.right) nextX += player.speed;

  // Clamp to canvas bounds
  nextX = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, nextX));
  nextY = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, nextY));

  return {
    ...state,
    player: {
      ...player,
      position: { x: nextX, y: nextY },
    },
  };
}

export function drawFrame(ctx: CanvasRenderingContext2D, state: GameState, frameText?: string): void {
  // Clear
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Background
  ctx.fillStyle = '#111827'; // Tailwind gray-900 like background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw player as blue square for Phase 1.1
  ctx.fillStyle = '#3B82F6'; // Tailwind blue-500
  ctx.fillRect(state.player.position.x, state.player.position.y, PLAYER_SIZE, PLAYER_SIZE);

  if (frameText) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(frameText, 10, CANVAS_HEIGHT - 10);
  }
}


