import type { Boss, Desk, Player, Position } from './types.ts';
import { PLAYER_SIZE } from './constants.ts';

export function checkCollision(nextPos: Position, desks: Desk[]): boolean {
  const playerRect = { x: nextPos.x, y: nextPos.y, w: PLAYER_SIZE, h: PLAYER_SIZE };

  return desks.some((desk) => {
    const { x, y, width, height } = desk.bounds;
    return (
      playerRect.x < x + width &&
      playerRect.x + playerRect.w > x &&
      playerRect.y < y + height &&
      playerRect.y + playerRect.h > y
    );
  });
}

// Generic size-aware collision for non-player entities that are drawn from center coordinates
export function checkEntityCollision(nextCenter: Position, size: number, desks: Desk[]): boolean {
  const half = size / 2;
  const rect = { x: nextCenter.x - half, y: nextCenter.y - half, w: size, h: size };

  return desks.some((desk) => {
    const { x, y, width, height } = desk.bounds;
    return (
      rect.x < x + width &&
      rect.x + rect.w > x &&
      rect.y < y + height &&
      rect.y + rect.h > y
    );
  });
}

// Phase 2.3: Line-of-sight check using ray vs desk rectangles
export function hasLineOfSight(boss: Boss, player: Player, desks: Desk[]): boolean {
  const a = { x: boss.position.x, y: boss.position.y };
  const b = { x: player.position.x + PLAYER_SIZE / 2, y: player.position.y + PLAYER_SIZE / 2 };

  // If the line from boss to player intersects any desk rectangle, LOS is blocked
  for (const desk of desks) {
    const { x, y, width, height } = desk.bounds;
    const r1 = { x, y } as Position;
    const r2 = { x: x + width, y } as Position;
    const r3 = { x: x + width, y: y + height } as Position;
    const r4 = { x, y: y + height } as Position;
    if (
      segmentsIntersect(a, b, r1, r2) ||
      segmentsIntersect(a, b, r2, r3) ||
      segmentsIntersect(a, b, r3, r4) ||
      segmentsIntersect(a, b, r4, r1)
    ) {
      return false;
    }
  }
  return true;
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  return ccw(a.x, a.y, c.x, c.y, d.x, d.y) !== ccw(b.x, b.y, c.x, c.y, d.x, d.y) &&
    ccw(a.x, a.y, b.x, b.y, c.x, c.y) !== ccw(a.x, a.y, b.x, b.y, d.x, d.y);
}


