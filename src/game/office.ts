import { CANVAS_HEIGHT, CANVAS_WIDTH, DESK_COLS, DESK_HEIGHT, DESK_ROWS, DESK_WIDTH, WALKWAY_X, WALKWAY_Y } from './constants.ts';
import type { CoffeeArea, Desk, Position } from './types.ts';

export function createOfficeLayout(): Desk[] {
  // Center a 2x3 grid of desks with walkways
  const totalWidth = DESK_COLS * DESK_WIDTH + (DESK_COLS - 1) * WALKWAY_X;
  const totalHeight = DESK_ROWS * DESK_HEIGHT + (DESK_ROWS - 1) * WALKWAY_Y;
  const startX = Math.floor((CANVAS_WIDTH - totalWidth) / 2);
  const startY = Math.floor((CANVAS_HEIGHT - totalHeight) / 2);

  const desks: Desk[] = [];
  for (let row = 0; row < DESK_ROWS; row += 1) {
    for (let col = 0; col < DESK_COLS; col += 1) {
      const x = startX + col * (DESK_WIDTH + WALKWAY_X);
      const y = startY + row * (DESK_HEIGHT + WALKWAY_Y);
      const id = `desk-${row}-${col}`;
      desks.push({
        id,
        bounds: { x, y, width: DESK_WIDTH, height: DESK_HEIGHT },
        isPlayerDesk: row === 0 && col === 0, // player's desk is top-left of centered grid
      });
    }
  }
  return desks;
}

// Seat anchor: a point directly below the player's desk, centered horizontally
export function getPlayerSeatAnchor(playerDesk: Desk): Position {
  const { x, y, width, height } = playerDesk.bounds;
  return {
    x: Math.round(x + width / 2 - 10), // center minus half player size
    y: Math.round(y + height + 2), // just below desk
  };
}

export function isNearSeatAnchor(playerPos: Position, anchor: Position, threshold = 12): boolean {
  const dx = playerPos.x - anchor.x;
  const dy = playerPos.y - anchor.y;
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

// Phase 3.6: Coffee break areas for concentration restoration
export const COFFEE_AREAS: CoffeeArea[] = [
  { x: 40, y: CANVAS_HEIGHT - 100, width: 80, height: 50, label: 'Coffee', restoration: 20, cooldownMs: 5000 },
  { x: CANVAS_WIDTH - 120, y: CANVAS_HEIGHT - 100, width: 80, height: 50, label: 'Break Room', restoration: 40, cooldownMs: 15000 },
];

export function isNearCoffeeArea(playerPos: Position): CoffeeArea | null {
  for (const area of COFFEE_AREAS) {
    const inArea = playerPos.x >= area.x - 20 &&
                   playerPos.x <= area.x + area.width + 20 &&
                   playerPos.y >= area.y - 20 &&
                   playerPos.y <= area.y + area.height + 20;
    if (inArea) return area;
  }
  return null;
}


