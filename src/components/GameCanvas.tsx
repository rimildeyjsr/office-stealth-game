import { useEffect, useRef } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants.ts';
import { createInitialState, drawFrame, updateGameState } from '../game/GameEngine.ts';
import type { GameState } from '../game/types.ts';

type Key = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD';

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createInitialState());

  // Input tracking
  const inputRef = useRef({ up: false, down: false, left: false, right: false });

  // FPS debug
  const frameCountRef = useRef(0);
  const lastLogRef = useRef<number>(performance.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code as Key | string;
      if (code === 'KeyW') inputRef.current.up = true;
      if (code === 'KeyS') inputRef.current.down = true;
      if (code === 'KeyA') inputRef.current.left = true;
      if (code === 'KeyD') inputRef.current.right = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code as Key | string;
      if (code === 'KeyW') inputRef.current.up = false;
      if (code === 'KeyS') inputRef.current.down = false;
      if (code === 'KeyA') inputRef.current.left = false;
      if (code === 'KeyD') inputRef.current.right = false;
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
      stateRef.current = updateGameState(stateRef.current, inputRef.current);
      drawFrame(ctx, stateRef.current);

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


