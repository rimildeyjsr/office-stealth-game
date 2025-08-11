import { BOSS_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_SIZE, PLAYER_SPEED, POINTS_PER_TICK, SCORE_UPDATE_INTERVAL, BOSS_CONFIGS, SUSPICION_CONFIG } from './constants.ts';
import type { GameState, Player } from './types.ts';
import { createOfficeLayout, getPlayerSeatAnchor, isNearSeatAnchor } from './office.ts';
import { checkCollision } from './collision.ts';
import { createBossFromConfig, getRandomDespawnDuration, getRandomSpawnDelay, isPlayerDetected, selectRandomBossType, updateBoss } from './boss.ts';
import { BossType } from './types.ts';

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

  const desks = createOfficeLayout();
  const now = performance.now();
  const initialBoss = createBossFromConfig(BOSS_CONFIGS[BossType.MANAGER], desks);

  return {
    player,
    // Start with a Manager boss present immediately
    bosses: [initialBoss],
    gameMode: 'work',
    score: 0,
    isGameOver: false,
    desks,
    modeOverlayStartMs: null,
    // Init to now so score intervals start immediate in gaming mode
    lastScoreUpdateMs: now,
    nextBossSpawnMs: null,
    activeBossDespawnMs: now + getRandomDespawnDuration(BossType.MANAGER),
    suspicion: 0,
    lastUpdateMs: now,
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
  const deltaTimeMs = Math.max(0, (state.lastUpdateMs ? nowMs - state.lastUpdateMs : 16));
  if (!isGameOver && gameMode === 'gaming') {
    if (nowMs - lastScoreUpdateMs >= SCORE_UPDATE_INTERVAL) {
      const intervals = Math.floor((nowMs - lastScoreUpdateMs) / SCORE_UPDATE_INTERVAL);
      nextScore += intervals * POINTS_PER_TICK;
      lastScoreUpdateMs += intervals * SCORE_UPDATE_INTERVAL;
    }
  } else {
    lastScoreUpdateMs = nowMs;
  }

  // Phase 2.2: Boss spawning logic (single active boss)
  let bossesOut = nextBosses;
  let nextBossSpawnMs = state.nextBossSpawnMs ?? null;
  let activeBossDespawnMs = state.activeBossDespawnMs ?? null;
  // Spawn when timer elapses and no active boss
  if (bossesOut.length === 0 && nextBossSpawnMs !== null && nowMs >= nextBossSpawnMs) {
    const bossType = selectRandomBossType();
    const newBoss = createBossFromConfig(BOSS_CONFIGS[bossType], state.desks);
    bossesOut = [newBoss];
    nextBossSpawnMs = null; // reset until despawn
    activeBossDespawnMs = nowMs + getRandomDespawnDuration(bossType);
  }
  // If no boss and no timer, schedule next spawn using Manager delay for now
  if (bossesOut.length === 0 && nextBossSpawnMs === null) {
    const delay = getRandomSpawnDelay(BossType.MANAGER);
    nextBossSpawnMs = nowMs + delay;
  }
  // Despawn active boss when time elapses
  if (bossesOut.length > 0 && activeBossDespawnMs !== null && nowMs >= activeBossDespawnMs) {
    // Immediately spawn next boss based on probabilities, excluding current type
    const currentType = bossesOut[0].type;
    const nextType = selectRandomBossType(currentType);
    const spawned = createBossFromConfig(BOSS_CONFIGS[nextType], state.desks);
    bossesOut = [spawned];
    activeBossDespawnMs = nowMs + getRandomDespawnDuration(nextType);
    nextBossSpawnMs = null;
  }

  // Phase 2.3: Suspicion update
  const activeBoss = bossesOut[0] ?? null;
  const deltaSeconds = deltaTimeMs / 1000;
  let suspicion = state.suspicion ?? 0;
  if (activeBoss) {
    // Use current-frame player position so the meter responds immediately
    const distance = Math.hypot(newPosition.x - activeBoss.position.x, newPosition.y - activeBoss.position.y);
    const inDetection = distance <= activeBoss.detectionRadius;
    if (inDetection) {
      suspicion = Math.min(SUSPICION_CONFIG.maxSuspicion, suspicion + SUSPICION_CONFIG.increaseRate * deltaSeconds);
    } else {
      suspicion = Math.max(0, suspicion - SUSPICION_CONFIG.decreaseRate * deltaSeconds);
    }
  } else {
    suspicion = Math.max(0, suspicion - SUSPICION_CONFIG.decreaseRate * deltaSeconds);
  }
  const suspicionGameOver = suspicion >= SUSPICION_CONFIG.maxSuspicion;

  return {
    ...state,
    player: {
      ...player,
      position: newPosition,
      isSitting,
    },
    gameMode,
    bosses: bossesOut,
    isGameOver: state.isGameOver || isGameOver || suspicionGameOver,
    score: nextScore,
    lastScoreUpdateMs,
    nextBossSpawnMs,
    activeBossDespawnMs,
    suspicion,
    lastUpdateMs: nowMs,
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
    const visualSize = boss.size ?? BOSS_SIZE;
    const visualColor = boss.color ?? '#EF4444';
    ctx.fillStyle = visualColor;
    ctx.fillRect(boss.position.x - visualSize / 2, boss.position.y - visualSize / 2, visualSize, visualSize);
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

  // Phase 2.3: Suspicion meter (top-right)
  const meterX = CANVAS_WIDTH - 220;
  const meterY = 50;
  const meterWidth = 200;
  const meterHeight = 20;
  const suspicion = Math.max(0, Math.min(100, state.suspicion ?? 0));
  // Label above the bar
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Suspicion: ${Math.round(suspicion)}%`, meterX, meterY);
  const barY = meterY + 18; // place the bar below the text with small gap
  // Background
  ctx.fillStyle = '#333333';
  ctx.fillRect(meterX, barY, meterWidth, meterHeight);
  // Fill
  const fillWidth = (suspicion / 100) * meterWidth;
  if (suspicion < 26) ctx.fillStyle = '#00FF00';
  else if (suspicion < 51) ctx.fillStyle = '#FFFF00';
  else if (suspicion < 76) ctx.fillStyle = '#FF8C00';
  else ctx.fillStyle = '#FF0000';
  ctx.fillRect(meterX, barY, fillWidth, meterHeight);

  if (frameText) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.fillText(frameText, 10, CANVAS_HEIGHT - 10);
  }
}


