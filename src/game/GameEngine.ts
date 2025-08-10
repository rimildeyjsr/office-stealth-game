import { CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_SIZE, PLAYER_SPEED } from './constants.ts';
import type { GameState, Player } from './types.ts';
import { createOfficeLayout, getPlayerSeatAnchor, isNearSeatAnchor } from './office.ts';
import { checkCollision } from './collision.ts';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  interact?: boolean; // E key; one-shot per press
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
    desks: createOfficeLayout(),
  };
}

export function updateGameState(state: GameState, input: InputState): GameState {
  const { player } = state;

  // Movement based on input
  let nextX = player.position.x;
  let nextY = player.position.y;

  const hasMovementInput = !!(input.up || input.down || input.left || input.right);

  // Standing up on movement
  let isSitting = player.isSitting ?? false;
  if (isSitting && hasMovementInput) {
    isSitting = false;
  }

  if (!isSitting) {
    if (input.up) nextY -= player.speed;
    if (input.down) nextY += player.speed;
    if (input.left) nextX -= player.speed;
    if (input.right) nextX += player.speed;
  }

  // Clamp to canvas bounds
  nextX = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, nextX));
  nextY = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, nextY));

  // Collision with desks using AABB. If colliding, do not move along that axis.
  const proposedX = { x: nextX, y: player.position.y };
  if (checkCollision(proposedX, state.desks)) {
    nextX = player.position.x;
  }
  const proposedY = { x: nextX, y: nextY };
  if (checkCollision(proposedY, state.desks)) {
    nextY = player.position.y;
  }

  const newPosition = { x: nextX, y: nextY };

  // Sitting logic: press E near seat anchor to sit (snap to anchor). Movement stands up.
  const playerDesk = state.desks.find((d) => d.isPlayerDesk) ?? null;
  if (!isSitting && input.interact && playerDesk) {
    const anchor = getPlayerSeatAnchor(playerDesk);
    if (isNearSeatAnchor(newPosition, anchor)) {
      isSitting = true;
      newPosition.x = anchor.x;
      newPosition.y = anchor.y;
    }
  }
  // If sitting, keep position anchored exactly at the seat anchor
  if (isSitting && playerDesk) {
    const anchor = getPlayerSeatAnchor(playerDesk);
    newPosition.x = anchor.x;
    newPosition.y = anchor.y;
  }

  return {
    ...state,
    player: {
      ...player,
      position: newPosition,
      isSitting,
    },
  };
}

export function drawFrame(ctx: CanvasRenderingContext2D, state: GameState, frameText?: string): void {
  // Clear
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Background
  ctx.fillStyle = '#111827'; // Tailwind gray-900 like background
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw desks
  for (const desk of state.desks) {
    ctx.fillStyle = desk.isPlayerDesk ? '#374151' : '#1F2937'; // slightly different shades
    const { x, y, width, height } = desk.bounds;
    ctx.fillRect(x, y, width, height);
  }

  // Draw seat anchor indicator for player desk
  const playerDesk = state.desks.find((d) => d.isPlayerDesk) ?? null;
  if (playerDesk) {
    const anchor = getPlayerSeatAnchor(playerDesk);
    ctx.fillStyle = '#D1D5DB'; // gray-300
    ctx.beginPath();
    ctx.arc(anchor.x + PLAYER_SIZE / 2, anchor.y + PLAYER_SIZE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    // Hint when near and not sitting
    if (!state.player.isSitting && isNearSeatAnchor(state.player.position, anchor, 18)) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px sans-serif';
      ctx.fillText('E to Sit', anchor.x - 10, anchor.y - 6);
    }
  }

  // Draw player as blue square for Phase 1.1
  ctx.fillStyle = state.player.isSitting ? '#10B981' : '#3B82F6'; // Sitting turns green
  ctx.fillRect(state.player.position.x, state.player.position.y, PLAYER_SIZE, PLAYER_SIZE);

  if (frameText) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(frameText, 10, CANVAS_HEIGHT - 10);
  }
}


