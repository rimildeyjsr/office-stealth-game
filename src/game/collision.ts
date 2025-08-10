import type { Desk, Position } from './types.ts';
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


