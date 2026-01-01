import { CANVAS_HEIGHT, CANVAS_WIDTH, BOSS_CONFIGS } from './constants.ts';
import type { Boss, BossConfig, Desk, GameMode, Player, Position } from './types.ts';
import { BossType } from './types.ts';

type Rect = { x: number; y: number; width: number; height: number };
type Axis = 'h' | 'v' | 'd';
type PatrolMeta = { vLines: number[]; hLines: number[]; obstacles: Rect[]; lastPoint?: Position; lastAxis?: Axis; biasTarget?: Position | null };

export function createBoss(desks: Desk[]): Boss & PatrolMeta {
  // Backward-compatible wrapper to maintain Phase 1 API while adopting config-driven boss
  return createBossFromConfig(BOSS_CONFIGS[BossType.MANAGER], desks);
}

// Phase 2.1: Config-driven boss factory retaining Phase 1 pathing
export function createBossFromConfig(config: BossConfig, desks: Desk[]): (Boss & PatrolMeta) {
  const { vLines, hLines } = computeWalkwayLines(desks);
  const obstacles: Rect[] = desks.map((d) => d.bounds);
  const start: Position = {
    x: vLines[Math.floor(Math.random() * vLines.length)],
    y: hLines[Math.floor(Math.random() * hLines.length)],
  };
  const next = pickNextTarget(start, vLines, hLines, undefined, obstacles, undefined);
  const boss: Boss & PatrolMeta = {
    id: `boss-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: config.type,
    position: { x: start.x, y: start.y },
    speed: config.speed,
    patrolRoute: [start, next],
    currentTarget: 1,
    detectionRadius: config.detectionRadius,
    vLines,
    hLines,
    obstacles,
    lastPoint: start,
    lastAxis: undefined,
    biasTarget: null,
    // Visual/scoring extensions for Phase 2
    size: config.size,
    color: config.color,
    basePointsPerSecond: config.basePointsPerSecond,
  } as unknown as Boss & PatrolMeta;
  return boss;
}

function computeWalkwayLines(desks: Desk[]): { vLines: number[]; hLines: number[] } {
  const cols = Array.from(new Set(desks.map((d) => d.bounds.x))).sort((a, b) => a - b);
  const rows = Array.from(new Set(desks.map((d) => d.bounds.y))).sort((a, b) => a - b);
  const deskWidth = desks[0]?.bounds.width ?? 0;
  const deskHeight = desks[0]?.bounds.height ?? 0;

  const vLines: number[] = [];
  for (let i = 0; i < cols.length - 1; i += 1) {
    const leftEdge = cols[i] + deskWidth;
    const rightEdge = cols[i + 1];
    vLines.push((leftEdge + rightEdge) / 2);
  }
  const minX = Math.min(...cols);
  const maxX = Math.max(...cols.map((x) => x + deskWidth));
  vLines.unshift(minX / 2);
  vLines.push((maxX + CANVAS_WIDTH) / 2);

  const hLines: number[] = [];
  for (let j = 0; j < rows.length - 1; j += 1) {
    const topEdge = rows[j] + deskHeight;
    const bottomEdge = rows[j + 1];
    hLines.push((topEdge + bottomEdge) / 2);
  }
  const minY = Math.min(...rows);
  const maxY = Math.max(...rows.map((y) => y + deskHeight));
  hLines.unshift(minY / 2);
  hLines.push((maxY + CANVAS_HEIGHT) / 2);
  return { vLines, hLines };
}

function pickNextTarget(
  from: Position,
  vLines: number[],
  hLines: number[],
  avoid: Position | undefined,
  obstacles: Rect[],
  lastAxis: Axis | undefined,
  biasTarget?: Position | null,
): Position {
  // Build all grid intersections as candidate waypoints, excluding current
  const allPoints: Position[] = [];
  for (const x of vLines) {
    for (const y of hLines) {
      if (x === from.x && y === from.y) continue;
      allPoints.push({ x, y });
    }
  }
  // Filter out straight backtracking to last point
  let candidates = avoid ? allPoints.filter((p) => p.x !== avoid.x || p.y !== avoid.y) : allPoints;

  // Avoid segments that intersect any obstacle (desk)
  candidates = candidates.filter((p) => !segmentIntersectsAny(from, p, obstacles));

  if (candidates.length === 0) {
    // Fallback to any different axis-aligned move
    candidates = vLines.filter((x) => x !== from.x).map((x) => ({ x, y: from.y }))
      .concat(hLines.filter((y) => y !== from.y).map((y) => ({ x: from.x, y })));
  }
  // Partition into diagonal vs straight moves
  const diagonal = candidates.filter((p) => p.x !== from.x && p.y !== from.y);
  const straightH = candidates.filter((p) => p.y === from.y && p.x !== from.x); // horizontal
  const straightV = candidates.filter((p) => p.x === from.x && p.y !== from.y); // vertical
  const straight = [...straightH, ...straightV];

  // Prefer diagonals with 90% probability when available
  const preferDiagonal = diagonal.length > 0 && Math.random() < 0.9;
  let pool: Position[] = [];
  if (preferDiagonal) {
    pool = diagonal;
  } else if (straight.length > 0) {
    // When choosing straight, bias to switch axis relative to last move (stronger bias)
    if (lastAxis === 'h' && straightV.length > 0 && Math.random() < 0.9) pool = straightV;
    else if (lastAxis === 'v' && straightH.length > 0 && Math.random() < 0.9) pool = straightH;
    else pool = straight;
  } else {
    pool = diagonal; // fallback
  }

  // Selection: if a bias target is provided, prioritize points closer to it; otherwise favor near to 'from'
  const scored = pool.map((p) => {
    const dFrom = Math.hypot(p.x - from.x, p.y - from.y);
    const dBias = biasTarget ? Math.hypot(p.x - (biasTarget as Position).x, p.y - (biasTarget as Position).y) : dFrom;
    const score = biasTarget ? dBias : dFrom;
    return { p, d: score };
  });
  scored.sort((a, b) => a.d - b.d);
  const topK = scored.slice(0, Math.max(1, Math.min(3, scored.length)));
  const choice = topK[Math.floor(Math.random() * topK.length)];
  return choice.p;
}

function pointInRect(p: Position, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  return ccw(a.x, a.y, c.x, c.y, d.x, d.y) !== ccw(b.x, b.y, c.x, c.y, d.x, d.y) &&
    ccw(a.x, a.y, b.x, b.y, c.x, c.y) !== ccw(a.x, a.y, b.x, b.y, d.x, d.y);
}

function segmentIntersectsRect(a: Position, b: Position, r: Rect): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const r1 = { x: r.x, y: r.y } as Position;
  const r2 = { x: r.x + r.width, y: r.y } as Position;
  const r3 = { x: r.x + r.width, y: r.y + r.height } as Position;
  const r4 = { x: r.x, y: r.y + r.height } as Position;
  return segmentsIntersect(a, b, r1, r2) ||
    segmentsIntersect(a, b, r2, r3) ||
    segmentsIntersect(a, b, r3, r4) ||
    segmentsIntersect(a, b, r4, r1);
}

function segmentIntersectsAny(a: Position, b: Position, obstacles: Rect[]): boolean {
  for (const r of obstacles) {
    if (segmentIntersectsRect(a, b, r)) return true;
  }
  return false;
}

export function updateBoss(boss: Boss & PatrolMeta): Boss & PatrolMeta {
  const target = boss.patrolRoute[boss.currentTarget];
  const dx = target.x - boss.position.x;
  const dy = target.y - boss.position.y;
  const dist = Math.hypot(dx, dy) || 1;

  const stepX = (dx / dist) * boss.speed;
  const stepY = (dy / dist) * boss.speed;
  const nextX = boss.position.x + stepX;
  const nextY = boss.position.y + stepY;

  // If close enough, snap and advance target
  if (Math.hypot(target.x - nextX, target.y - nextY) <= boss.speed) {
    const arrived: Position = { x: target.x, y: target.y };
    // Determine axis of last segment for axis switching bias
    let lastAxis: Axis | undefined = 'd';
    if (boss.position.x !== arrived.x && boss.position.y === arrived.y) lastAxis = 'h';
    else if (boss.position.x === arrived.x && boss.position.y !== arrived.y) lastAxis = 'v';
    else if (boss.position.x !== arrived.x && boss.position.y !== arrived.y) lastAxis = 'd';
    const next = pickNextTarget(arrived, boss.vLines, boss.hLines, boss.lastPoint, boss.obstacles, lastAxis, boss.biasTarget);
    return {
      ...boss,
      position: arrived,
      patrolRoute: [arrived, next],
      currentTarget: 1,
      lastPoint: boss.position,
      lastAxis,
      // consume bias once applied so we decide each segment independently
      biasTarget: null,
    };
  }

  return { ...boss, position: { x: nextX, y: nextY } };
}

export function isPlayerDetected(player: Player, boss: Boss, gameMode: GameMode): boolean {
  // Only detectable when sitting AND gaming - walking around is always safe
  if (gameMode !== 'gaming' || !player.isSitting) return false;
  const distance = Math.hypot(player.position.x - boss.position.x, player.position.y - boss.position.y);
  return distance <= boss.detectionRadius;
}

// Phase 2.2: probability-based boss selection and spawn delay helpers
export function selectRandomBossType(exclude?: typeof BossType[keyof typeof BossType]): typeof BossType[keyof typeof BossType] {
  const random = Math.random();
  const configs = Object.values(BOSS_CONFIGS).filter((c) => (exclude ? c.type !== exclude : true));
  const totalProb = configs.reduce((sum, cfg) => sum + cfg.spawnProbability, 0);
  if (configs.length === 0 || totalProb === 0) {
    return BossType.MANAGER;
  }
  let cumulative = 0;
  for (const cfg of configs) {
    cumulative += cfg.spawnProbability / totalProb;
    if (random <= cumulative) return cfg.type;
  }
  return configs[configs.length - 1].type;
}

export function getRandomSpawnDelay(bossType: typeof BossType[keyof typeof BossType]): number {
  const cfg = BOSS_CONFIGS[bossType];
  const [min, max] = cfg.spawnDelayMs;
  return Math.random() * (max - min) + min;
}

export function getRandomDespawnDuration(bossType: typeof BossType[keyof typeof BossType]): number {
  // Simple heuristic: longer-lived for rarer bosses
  const base = 12000; // 12s baseline
  const rarityBonus =
    bossType === BossType.CEO ? 14000 :
    bossType === BossType.VP ? 10000 :
    bossType === BossType.DIRECTOR ? 6000 : 3000;
  const jitter = Math.random() * 4000 - 2000; // ±2s
  return Math.max(6000, base + rarityBonus + jitter);
}


