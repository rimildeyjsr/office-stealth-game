import { useEffect, useRef } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants.ts';
import { createInitialState, drawFrame, updateGameState } from '../game/GameEngine.ts';
import type { Boss, Desk, GameState, Player } from '../game/types.ts';
import { hasLineOfSight } from '../game/collision.ts';

type Key = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'KeyE' | 'Space' | 'KeyR';

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createInitialState());

  // Input tracking
  const inputRef = useRef({ up: false, down: false, left: false, right: false, interact: false as boolean | undefined, toggleMode: false as boolean | undefined });
  const togglePrevRef = useRef(false);

  // FPS debug
  const frameCountRef = useRef(0);
  const lastLogRef = useRef<number>(performance.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code as Key | string;
      const isSpace = code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (code === 'KeyW') inputRef.current.up = true;
      if (code === 'KeyS') inputRef.current.down = true;
      if (code === 'KeyA') inputRef.current.left = true;
      if (code === 'KeyD') inputRef.current.right = true;
      if (code === 'KeyE') inputRef.current.interact = true;
      if (isSpace) {
        inputRef.current.toggleMode = true;
        e.preventDefault();
      }
      if (code === 'KeyR') {
        // simple hard reset: reload stateRef and clear inputs
        stateRef.current = createInitialState();
        inputRef.current = { up: false, down: false, left: false, right: false, interact: false, toggleMode: false } as any;
        togglePrevRef.current = false;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code as Key | string;
      const isSpace = code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (code === 'KeyW') inputRef.current.up = false;
      if (code === 'KeyS') inputRef.current.down = false;
      if (code === 'KeyA') inputRef.current.left = false;
      if (code === 'KeyD') inputRef.current.right = false;
      if (code === 'KeyE') inputRef.current.interact = false;
      if (isSpace) inputRef.current.toggleMode = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      const prevMode = stateRef.current.gameMode;
      // Edge-detect Space: only consider rising edge as a toggle
      const toggleNow = !!inputRef.current.toggleMode;
      const togglePrev = togglePrevRef.current;
      const risingEdge = toggleNow && !togglePrev;
      togglePrevRef.current = toggleNow;
      const input = { ...inputRef.current, toggleMode: risingEdge } as typeof inputRef.current;
      stateRef.current = updateGameState(stateRef.current, input);
      if (stateRef.current.gameMode !== prevMode) {
        stateRef.current.modeOverlayStartMs = performance.now();
      }
      // Draw base frame
      drawFrame(ctx, stateRef.current);
      // Optional: LOS visualization
      const boss = stateRef.current.bosses[0] as Boss | undefined;
      if (boss && !stateRef.current.isGameOver) {
        drawLineOfSight(ctx, boss, stateRef.current.player, stateRef.current.desks);
      }

      // FPS meter: log once per second
      frameCountRef.current += 1;
      const now = performance.now();
      if (now - lastLogRef.current >= 1000) {
        // eslint-disable-next-line no-console
        console.log(`Frames last second: ${frameCountRef.current}`);
        frameCountRef.current = 0;
        lastLogRef.current = now;
      }

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gray-900">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="bg-gray-800 rounded shadow-lg" />
    </div>
  );
};

export default GameCanvas;

function drawLineOfSight(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  player: Player,
  desks: Desk[],
) {
  if (hasLineOfSight(boss, player, desks)) {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boss.position.x, boss.position.y);
    ctx.lineTo(player.position.x + 10, player.position.y + 10);
    ctx.stroke();
  }
}


