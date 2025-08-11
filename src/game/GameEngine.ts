import { BOSS_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH, PLAYER_SIZE, PLAYER_SPEED, BOSS_CONFIGS, SUSPICION_CONFIG, SUSPICION_MECHANICS, COWORKER_SYSTEM, COWORKER_CONFIGS, BOSS_UX, WORK_QUESTIONS, QUESTION_CHOICES } from './constants.ts';
import type { Boss, Coworker, Desk, GameMode, GameState, Player } from './types.ts';
import { createOfficeLayout, getPlayerSeatAnchor, isNearSeatAnchor } from './office.ts';
import { checkCollision, hasLineOfSight } from './collision.ts';
import { createBossFromConfig, getRandomDespawnDuration, getRandomSpawnDelay, isPlayerDetected, selectRandomBossType, updateBoss } from './boss.ts';
import { BossType } from './types.ts';
import { createCoworkerFromConfig, getRandomCoworkerSpawnDelay, updateCoworker, pickRandomCoworkerConfig, checkHelpfulCoworkerAction, maybeStartHelpfulRush, clearExpiredRush, updateRushTargetTowardsPlayer, checkSnitchAction, maybeBiasSnitchTowardPlayer, checkGossipInterruption, setGossipApproachTarget, checkDistractionQuestion } from './coworker.ts';

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
  const desks = createOfficeLayout();
  const playerDesk = desks.find((d) => d.isPlayerDesk) ?? null;
  const anchor = playerDesk ? getPlayerSeatAnchor(playerDesk) : { x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2, y: CANVAS_HEIGHT / 2 - PLAYER_SIZE / 2 };
  // Start 25px to the left of the seat anchor, same Y
  const startX = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, anchor.x - 25));
  const startY = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, anchor.y));
  const player: Player = {
    position: { x: startX, y: startY },
    speed: PLAYER_SPEED,
  };

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
    bossWarning: null,
    upcomingBossType: null,
    bossShouts: [],
    nextBossShoutCheckMs: now + BOSS_UX.shoutCheckMs,
    nextBossSpawnIsSnitch: null,
    // Coworkers start empty; schedule initial spawn timer
    coworkers: [],
    nextCoworkerSpawnMs: now + getRandomCoworkerSpawnDelay(),
    coworkerWarnings: [],
    conversationState: null,
    nextGossipCheckMs: performance.now() + 3000,
    activeQuestion: null,
    questionLockUntilMs: null,
    nextDistractionCheckMs: performance.now() + 4000,
    lastInterruptionMs: now,
    nextForcedInterruptionMs: now + 20000,
    lastSnitchMs: null,
    nextForcedSnitchMs: now + 100000,
  };
}

// Phase 2.4: Dynamic multiplier based on suspicion and active risk
export function calculateDynamicMultiplier(
  suspicion: number,
  boss: Boss | null,
  player: Player,
  gameMode: GameMode,
  desks: Desk[],
): { totalMultiplier: number; baseMultiplier: number; riskMultiplier: number; riskLevel: string } {
  if (gameMode !== 'gaming' || !boss) {
    return { totalMultiplier: 1, baseMultiplier: 1, riskMultiplier: 1, riskLevel: 'SAFE' };
  }

  // Base multiplier: every 10% suspicion adds +1x, capped at 10x
  // 0-9% -> 1x, 10-19% -> 2x, ..., 90-100% -> 10x
  let baseMultiplier = Math.floor(suspicion / 10) + 1;
  if (baseMultiplier > 10) baseMultiplier = 10;

  let riskMultiplier = 1;
  let riskLevel = 'SAFE';

  const distance = Math.hypot(player.position.x - boss.position.x, player.position.y - boss.position.y);
  const hasLOS = hasLineOfSight(boss, player, desks);

  if (hasLOS && distance <= SUSPICION_MECHANICS.dangerZoneDistance) {
    riskMultiplier = 3; // Extreme danger
    riskLevel = 'EXTREME DANGER';
  } else if (hasLOS) {
    riskMultiplier = 2; // Visible
    riskLevel = 'VISIBLE';
  } else if (distance <= 120) {
    riskMultiplier = 1.5; // Hidden but close
    riskLevel = 'HIDDEN';
  } else {
    riskMultiplier = 1; // Safe
    riskLevel = 'SAFE';
  }

  return { totalMultiplier: baseMultiplier * riskMultiplier, baseMultiplier, riskMultiplier, riskLevel };
}

export function calculateScoreIncrease(
  gameMode: string,
  boss: Boss | null,
  player: Player,
  suspicion: number,
  desks: Desk[],
  deltaTimeMs: number,
): number {
  if (gameMode !== 'gaming' || !boss) return 0;
  const deltaSeconds = deltaTimeMs / 1000;
  const { totalMultiplier } = calculateDynamicMultiplier(suspicion, boss, player, gameMode as GameMode, desks);
  const basePointsPerSecond = boss.basePointsPerSecond;
  return basePointsPerSecond * totalMultiplier * deltaSeconds;
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
    // Phase 3.4: Block mode switching during active conversation
    if (state.conversationState?.isActive || (state.questionLockUntilMs && performance.now() < state.questionLockUntilMs)) {
      input._toggleHandled = true; // consume toggle
    } else {
    gameMode = gameMode === 'work' ? 'gaming' : 'work';
    // mark as handled to ensure single toggle per key press
    input._toggleHandled = true;
    }
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

  // Update score; introduce easy-period halved scoring when no boss present.
  let nextScore = state.score;
  let lastScoreUpdateMs = state.lastScoreUpdateMs ?? performance.now();
  const nowMs = performance.now();
  const deltaTimeMs = Math.max(0, (state.lastUpdateMs ? nowMs - state.lastUpdateMs : 16));
  if (!isGameOver && gameMode === 'gaming' && !(state.conversationState?.isActive)) {
    if (state.questionLockUntilMs && performance.now() < state.questionLockUntilMs) {
      // score frozen during answer lock
    } else {
    const active = state.bosses[0] ?? null;
    if (active) {
      nextScore += calculateScoreIncrease(gameMode, active, { ...player, position: newPosition }, state.suspicion ?? 0, state.desks, deltaTimeMs);
    } else {
      // Easy period: score at 50% of Manager base rate without multipliers
      const deltaSeconds = deltaTimeMs / 1000;
      const base = BOSS_CONFIGS[BossType.MANAGER].basePointsPerSecond;
      nextScore += (base * 0.5) * deltaSeconds;
    }
    }
  }
  lastScoreUpdateMs = nowMs;

  // Phase 2.2: Boss spawning logic (single active boss)
  let bossesOut = nextBosses;
  let nextBossSpawnMs = state.nextBossSpawnMs ?? null;
  let activeBossDespawnMs = state.activeBossDespawnMs ?? null;
  let nextBossSpawnIsSnitch = state.nextBossSpawnIsSnitch ?? null;
  let justSpawnedFromSnitch = false;
  // Spawn when timer elapses and no active boss
  if (bossesOut.length === 0 && nextBossSpawnMs !== null && nowMs >= nextBossSpawnMs) {
    const bossType = state.upcomingBossType ?? selectRandomBossType();
    const newBoss = createBossFromConfig(BOSS_CONFIGS[bossType], state.desks);
    bossesOut = [newBoss];
    nextBossSpawnMs = null; // reset until despawn
    activeBossDespawnMs = nowMs + getRandomDespawnDuration(bossType);
    // Clear warning on spawn
    state.bossWarning = null;
    state.upcomingBossType = null;
    if (nextBossSpawnIsSnitch) {
      justSpawnedFromSnitch = true;
      nextBossSpawnIsSnitch = null;
    }
  }
  // If no boss and no timer, schedule next spawn using Manager delay for now
  if (bossesOut.length === 0 && nextBossSpawnMs === null) {
    const delay = getRandomSpawnDelay(BossType.MANAGER);
    nextBossSpawnMs = nowMs + delay;
  }
  // Despawn active boss when time elapses
  if (bossesOut.length > 0 && activeBossDespawnMs !== null && nowMs >= activeBossDespawnMs) {
    // Introduce real cool-off period with no boss
    const currentType = bossesOut[0].type;
    const nextType = selectRandomBossType(currentType);
    const downtime = getRandomSpawnDelay(BossType.MANAGER); // 8–15s by current config
    bossesOut = [];
    activeBossDespawnMs = null;
    nextBossSpawnMs = nowMs + downtime;
    state.bossWarning = null;
    state.upcomingBossType = nextType;
  }
  // Phase 2.5: Update pre-spawn warning if a spawn is scheduled
  let bossWarning = state.bossWarning ?? null;
  let upcomingBossType = state.upcomingBossType ?? null;
  if (bossesOut.length === 0) {
    if (nextBossSpawnMs === null) {
      // If nothing scheduled (e.g., game start edge), schedule spawn and set upcoming type
      // Use fixed 1s window for warning visibility just before spawn
      const delay = getRandomSpawnDelay(BossType.MANAGER);
      nextBossSpawnMs = nowMs + delay;
      upcomingBossType = selectRandomBossType();
    }
    if (nextBossSpawnMs !== null) {
      // Ensure we have an upcoming type
      if (!upcomingBossType) upcomingBossType = selectRandomBossType();
      const timeUntil = nextBossSpawnMs - nowMs;
      const warnWindow = 1000; // show warning only in the last 1s
      if (timeUntil > 0 && timeUntil <= warnWindow) {
        bossWarning = {
          bossType: upcomingBossType,
          remainingMs: timeUntil,
          totalWarningMs: warnWindow,
          isActive: true,
        };
      } else {
        bossWarning = null;
      }
    }
  } else {
    bossWarning = null;
    upcomingBossType = null;
  }

  // Phase 2.3: Suspicion update (hybrid mechanics)
  const activeBoss = bossesOut[0] ?? null;
  let suspicion = state.suspicion ?? 0;
  const playerNow: Player = { ...state.player, position: newPosition };
  if (!activeBoss) {
    suspicion = Math.max(0, suspicion - SUSPICION_MECHANICS.noRecoveryRate * (deltaTimeMs / 1000));
  } else if (gameMode === 'work') {
    suspicion = Math.max(0, suspicion - SUSPICION_MECHANICS.workingRecoveryRate * (deltaTimeMs / 1000));
  } else if (gameMode === 'gaming') {
    let suspicionRate = SUSPICION_MECHANICS.gamingHeatRate; // base heat
    if (hasLineOfSight(activeBoss, playerNow, state.desks)) {
      suspicionRate *= SUSPICION_MECHANICS.lineOfSightMultiplier;
      const distance = Math.hypot(playerNow.position.x - activeBoss.position.x, playerNow.position.y - activeBoss.position.y);
      if (distance <= SUSPICION_MECHANICS.dangerZoneDistance) {
        suspicionRate *= SUSPICION_MECHANICS.dangerZoneMultiplier;
      }
      suspicion = Math.min(SUSPICION_CONFIG.maxSuspicion, suspicion + suspicionRate * (deltaTimeMs / 1000));
    } else {
      // Hidden while gaming: slow recovery
      suspicion = Math.max(0, suspicion - SUSPICION_MECHANICS.hiddenRecoveryRate * (deltaTimeMs / 1000));
    }
  }
  // Spike suspicion if boss just spawned due to a snitch call
  if (justSpawnedFromSnitch) {
    suspicion = Math.max(suspicion, BOSS_UX.snitchSpawnSuspicion);
  }
  const suspicionGameOver = suspicion >= SUSPICION_CONFIG.maxSuspicion;

  // Phase 3.1: Coworker updates and scheduling
  // Update coworkers movement
  let coworkers: Coworker[] = (state.coworkers ?? [])
    .map((c) => clearExpiredRush(c))
    // Keep rush target following player's current position while rushing
    .map((c) => updateRushTargetTowardsPlayer(c, { ...player, position: newPosition }))
    // Bias snitches to wander near the player during gaming
    .map((c) => maybeBiasSnitchTowardPlayer(c, { ...player, position: newPosition }, gameMode, state.desks))
    .map((c) => updateCoworker(c, state.desks));
  // Despawn coworkers whose timer elapsed
  coworkers = coworkers.filter((c) => (c.despawnAtMs == null ? true : nowMs < c.despawnAtMs));
  // Limit max active coworkers
  if (coworkers.length > COWORKER_SYSTEM.maxActiveCoworkers) {
    coworkers = coworkers.slice(0, COWORKER_SYSTEM.maxActiveCoworkers);
  }
  // Spawn new coworker when timer elapses and under max
  let nextCoworkerSpawnMs = state.nextCoworkerSpawnMs ?? null;
  if (nextCoworkerSpawnMs !== null && nowMs >= nextCoworkerSpawnMs && coworkers.length < COWORKER_SYSTEM.maxActiveCoworkers) {
    // Ensure at least one snitch and one helpful are always present;
    // then ensure either gossip or distraction is present (randomly prefer the missing one).
    const hasHelpful = coworkers.some((c) => c.type === 'helpful');
    const hasSnitch = coworkers.some((c) => c.type === 'snitch');
    const hasGossip = coworkers.some((c) => c.type === 'gossip');
    const hasDistraction = coworkers.some((c) => c.type === 'distraction');
    let cfg = pickRandomCoworkerConfig();
    if (!hasSnitch) cfg = COWORKER_CONFIGS.snitch;
    else if (!hasHelpful) cfg = COWORKER_CONFIGS.helpful;
    else if (!hasGossip || !hasDistraction) {
      // Choose whichever is missing; if both missing pick randomly
      if (!hasGossip && !hasDistraction) {
        cfg = Math.random() < 0.5 ? COWORKER_CONFIGS.gossip : COWORKER_CONFIGS.distraction;
      } else if (!hasGossip) cfg = COWORKER_CONFIGS.gossip;
      else cfg = COWORKER_CONFIGS.distraction;
    }
    // Helpful and Snitch prefer to spawn near the player desk area to be noticeable
    const spawnHintBounds = (cfg.type === 'helpful' || cfg.type === 'snitch')
      ? (state.desks.find((d) => d.isPlayerDesk)?.bounds ?? null)
      : null;
    const hintPos = spawnHintBounds ? { x: spawnHintBounds.x + spawnHintBounds.width / 2, y: spawnHintBounds.y + spawnHintBounds.height + 20 } : undefined;
    const newCoworker = createCoworkerFromConfig(cfg, state.desks, hintPos);
    coworkers = [...coworkers, newCoworker];
    // Chain-spawn quickly if under max to ensure presence during playtests
    nextCoworkerSpawnMs = coworkers.length < COWORKER_SYSTEM.maxActiveCoworkers ? nowMs + 800 : nowMs + getRandomCoworkerSpawnDelay();
  }
  // If we have no timer, schedule one
  if (nextCoworkerSpawnMs === null) {
    nextCoworkerSpawnMs = nowMs + getRandomCoworkerSpawnDelay();
  }
  // Phase 3.2: Helpful coworker warning system
  let coworkerWarnings = [...(state.coworkerWarnings ?? [])];
  const helpfuls = coworkers.filter((c) => c.type === 'helpful');
  for (let i = 0; i < helpfuls.length; i += 1) {
    const cw = helpfuls[i];
    const result = checkHelpfulCoworkerAction(cw, { ...player, position: newPosition }, activeBoss, state);
    if (result.shouldWarn && result.position) {
      // Register a warning and apply score penalty once
      const penalty = Math.floor((state.score) * 0.5);
      coworkerWarnings.push({
        coworkerId: cw.id,
        type: 'boss_warning',
        message: 'Boss incoming!',
        position: result.position,
        remainingMs: 2000,
        scoreReduction: penalty,
      });
      // Update last action to enforce cooldown
      cw.lastActionMs = nowMs;
      // Trigger brief rush behavior for urgency
      const rushed = maybeStartHelpfulRush(cw, { ...player, position: newPosition });
      coworkers = coworkers.map((x) => (x.id === rushed.id ? rushed : x));
      // Apply immediate score reduction
      nextScore = Math.max(0, nextScore - penalty);
    }
  }
  // Tick down coworker warnings and prune expired
  coworkerWarnings = coworkerWarnings
    .map((w) => ({ ...w, remainingMs: w.remainingMs - deltaTimeMs }))
    .filter((w) => w.remainingMs > 0);

  // Phase 3.3: Snitch integration — periodic checks while gaming, only when no boss and low suspicion
  let nextSnitchCheckMs = state.nextSnitchCheckMs ?? null;
  const snitches = coworkers.filter((c) => c.type === 'snitch');
  // If a boss is already incoming (pre-spawn warning active), snitches cannot call the boss
  const bossIncomingSoon = !!bossWarning && !!bossWarning.isActive;
  if (gameMode === 'gaming' && !bossIncomingSoon) {
    const now = nowMs;
    if (nextSnitchCheckMs == null || now >= nextSnitchCheckMs) {
      for (const snitch of snitches) {
        const action = checkSnitchAction(snitch, gameMode, { ...player, position: newPosition }, suspicion, bossesOut.length > 0);
        if (action.shouldCallBoss) {
          // Schedule next boss sooner by 75% (i.e., 25% of normal delay)
          const reducedDelay = getRandomSpawnDelay(BossType.MANAGER) * 0.25;
          // Only affect if no active boss; if boss already present, still update nextBossSpawnMs
          nextBossSpawnMs = now + reducedDelay;
          upcomingBossType = selectRandomBossType();
          nextBossSpawnIsSnitch = true;
          // Visual warning center-top for 1s
          coworkerWarnings.push({
            coworkerId: snitch.id,
            type: 'snitch_warning',
            message: action.warningMessage ?? 'Someone called the boss!',
            position: { x: CANVAS_WIDTH / 2, y: 80 },
            remainingMs: 1000,
            scoreReduction: 0,
          });
          // Cooldown per snitch
          snitch.lastActionMs = now;
          state.lastSnitchMs = now;
          state.nextForcedSnitchMs = now + 100000;
        }
      }
      // Next check in 5 seconds
      nextSnitchCheckMs = now + 5000;
    }
  } else {
    // Not gaming → pause checks until next gaming window
    // Or when boss is already incoming: delay checks slightly
    nextSnitchCheckMs = bossIncomingSoon ? nowMs + 5000 : null;
  }

  // Phase 3.4: Boss shout checks and biasing toward player desk when suspicion is high
  let bossShouts = [...(state.bossShouts ?? [])];
  let nextBossShoutCheckMs = state.nextBossShoutCheckMs ?? null;
  // Decrement and prune shouts
  bossShouts = bossShouts
    .map((s) => ({ ...s, remainingMs: s.remainingMs - deltaTimeMs }))
    .filter((s) => s.remainingMs > 0);
  if (nextBossShoutCheckMs == null) nextBossShoutCheckMs = nowMs + BOSS_UX.shoutCheckMs;
  if (nowMs >= nextBossShoutCheckMs) {
    for (const b of bossesOut) {
      if (Math.random() < BOSS_UX.shoutChance) {
        const msg = BOSS_UX.shouts[Math.floor(Math.random() * BOSS_UX.shouts.length)] || 'Get back to work!';
        bossShouts.push({
          bossId: b.id,
          message: msg,
          position: { x: b.position.x, y: b.position.y - (b.size ?? BOSS_SIZE) - 10 },
          remainingMs: BOSS_UX.shoutDurationMs,
        });
      }
    }
    nextBossShoutCheckMs = nowMs + BOSS_UX.shoutCheckMs;
  }
  // Bias boss pathing toward the player's desk when suspicion is high
  if ((suspicion ?? 0) >= BOSS_UX.biasThreshold && bossesOut.length > 0) {
    const pd = state.desks.find((d) => d.isPlayerDesk) ?? null;
    if (pd) {
      const center = { x: pd.bounds.x + pd.bounds.width / 2, y: pd.bounds.y + pd.bounds.height / 2 };
      for (const b of bossesOut as any[]) {
        if (Math.random() < BOSS_UX.biasChancePerRetarget) {
          b.biasTarget = center;
        }
      }
    }
  }

  // Phase 3.4: Gossip simplified flow — approach player, show top message, lock for 3–8s
  let conversationState = state.conversationState ?? null;
  let nextGossipCheckMs = state.nextGossipCheckMs ?? null;
  if (gameMode === 'gaming' && (bossesOut.length > 0)) {
    const now = nowMs;
    if (nextGossipCheckMs == null || now >= nextGossipCheckMs) {
      const gossips = coworkers.filter((c) => c.type === 'gossip');
      if (!conversationState?.isActive) {
        for (const g of gossips) {
          const conv = checkGossipInterruption(g, gameMode, conversationState);
          if (conv) {
            const playerDesk = state.desks.find((d) => d.isPlayerDesk) ?? null;
            const anchor = playerDesk ? getPlayerSeatAnchor(playerDesk) : newPosition;
            const durationMs = 3000 + Math.floor(Math.random() * 5000);
            const approached = setGossipApproachTarget(g, anchor, state.desks, durationMs + 1000);
            coworkers = coworkers.map((x) => (x.id === approached.id ? approached : x));
            // Top-of-screen single message with duration (keep visible throughout lock)
            coworkerWarnings.push({
              coworkerId: g.id,
              type: 'gossip_warning',
              message: `Coworker wants to gossip for ${(durationMs / 1000) | 0}s`,
              position: { x: CANVAS_WIDTH / 2, y: 50 },
              remainingMs: durationMs,
              scoreReduction: 0,
            });
            // Start lock immediately
            conversationState = {
              isActive: true,
              coworkerId: g.id,
              startMs: now,
              durationMs: durationMs,
              message: 'Coworker wants to chat...'
            };
            g.lastActionMs = now;
            state.lastInterruptionMs = now;
            state.nextForcedInterruptionMs = now + 20000;
            break;
          }
        }
      }
      nextGossipCheckMs = now + 3000;
    }
  } else {
    nextGossipCheckMs = null;
  }

  // Phase 3.5: Distraction coworker question system (10% per 4s while gaming)
  let activeQuestion = state.activeQuestion ?? null;
  let questionLockUntilMs = state.questionLockUntilMs ?? null;
  let nextDistractionCheckMs = state.nextDistractionCheckMs ?? null;
  if (gameMode === 'gaming' && !(conversationState?.isActive)) {
    const now = nowMs;
    if (nextDistractionCheckMs == null || now >= nextDistractionCheckMs) {
      const distractions = coworkers.filter((c) => c.type === 'distraction');
      for (const d of distractions) {
        const shouldAsk = checkDistractionQuestion(d, gameMode, conversationState);
        if (shouldAsk) {
          const qText = WORK_QUESTIONS[Math.floor(Math.random() * WORK_QUESTIONS.length)];
          activeQuestion = {
            id: `q-${now}`,
            coworkerId: d.id,
            question: qText,
            isActive: true,
            startMs: now,
            timeoutMs: 8000,
          };
          d.lastActionMs = now;
          state.lastInterruptionMs = now;
          state.nextForcedInterruptionMs = now + 20000;
          break;
        }
      }
      nextDistractionCheckMs = now + 4000;
    }
  } else {
    nextDistractionCheckMs = null;
  }

  // Auto-resolve question on timeout with ignore behavior
  if (activeQuestion && activeQuestion.isActive) {
    if (nowMs - activeQuestion.startMs >= activeQuestion.timeoutMs) {
      // Ignore path
      nextScore = Math.max(0, nextScore + QUESTION_CHOICES.ignore.scoreChange);
      // Flash a sleek top message for 3s
      coworkerWarnings.push({
        coworkerId: activeQuestion.coworkerId,
        type: 'gossip_warning',
        message: 'Coworker needs help',
        position: { x: CANVAS_WIDTH / 2, y: 50 },
        remainingMs: 3000,
        scoreReduction: 0,
      });
      activeQuestion = null;
    }
  }

  // While conversation active, end after duration
  if (conversationState?.isActive) {
    const now = nowMs;
    if (now - conversationState.startMs >= conversationState.durationMs) {
      conversationState = null;
    }
  }

  // Guarantee: if 20 seconds pass in gaming with a boss present and no interruptions (gossip or question), force one
  if (gameMode === 'gaming' && bossesOut.length > 0) {
    const lastInt = state.lastInterruptionMs ?? nowMs;
    if ((state.nextForcedInterruptionMs ?? (lastInt + 20000)) <= nowMs && !conversationState?.isActive && !(activeQuestion?.isActive)) {
      const hasGossip = coworkers.some((c) => c.type === 'gossip');
      const hasDistraction = coworkers.some((c) => c.type === 'distraction');
      if (hasGossip) {
        // Force gossip
        const g = coworkers.find((c) => c.type === 'gossip');
        if (g) {
          const playerDesk = state.desks.find((d) => d.isPlayerDesk) ?? null;
          const anchor = playerDesk ? getPlayerSeatAnchor(playerDesk) : newPosition;
          const durationMs = 3000 + Math.floor(Math.random() * 5000);
          const approached = setGossipApproachTarget(g, anchor, state.desks, durationMs + 1000);
          coworkers = coworkers.map((x) => (x.id === approached.id ? approached : x));
          coworkerWarnings.push({
            coworkerId: g.id,
            type: 'gossip_warning',
            message: `Coworker wants to gossip for ${(durationMs / 1000) | 0}s`,
            position: { x: CANVAS_WIDTH / 2, y: 50 },
            remainingMs: durationMs,
            scoreReduction: 0,
          });
          conversationState = { isActive: true, coworkerId: g.id, startMs: nowMs, durationMs, message: 'Coworker wants to chat...' };
          (g as any).lastActionMs = nowMs;
          state.lastInterruptionMs = nowMs;
          state.nextForcedInterruptionMs = nowMs + 20000;
        }
      } else if (hasDistraction) {
        // Force distraction question
        const d = coworkers.find((c) => c.type === 'distraction');
        if (d) {
          activeQuestion = {
            id: `q-${nowMs}`,
            coworkerId: d.id,
            question: WORK_QUESTIONS[Math.floor(Math.random() * WORK_QUESTIONS.length)],
            isActive: true,
            startMs: nowMs,
            timeoutMs: 8000,
          };
          (d as any).lastActionMs = nowMs;
          state.lastInterruptionMs = nowMs;
          state.nextForcedInterruptionMs = nowMs + 20000;
        }
      }
    }
  }

  // Guarantee: force a snitch call after 100s of gaming without one (when no boss is present or even if present, we accelerate next spawn)
  if (gameMode === 'gaming') {
    const due = (state.nextForcedSnitchMs ?? (nowMs + 100000)) <= nowMs;
    if (due) {
      const anySnitch = coworkers.find((c) => c.type === 'snitch');
      if (anySnitch) {
        const reducedDelay = getRandomSpawnDelay(BossType.MANAGER) * 0.25;
        nextBossSpawnMs = nowMs + reducedDelay;
        upcomingBossType = selectRandomBossType();
        nextBossSpawnIsSnitch = true;
        coworkerWarnings.push({
          coworkerId: anySnitch.id,
          type: 'snitch_warning',
          message: 'Someone called the boss!',
          position: { x: CANVAS_WIDTH / 2, y: 80 },
          remainingMs: 1000,
          scoreReduction: 0,
        });
        state.lastSnitchMs = nowMs;
        state.nextForcedSnitchMs = nowMs + 100000;
      }
    }
  }

  // If a conversation just started this frame, freeze scoring for this tick
  if (!state.conversationState?.isActive && conversationState?.isActive) {
    nextScore = state.score;
  }

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
    bossWarning,
    upcomingBossType,
    coworkers,
    nextCoworkerSpawnMs,
    coworkerWarnings,
    nextSnitchCheckMs,
    bossShouts,
    nextBossShoutCheckMs,
    nextBossSpawnIsSnitch,
    conversationState,
    nextGossipCheckMs,
    activeQuestion,
    questionLockUntilMs,
    nextDistractionCheckMs,
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

  // Draw boss shouts (speech bubbles)
  for (const shout of state.bossShouts ?? []) {
    const alpha = Math.max(0.2, Math.min(1, shout.remainingMs / BOSS_UX.shoutDurationMs));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    const text = shout.message;
    ctx.font = '12px sans-serif';
    const padding = 6;
    const textWidth = ctx.measureText(text).width;
    const width = textWidth + padding * 2;
    const height = 20;
    const x = shout.position.x - width / 2;
    const y = shout.position.y - height;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, shout.position.x, shout.position.y - height / 2);
    ctx.restore();
  }

  // Draw coworkers (below player, above desks)
  for (const coworker of state.coworkers ?? []) {
    const size = coworker.size;
    ctx.fillStyle = coworker.color;
    ctx.fillRect(coworker.position.x - size / 2, coworker.position.y - size / 2, size, size);
  }

  // Draw coworker warning bubbles above helpful coworkers
  for (const warning of state.coworkerWarnings ?? []) {
    if (warning.type !== 'boss_warning') continue;
    const alpha = Math.max(0.2, Math.min(1, warning.remainingMs / 2000));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    const text = warning.message;
    ctx.font = '12px sans-serif';
    const padding = 6;
    const textWidth = ctx.measureText(text).width;
    const width = textWidth + padding * 2;
    const height = 20;
    const x = warning.position.x - width / 2;
    const y = warning.position.y - height;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, warning.position.x, warning.position.y - height / 2);
    ctx.restore();
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

  // Score display moved to GameCanvas overlay

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


