import { useEffect, useRef } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants.ts';
import { calculateDynamicMultiplier, createInitialState, drawFrame, updateGameState } from '../game/GameEngine.ts';
import type { Boss, BossWarning, Desk, GameState, Player } from '../game/types.ts';
import { hasLineOfSight } from '../game/collision.ts';
import { BOSS_CONFIGS, WARNING_CONFIG } from '../game/constants.ts';
import { BossType } from '../game/types.ts';

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

      // Enhanced score + multiplier overlay
      drawScoreAndMultiplier(
        ctx,
        Math.round(stateRef.current.score),
        stateRef.current.suspicion ?? 0,
        boss ?? null,
        stateRef.current.player,
        stateRef.current.desks,
      );

      // Enhanced warning overlay
      if (!stateRef.current.isGameOver) {
        drawBossWarning(
          ctx,
          (stateRef.current as any).bossWarning as BossWarning | null,
          CANVAS_WIDTH,
        );
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

function drawBossWarning(
  ctx: CanvasRenderingContext2D,
  warning: BossWarning | null,
  canvasWidth: number,
) {
  if (!warning || !warning.isActive) return;
  const centerX = canvasWidth / 2;
  const warningY = 50; // moved 20px higher again per request

  const timePercent = warning.remainingMs / warning.totalWarningMs;
  let warningColor: string;
  let warningText: string;
  if (timePercent > 0.66) {
    warningColor = WARNING_CONFIG.colors.low;
    warningText = 'Boss Approaching';
  } else if (timePercent > 0.33) {
    warningColor = WARNING_CONFIG.colors.medium;
    warningText = 'Boss Incoming!';
  } else {
    warningColor = WARNING_CONFIG.colors.high;
    warningText = 'BOSS ALERT!';
  }

  const pulseAlpha = timePercent < 0.33 ? 0.7 + 0.3 * Math.sin(Date.now() / WARNING_CONFIG.pulseIntervalMs * Math.PI) : 0.9;
  const boxWidth = 300;
  const boxHeight = 90; // slightly taller to ensure all text fits inside
  const boxTopY = warningY - 30; // previously was warningY - 20; lift by 10px
  ctx.fillStyle = `rgba(0, 0, 0, ${pulseAlpha * 0.8})`;
  ctx.fillRect(centerX - boxWidth / 2, boxTopY, boxWidth, boxHeight);
  ctx.strokeStyle = warningColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(centerX - boxWidth / 2, boxTopY, boxWidth, boxHeight);

  // Text positions inside box with padding
  const padY = 10;
  const contentY = boxTopY + padY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = warningColor;
  ctx.font = 'bold 18px monospace';
  ctx.fillText(warningText, centerX, contentY);

  const bossTypeName = String(warning.bossType).toUpperCase();
  const countdown = Math.ceil(warning.remainingMs / 1000);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`${bossTypeName} in ${countdown}s`, centerX, contentY + 22);

  const config = BOSS_CONFIGS[warning.bossType as keyof typeof BOSS_CONFIGS];
  let threatLevel = 'LOW RISK';
  let threatColor = '#00FF00';
  if (config.basePointsPerSecond >= 200) {
    threatLevel = 'EXTREME RISK';
    threatColor = '#FF0000';
  } else if (config.basePointsPerSecond >= 100) {
    threatLevel = 'HIGH RISK';
    threatColor = '#FF8C00';
  } else if (config.basePointsPerSecond >= 60) {
    threatLevel = 'MEDIUM RISK';
    threatColor = '#FFFF00';
  }
  ctx.font = '12px monospace';
  ctx.fillStyle = threatColor;
  ctx.fillText(`Threat: ${threatLevel}`, centerX, contentY + 42);

  let strategicTip = '🎮 Switch to work mode to stay safe';
  switch (warning.bossType as BossType) {
    case BossType.MANAGER:
      strategicTip = '💡 Good opportunity for safe gaming';
      break;
    case BossType.DIRECTOR:
      strategicTip = '⚠️ Moderate risk, decent rewards';
      break;
    case BossType.VP:
      strategicTip = '🔥 High risk, high reward chance';
      break;
    case BossType.CEO:
      strategicTip = '💀 Extreme danger - consider working';
      break;
    default:
      strategicTip = '🎮 Switch to work mode to stay safe';
  }
  ctx.font = '11px monospace';
  ctx.fillStyle = '#CCCCCC';
  ctx.fillText(strategicTip, centerX, contentY + 60);
}

function drawScoreAndMultiplier(
  ctx: CanvasRenderingContext2D,
  score: number,
  suspicion: number,
  boss: Boss | null,
  player: Player,
  desks: Desk[],
) {
  // Align with state label drawn in drawFrame (x=12, y=12, font=20px)
  const labelX = 12;
  const labelY = 12;
  const labelFontPx = 20;
  const startY = labelY + labelFontPx + 5; // 5px below the WORKING/GAMING text

  // Score
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '20px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${score}`, labelX, startY);

  if (boss) {
    const data = calculateDynamicMultiplier(suspicion, boss, player, 'gaming', desks);
    // Total multiplier
    ctx.font = '16px monospace';
    const color = data.totalMultiplier > 5 ? '#FF0000' : data.totalMultiplier > 2 ? '#FFD700' : '#FFFFFF';
    ctx.fillStyle = color;
    ctx.fillText(`${data.totalMultiplier.toFixed(1)}x ${data.riskLevel}`, labelX, startY + 25);
    // Breakdown
    ctx.font = '12px monospace';
    ctx.fillStyle = '#CCCCCC';
    ctx.fillText(`Base: ${data.baseMultiplier}x | Risk: ${data.riskMultiplier}x`, labelX, startY + 45);
    // Expected pts/sec
    const expectedPerSec = Math.round(boss.basePointsPerSecond * data.totalMultiplier);
    ctx.fillText(`${expectedPerSec} pts/sec`, labelX, startY + 60);
  }
}


