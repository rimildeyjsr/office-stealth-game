import { BOSS_DETECTION_RADIUS, BOSS_SPEED, CANVAS_HEIGHT, CANVAS_WIDTH } from './constants.ts';
import type { Boss, Desk, GameMode, Player, Position } from './types.ts';

type PatrolMeta = { vLines: number[]; hLines: number[]; lastPoint?: Position; lastAxis?: 'h' | 'v' };

export function createBoss(desks: Desk[]): Boss & PatrolMeta {
  const { vLines, hLines } = computeWalkwayLines(desks);
  const start: Position = {
    x: vLines[Math.floor(Math.random() * vLines.length)],
    y: hLines[Math.floor(Math.random() * hLines.length)],
  };
  const next = pickNextTarget(start, vLines, hLines);
  const boss: Boss & PatrolMeta = {
    id: 'boss-1',
    position: { x: start.x, y: start.y },
    speed: BOSS_SPEED,
    patrolRoute: [start, next],
    currentTarget: 1,
    detectionRadius: BOSS_DETECTION_RADIUS,
    vLines,
    hLines,
    lastPoint: start,
  };
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

function pickNextTarget(from: Position, vLines: number[], hLines: number[], avoid?: Position): Position {
  const chooseAxis = Math.random() < 0.5 ? 'h' : 'v';
  if (chooseAxis === 'h') {
    // move horizontally: keep y; pick different x
    const candidates = vLines.filter((x) => x !== from.x).map((x) => ({ x, y: from.y }));
    const filtered = avoid ? candidates.filter((p) => p.x !== avoid.x || p.y !== avoid.y) : candidates;
    return filtered[Math.floor(Math.random() * filtered.length)] || candidates[0];
  }
  // move vertically: keep x; pick different y
  const candidates = hLines.filter((y) => y !== from.y).map((y) => ({ x: from.x, y }));
  const filtered = avoid ? candidates.filter((p) => p.x !== avoid.x || p.y !== avoid.y) : candidates;
  return filtered[Math.floor(Math.random() * filtered.length)] || candidates[0];
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
    const next = pickNextTarget(arrived, boss.vLines, boss.hLines, boss.lastPoint);
    return {
      ...boss,
      position: arrived,
      patrolRoute: [arrived, next],
      currentTarget: 1,
      lastPoint: boss.position,
    };
  }

  return { ...boss, position: { x: nextX, y: nextY } };
}

export function isPlayerDetected(player: Player, boss: Boss, gameMode: GameMode): boolean {
  if (gameMode !== 'gaming') return false;
  const distance = Math.hypot(player.position.x - boss.position.x, player.position.y - boss.position.y);
  return distance <= boss.detectionRadius;
}


