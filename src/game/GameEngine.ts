import { BOSS_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_SIZE, PLAYER_SPEED, POINTS_PER_SECOND, SCORE_UPDATE_INTERVAL } from './constants.ts';
import type { GameState, Player } from './types.ts';
import { createOfficeLayout, getPlayerSeatAnchor, isNearSeatAnchor } from './office.ts';
import { checkCollision } from './collision.ts';
import { createBoss, isPlayerDetected, updateBoss } from './boss.ts';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  interact?: boolean; // E key; one-shot per press
  toggleMode?: boolean; // Spacebar; one-shot per press
  _toggleHandled?: boolean; // internal edge-detection flag
}

export function createInitialState(): GameState {
  const player: Player = {
    position: { x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2, y: CANVAS_HEIGHT / 2 - PLAYER_SIZE / 2 },
    speed: PLAYER_SPEED,
  };

  return {
    player,
    bosses: [createBoss(createOfficeLayout())],
    gameMode: 'work',
    score: 0,
    isGameOver: false,
    desks: createOfficeLayout(),
    modeOverlayStartMs: null,
    // Init to now so score intervals start immediate in gaming mode
    lastScoreUpdateMs: performance.now(),
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
  // Track current mode; may be overridden below when sitting
  let gameMode = state.gameMode;
  if (!isSitting && input.interact && playerDesk) {
    const anchor = getPlayerSeatAnchor(playerDesk);
    if (isNearSeatAnchor(newPosition, anchor)) {
      isSitting = true;
      newPosition.x = anchor.x;
      newPosition.y = anchor.y;
      // Requirement: default to working when transitioning from idle -> sit
      gameMode = 'work';
    }
  }
  // If sitting, keep position anchored exactly at the seat anchor
  if (isSitting && playerDesk) {
    const anchor = getPlayerSeatAnchor(playerDesk);
    newPosition.x = anchor.x;
    newPosition.y = anchor.y;
  }

  // Mode switching: Only allowed when sitting at player desk (idle state cannot toggle)
  if (input.toggleMode && !input._toggleHandled && isSitting) {
    gameMode = gameMode === 'work' ? 'gaming' : 'work';
    // mark as handled to ensure single toggle per key press
    input._toggleHandled = true;
  }

  // Update boss patrols
  const nextBosses = state.bosses.map((b) => updateBoss(b as any));

  // Detection → game over if gaming and within detection radius
  let isGameOver = state.isGameOver;
  if (!isGameOver) {
    for (const boss of nextBosses) {
      if (isPlayerDetected({ position: newPosition, speed: player.speed, isSitting }, boss, gameMode)) {
        isGameOver = true;
        break;
      }
    }
  }

  // Update score over time when gaming (5 points/sec)
  let nextScore = state.score;
  let lastScoreUpdateMs = state.lastScoreUpdateMs ?? performance.now();
  const nowMs = performance.now();
  if (!isGameOver && gameMode === 'gaming') {
    if (nowMs - lastScoreUpdateMs >= SCORE_UPDATE_INTERVAL) {
      const intervals = Math.floor((nowMs - lastScoreUpdateMs) / SCORE_UPDATE_INTERVAL);
      nextScore += intervals * POINTS_PER_SECOND;
      lastScoreUpdateMs += intervals * SCORE_UPDATE_INTERVAL;
    }
  } else {
    lastScoreUpdateMs = nowMs;
  }

  return {
    ...state,
    player: {
      ...player,
      position: newPosition,
      isSitting,
    },
    gameMode,
    bosses: nextBosses,
    isGameOver,
    score: nextScore,
    lastScoreUpdateMs,
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

  // Draw boss and detection radius
  for (const boss of state.bosses) {
    // Detection circle
    ctx.strokeStyle = 'rgba(239,68,68,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boss.position.x, boss.position.y, boss.detectionRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Boss square
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(boss.position.x - BOSS_SIZE / 2, boss.position.y - BOSS_SIZE / 2, BOSS_SIZE, BOSS_SIZE);
  }

  // Game Over overlay
  if (state.isGameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAUGHT!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    ctx.font = '18px sans-serif';
    ctx.fillText('Press R to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
  }

  // Player color by state: idle (blue), working (green), gaming (red)
  const isSittingNow = !!state.player.isSitting;
  const isWorking = state.gameMode === 'work';
  ctx.fillStyle = isSittingNow ? (isWorking ? '#10B981' : '#EF4444') : '#3B82F6';
  ctx.fillRect(state.player.position.x, state.player.position.y, PLAYER_SIZE, PLAYER_SIZE);

  // State label top-left (IDLE/WORKING/GAMING). Apply 200ms fade only when switching modes (work<->gaming)
  ctx.save();
  const fadeMs = 200;
  const now = performance.now();
  let alpha = 1;
  if (state.modeOverlayStartMs && now - state.modeOverlayStartMs < fadeMs && isSittingNow) {
    alpha = 1 - (now - state.modeOverlayStartMs) / fadeMs;
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const label = isSittingNow ? (isWorking ? 'WORKING' : 'GAMING') : 'IDLE';
  ctx.fillText(label, 12, 12);
  ctx.restore();

  // Score (top-left under label)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Score: ${state.score}`, 12, 40);

  if (frameText) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(frameText, 10, CANVAS_HEIGHT - 10);
  }
}


