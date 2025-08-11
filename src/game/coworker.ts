import { CANVAS_HEIGHT, CANVAS_WIDTH, COWORKER_CONFIGS, COWORKER_SYSTEM } from './constants.ts';
import type { Boss, Coworker, CoworkerConfig, ConversationState, Desk, GameState, Player, Position } from './types.ts';
import { CoworkerType } from './types.ts';
import { checkEntityCollision, hasLineOfSight } from './collision.ts';

type Rect = { x: number; y: number; width: number; height: number };

function computeWalkwayLines(desks: Desk[], clearance = 10): { vLines: number[]; hLines: number[] } {
  const cols = Array.from(new Set(desks.map((d) => d.bounds.x))).sort((a, b) => a - b);
  const rows = Array.from(new Set(desks.map((d) => d.bounds.y))).sort((a, b) => a - b);
  const deskWidth = desks[0]?.bounds.width ?? 0;
  const deskHeight = desks[0]?.bounds.height ?? 0;

  const vLines: number[] = [];
  for (let i = 0; i < cols.length - 1; i += 1) {
    const leftEdge = cols[i] + deskWidth + clearance;
    const rightEdge = cols[i + 1] - clearance;
    vLines.push((leftEdge + rightEdge) / 2);
  }
  const minX = Math.min(...cols);
  const maxX = Math.max(...cols.map((x) => x + deskWidth));
  vLines.unshift((minX + 0) / 2 + clearance);
  vLines.push(((maxX + CANVAS_WIDTH) / 2) - clearance);

  const hLines: number[] = [];
  for (let j = 0; j < rows.length - 1; j += 1) {
    const topEdge = rows[j] + deskHeight + clearance;
    const bottomEdge = rows[j + 1] - clearance;
    hLines.push((topEdge + bottomEdge) / 2);
  }
  const minY = Math.min(...rows);
  const maxY = Math.max(...rows.map((y) => y + deskHeight));
  hLines.unshift((minY + 0) / 2 + clearance);
  hLines.push(((maxY + CANVAS_HEIGHT) / 2) - clearance);
  return { vLines, hLines };
}

function segmentIntersectsAny(a: Position, b: Position, obstacles: Rect[]): boolean {
  function pointInRect(p: Position, r: Rect): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  }
  function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }
  function segmentsIntersect(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
    return ccw(p1.x, p1.y, p3.x, p3.y, p4.x, p4.y) !== ccw(p2.x, p2.y, p3.x, p3.y, p4.x, p4.y) &&
      ccw(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y) !== ccw(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
  }
  function segmentIntersectsRect(p1: Position, p2: Position, r: Rect): boolean {
    if (pointInRect(p1, r) || pointInRect(p2, r)) return true;
    const r1 = { x: r.x, y: r.y } as Position;
    const r2 = { x: r.x + r.width, y: r.y } as Position;
    const r3 = { x: r.x + r.width, y: r.y + r.height } as Position;
    const r4 = { x: r.x, y: r.y + r.height } as Position;
    return segmentsIntersect(p1, p2, r1, r2) ||
      segmentsIntersect(p1, p2, r2, r3) ||
      segmentsIntersect(p1, p2, r3, r4) ||
      segmentsIntersect(p1, p2, r4, r1);
  }
  for (const r of obstacles) {
    if (segmentIntersectsRect(a, b, r)) return true;
  }
  return false;
}

function pickNextTarget(from: Position, vLines: number[], hLines: number[], obstacles: Rect[], minClearance = 10): Position {
  const candidates: Position[] = [];
  for (const x of vLines) {
    for (const y of hLines) {
      if (x === from.x && y === from.y) continue;
      const p = { x, y };
      if (!segmentIntersectsAny(from, p, obstacles)) {
        // also ensure the point itself is not inside or too close to any obstacle
        const nearObstacle = obstacles.some((r) => (
          x >= r.x - minClearance && x <= r.x + r.width + minClearance &&
          y >= r.y - minClearance && y <= r.y + r.height + minClearance
        ));
        if (!nearObstacle) candidates.push(p);
      }
    }
  }
  if (candidates.length === 0) return from;
  // Prefer nearer points for smoother motion
  const sorted = candidates.map((p) => ({ p, d: Math.hypot(p.x - from.x, p.y - from.y) }))
    .sort((a, b) => a.d - b.d);
  const top = sorted.slice(0, Math.min(3, sorted.length));
  return top[Math.floor(Math.random() * top.length)].p;
}

function findNearestIntersection(vLines: number[], hLines: number[], pos: Position): Position {
  let best: Position = { x: vLines[0], y: hLines[0] };
  let bestD = Number.POSITIVE_INFINITY;
  for (const x of vLines) {
    for (const y of hLines) {
      const d = Math.hypot(x - pos.x, y - pos.y);
      if (d < bestD) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

// Ensure the next waypoint is axis-aligned relative to the current position when possible
// Returns a straight-line alternative that does not intersect obstacles; otherwise returns the original target
function coerceToStraightTarget(from: Position, to: Position, obstacles: Rect[]): Position {
  if (from.x === to.x || from.y === to.y) return to;
  const cand1: Position = { x: from.x, y: to.y }; // vertical move
  const cand2: Position = { x: to.x, y: from.y }; // horizontal move
  const options: Position[] = [];
  if (!segmentIntersectsAny(from, cand1, obstacles)) options.push(cand1);
  if (!segmentIntersectsAny(from, cand2, obstacles)) options.push(cand2);
  if (options.length === 0) return to;
  return options[Math.floor(Math.random() * options.length)];
}

export function createCoworkerFromConfig(config: CoworkerConfig, desks: Desk[], spawnHint?: Position): Coworker {
  const { vLines, hLines } = computeWalkwayLines(desks, Math.ceil(config.size / 2));
  const obstacles: Rect[] = desks.map((d) => d.bounds);
  const start: Position = spawnHint ? findNearestIntersection(vLines, hLines, spawnHint) : {
    x: vLines[Math.floor(Math.random() * vLines.length)],
    y: hLines[Math.floor(Math.random() * hLines.length)],
  };
  let next = pickNextTarget(start, vLines, hLines, obstacles, Math.ceil(config.size / 2));
  // Snitches should move only in straight lines between intersections
  if (config.type === CoworkerType.SNITCH) {
    next = coerceToStraightTarget(start, next, obstacles);
  }
  const lifespan = getRandomCoworkerDespawnDuration();
  return {
    id: `coworker-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: config.type,
    position: { x: start.x, y: start.y },
    speed: config.speed,
    patrolRoute: [start, next],
    currentTarget: 1,
    size: config.size,
    color: config.color,
    lastActionMs: 0,
    isActive: true,
    despawnAtMs: performance.now() + lifespan,
  };
}

export function updateCoworker(coworker: Coworker, desks: Desk[]): Coworker {
  const target = coworker.rushTarget ?? coworker.patrolRoute[coworker.currentTarget];
  const dx = target.x - coworker.position.x;
  const dy = target.y - coworker.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = coworker.rushTarget ? coworker.speed * 1.8 : coworker.speed;
  const stepX = (dx / dist) * speed;
  const stepY = (dy / dist) * speed;
  let nextX = coworker.position.x + stepX;
  let nextY = coworker.position.y + stepY;

  // Bounds clamp for safety
  const half = coworker.size / 2;
  let clampedX = Math.max(half, Math.min(CANVAS_WIDTH - half, nextX));
  let clampedY = Math.max(half, Math.min(CANVAS_HEIGHT - half, nextY));

  // Axis-separated collision against desks using size-aware AABB
  // Try X movement
  if (checkEntityCollision({ x: clampedX, y: coworker.position.y }, coworker.size, desks)) {
    clampedX = coworker.position.x; // cancel X
  }
  // Try Y movement
  if (checkEntityCollision({ x: clampedX, y: clampedY }, coworker.size, desks)) {
    clampedY = coworker.position.y; // cancel Y
  }

  // If close enough, pick next waypoint
  if (Math.hypot(target.x - clampedX, target.y - clampedY) <= speed) {
    const { vLines, hLines } = computeWalkwayLines(desks, Math.ceil(coworker.size / 2));
    const obstacles: Rect[] = desks.map((d) => d.bounds);
    const arrived: Position = { x: target.x, y: target.y };
    let next = coworker.rushTarget ? arrived : pickNextTarget(arrived, vLines, hLines, obstacles, Math.ceil(coworker.size / 2));
    if (!coworker.rushTarget && coworker.type === CoworkerType.SNITCH) {
      next = coerceToStraightTarget(arrived, next, obstacles);
    }
    return {
      ...coworker,
      position: arrived,
      patrolRoute: coworker.rushTarget ? coworker.patrolRoute : [arrived, next],
      currentTarget: 1,
    };
  }

  return { ...coworker, position: { x: clampedX, y: clampedY } };
}

export function pickRandomCoworkerConfig(): CoworkerConfig {
  const configs = Object.values(COWORKER_CONFIGS);
  const totalProb = configs.reduce((sum, cfg) => sum + cfg.spawnProbability, 0);
  let r = Math.random() * (totalProb || 1);
  for (const cfg of configs) {
    if (r < cfg.spawnProbability) return cfg;
    r -= cfg.spawnProbability;
  }
  return configs[0];
}

export function getRandomCoworkerSpawnDelay(): number {
  const [min, max] = COWORKER_SYSTEM.spawnDelayMs;
  return Math.random() * (max - min) + min;
}

export function getRandomCoworkerDespawnDuration(): number {
  const [min, max] = COWORKER_SYSTEM.despawnDurationMs;
  return Math.random() * (max - min) + min;
}

// Phase 3.2: Helpful coworker detection action
export function checkHelpfulCoworkerAction(
  coworker: Coworker,
  player: Player,
  boss: Boss | null,
  gameState: GameState,
): { shouldWarn: boolean; position?: Position } {
  if (!boss || coworker.type !== CoworkerType.HELPFUL) return { shouldWarn: false };
  // Only warn while gaming
  if (gameState.gameMode !== 'gaming') return { shouldWarn: false };

  const playerToBoss = Math.hypot(player.position.x - boss.position.x, player.position.y - boss.position.y);
  const coworkerToPlayer = Math.hypot(player.position.x - coworker.position.x, player.position.y - coworker.position.y);
  const now = performance.now();
  const canAct = now - coworker.lastActionMs > COWORKER_CONFIGS[CoworkerType.HELPFUL].actionCooldownMs;

  const bossHasLOS = hasLineOfSight(boss, player, gameState.desks);
  const proximityOK = playerToBoss <= 200;
  const losWithinOK = bossHasLOS && playerToBoss <= 250;

  if ((proximityOK || losWithinOK) && coworkerToPlayer <= 100 && canAct) {
    return { shouldWarn: true, position: { x: coworker.position.x, y: coworker.position.y - 30 } };
  }
  return { shouldWarn: false };
}

// Phase 3.3: Snitch action logic (20% chance per interval while gaming)
export function checkSnitchAction(
  coworker: Coworker,
  gameMode: 'work' | 'gaming',
  player: Player,
  suspicion: number,
  hasActiveBoss: boolean,
): { shouldCallBoss: boolean; warningMessage?: string } {
  if (coworker.type !== CoworkerType.SNITCH || gameMode !== 'gaming') {
    return { shouldCallBoss: false };
  }
  // Only snitch when there are no bosses around and suspicion is low (<10%)
  if (hasActiveBoss || suspicion >= 10) return { shouldCallBoss: false };

  const now = performance.now();
  const canAct = now - coworker.lastActionMs > COWORKER_CONFIGS[CoworkerType.SNITCH].actionCooldownMs;

  // Snitch must have "passed by" and seen the player recently (within 3s and within 120px)
  const near = Math.hypot(player.position.x - coworker.position.x, player.position.y - coworker.position.y) <= 120;
  if (near) {
    coworker.lastNearPlayerMs = now;
  }
  const recentlyNear = coworker.lastNearPlayerMs != null && now - (coworker.lastNearPlayerMs ?? 0) <= 3000;

  if (canAct && recentlyNear && Math.random() < 0.2) {
    return { shouldCallBoss: true, warningMessage: 'Someone called the boss!' };
  }
  return { shouldCallBoss: false };
}

// Phase 3.2 addition: initiate a brief "rush" towards the player to feel more office-like
export function maybeStartHelpfulRush(coworker: Coworker, player: Player): Coworker {
  if (coworker.type !== CoworkerType.HELPFUL) return coworker;
  const now = performance.now();
  // Rush lasts 2 seconds towards a point near the player (above)
  const rushDuration = 2000;
  const target: Position = { x: player.position.x, y: Math.max(0, player.position.y - 20) };
  return {
    ...coworker,
    rushUntilMs: now + rushDuration,
    rushTarget: target,
  };
}

export function clearExpiredRush(coworker: Coworker): Coworker {
  if (!coworker.rushUntilMs) return coworker;
  if (performance.now() >= coworker.rushUntilMs) {
    return { ...coworker, rushUntilMs: null, rushTarget: null };
  }
  return coworker;
}

export function updateRushTargetTowardsPlayer(coworker: Coworker, player: Player): Coworker {
  if (!coworker.rushUntilMs) return coworker;
  return {
    ...coworker,
    rushTarget: { x: player.position.x, y: Math.max(0, player.position.y - 20) },
  };
}

// Phase 3.3 UX: Make snitches more likely to patrol near the player when gaming
export function maybeBiasSnitchTowardPlayer(
  coworker: Coworker,
  player: Player,
  gameMode: 'work' | 'gaming',
  desks: Desk[],
): Coworker {
  if (coworker.type !== CoworkerType.SNITCH || gameMode !== 'gaming') return coworker;
  // If already fairly near, no need to bias
  const d = Math.hypot(player.position.x - coworker.position.x, player.position.y - coworker.position.y);
  if (d <= 140) return coworker;
  // With small per-frame chance, retarget next waypoint toward the nearest walkway point to the player
  if (Math.random() < (COWORKER_SYSTEM as any).snitchBiasChancePerFrame) {
    const { vLines, hLines } = computeWalkwayLines(desks);
    const obstacles: Rect[] = desks.map((d) => d.bounds);
    const targetRaw = findNearestIntersection(vLines, hLines, player.position);
    const target = coerceToStraightTarget(coworker.position, targetRaw, obstacles);
    return {
      ...coworker,
      patrolRoute: [coworker.position, target],
      currentTarget: 1,
    };
  }
  return coworker;
}


// Phase 3.4: Gossip interruption logic
export function checkGossipInterruption(
  coworker: Coworker,
  gameMode: 'work' | 'gaming',
  existingConversation: ConversationState | null,
): ConversationState | null {
  if (coworker.type !== CoworkerType.GOSSIP || gameMode !== 'gaming' || existingConversation?.isActive) {
    return null;
  }
  const now = performance.now();
  const canAct = now - (coworker.lastActionMs ?? 0) > COWORKER_CONFIGS[CoworkerType.GOSSIP].actionCooldownMs;
  if (canAct && Math.random() < 0.15) {
    return {
      isActive: true,
      coworkerId: coworker.id,
      startMs: now,
      durationMs: 2000,
      message: 'Coworker wants to chat...',
    };
  }
  return null;
}

// Phase 3.4: Direct the gossiper to walk to the player and sit next
export function setGossipApproachTarget(
  coworker: Coworker,
  anchor: Position,
  desks: Desk[],
  holdMs: number,
): Coworker {
  const target: Position = { x: anchor.x, y: Math.max(0, anchor.y) };
  // Coerce to nearby intersection to keep path clean
  const { vLines, hLines } = computeWalkwayLines(desks);
  const obstacles: Rect[] = desks.map((d) => d.bounds);
  const near = findNearestIntersection(vLines, hLines, target);
  const straight = coerceToStraightTarget(coworker.position, near, obstacles);
  return {
    ...coworker,
    patrolRoute: [coworker.position, straight],
    currentTarget: 1,
    rushTarget: target,
    rushUntilMs: performance.now() + holdMs,
  };
}

// Phase 3.5: Distraction check (10% per 4s while gaming)
export function checkDistractionQuestion(
  coworker: Coworker,
  gameMode: 'work' | 'gaming',
  existingConversation: ConversationState | null,
): boolean {
  if (coworker.type !== CoworkerType.DISTRACTION || gameMode !== 'gaming') return false;
  if (existingConversation?.isActive) return false;
  const now = performance.now();
  const canAct = now - (coworker.lastActionMs ?? 0) > COWORKER_CONFIGS[CoworkerType.DISTRACTION].actionCooldownMs;
  if (!canAct) return false;
  return Math.random() < 0.10;
}

