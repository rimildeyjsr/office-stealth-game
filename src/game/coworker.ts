import { CANVAS_HEIGHT, CANVAS_WIDTH, COWORKER_CONFIGS, COWORKER_SYSTEM } from './constants.ts';
import type { Coworker, CoworkerConfig, Desk, Position } from './types.ts';

type Rect = { x: number; y: number; width: number; height: number };

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

function pickNextTarget(from: Position, vLines: number[], hLines: number[], obstacles: Rect[]): Position {
  const candidates: Position[] = [];
  for (const x of vLines) {
    for (const y of hLines) {
      if (x === from.x && y === from.y) continue;
      const p = { x, y };
      if (!segmentIntersectsAny(from, p, obstacles)) candidates.push(p);
    }
  }
  if (candidates.length === 0) return from;
  // Prefer nearer points for smoother motion
  const sorted = candidates.map((p) => ({ p, d: Math.hypot(p.x - from.x, p.y - from.y) }))
    .sort((a, b) => a.d - b.d);
  const top = sorted.slice(0, Math.min(3, sorted.length));
  return top[Math.floor(Math.random() * top.length)].p;
}

export function createCoworkerFromConfig(config: CoworkerConfig, desks: Desk[]): Coworker {
  const { vLines, hLines } = computeWalkwayLines(desks);
  const obstacles: Rect[] = desks.map((d) => d.bounds);
  const start: Position = {
    x: vLines[Math.floor(Math.random() * vLines.length)],
    y: hLines[Math.floor(Math.random() * hLines.length)],
  };
  const next = pickNextTarget(start, vLines, hLines, obstacles);
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
  const target = coworker.patrolRoute[coworker.currentTarget];
  const dx = target.x - coworker.position.x;
  const dy = target.y - coworker.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  const stepX = (dx / dist) * coworker.speed;
  const stepY = (dy / dist) * coworker.speed;
  const nextX = coworker.position.x + stepX;
  const nextY = coworker.position.y + stepY;

  // Bounds clamp for safety
  const clampedX = Math.max(0, Math.min(CANVAS_WIDTH, nextX));
  const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT, nextY));

  // If close enough, pick next waypoint
  if (Math.hypot(target.x - clampedX, target.y - clampedY) <= coworker.speed) {
    const { vLines, hLines } = computeWalkwayLines(desks);
    const obstacles: Rect[] = desks.map((d) => d.bounds);
    const arrived: Position = { x: target.x, y: target.y };
    const next = pickNextTarget(arrived, vLines, hLines, obstacles);
    return {
      ...coworker,
      position: arrived,
      patrolRoute: [arrived, next],
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


