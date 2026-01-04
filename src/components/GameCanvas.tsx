import { useEffect, useRef } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH, QUESTION_CHOICES } from '../game/constants.ts';
import { calculateDynamicMultiplier, createInitialState, drawFrame, updateGameState } from '../game/GameEngine.ts';
import type { Boss, BossWarning, Desk, GameState, Player } from '../game/types.ts';
import { hasLineOfSight } from '../game/collision.ts';
import { WARNING_CONFIG } from '../game/constants.ts';

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

      // Enhanced warning overlay (boss pre-spawn)
      if (!stateRef.current.isGameOver) {
        drawBossWarning(
          ctx,
          (stateRef.current as any).bossWarning as BossWarning | null,
          CANVAS_WIDTH,
        );
        // Draw coworker overlay warnings (helpful + snitch + gossip countdown)
        drawCoworkerWarnings(ctx, stateRef.current as GameState);
        // Phase 3.5: question modal overlay
        drawWorkQuestion(ctx, stateRef.current as GameState);
      }

      // Mouse input for question choices
      canvas.onclick = (ev: MouseEvent) => {
        const q = (stateRef.current as any).activeQuestion as GameState['activeQuestion'];
        if (!q || !q.isActive) return;
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        // Define two invisible hit zones near top center for Help/Ignore
        const helpZone = { x: CANVAS_WIDTH / 2 - 160, y: 30, w: 120, h: 40 };
        const ignoreZone = { x: CANVAS_WIDTH / 2 + 40, y: 30, w: 120, h: 40 };
        const inRect = (x: number, y: number, w: number, h: number) => mx >= x && mx <= x + w && my >= y && my <= y + h;
        if (inRect(helpZone.x, helpZone.y, helpZone.w, helpZone.h)) {
          // Answer choice
          (stateRef.current as any).score = Math.max(0, (stateRef.current as any).score + QUESTION_CHOICES.answer.scoreChange);
          (stateRef.current as any).questionLockUntilMs = performance.now() + QUESTION_CHOICES.answer.lockDurationMs;
          // Phase 3.6: Apply concentration penalty for answering and track loss
          const currentConc = (stateRef.current as any).concentration?.current ?? 100;
          const penalty = 15; // CONCENTRATION_CONFIG.interruptionPenalties.questionAnswer
          const recentLosses = (stateRef.current as any).concentration?.recentLosses ?? [];
          (stateRef.current as any).concentration = {
            ...(stateRef.current as any).concentration,
            current: Math.max(0, currentConc - penalty),
            recentLosses: [...recentLosses, { amount: penalty, timestampMs: performance.now() }]
          };
          // Flash "Helping..." for the lock duration
          const cw = ((stateRef.current as any).coworkerWarnings ?? []) as any[];
          (stateRef.current as any).coworkerWarnings = [
            ...cw,
            {
              coworkerId: q.coworkerId,
              type: 'gossip_warning',
              message: 'Helping...',
              position: { x: CANVAS_WIDTH / 2, y: 50 },
              remainingMs: QUESTION_CHOICES.answer.lockDurationMs,
              scoreReduction: 0,
            },
          ];
          (stateRef.current as any).activeQuestion = null;
        } else if (inRect(ignoreZone.x, ignoreZone.y, ignoreZone.w, ignoreZone.h)) {
          // Ignore choice
          (stateRef.current as any).score = Math.max(0, (stateRef.current as any).score + QUESTION_CHOICES.ignore.scoreChange);
          // Phase 3.6: Apply concentration penalty for ignoring and track loss
          const currentConc = (stateRef.current as any).concentration?.current ?? 100;
          const penalty = 10; // CONCENTRATION_CONFIG.interruptionPenalties.questionIgnore
          const recentLosses = (stateRef.current as any).concentration?.recentLosses ?? [];
          (stateRef.current as any).concentration = {
            ...(stateRef.current as any).concentration,
            current: Math.max(0, currentConc - penalty),
            recentLosses: [...recentLosses, { amount: penalty, timestampMs: performance.now() }]
          };
          (stateRef.current as any).activeQuestion = null;
        }
      };

      // Keyboard shortcuts: H for help, I for ignore
      window.onkeydown = (e: KeyboardEvent) => {
        const q = (stateRef.current as any).activeQuestion as GameState['activeQuestion'];
        if (!q || !q.isActive) return;
        if (e.key.toLowerCase() === 'h') {
          (stateRef.current as any).score = Math.max(0, (stateRef.current as any).score + QUESTION_CHOICES.answer.scoreChange);
          (stateRef.current as any).questionLockUntilMs = performance.now() + QUESTION_CHOICES.answer.lockDurationMs;
          // Phase 3.6: Apply concentration penalty for answering and track loss
          const currentConc = (stateRef.current as any).concentration?.current ?? 100;
          const penalty = 15; // CONCENTRATION_CONFIG.interruptionPenalties.questionAnswer
          const recentLosses = (stateRef.current as any).concentration?.recentLosses ?? [];
          (stateRef.current as any).concentration = {
            ...(stateRef.current as any).concentration,
            current: Math.max(0, currentConc - penalty),
            recentLosses: [...recentLosses, { amount: penalty, timestampMs: performance.now() }]
          };
          // Flash "Helping..." for the lock duration
          const cw = ((stateRef.current as any).coworkerWarnings ?? []) as any[];
          (stateRef.current as any).coworkerWarnings = [
            ...cw,
            {
              coworkerId: q.coworkerId,
              type: 'gossip_warning',
              message: 'Helping...',
              position: { x: CANVAS_WIDTH / 2, y: 50 },
              remainingMs: QUESTION_CHOICES.answer.lockDurationMs,
              scoreReduction: 0,
            },
          ];
          (stateRef.current as any).activeQuestion = null;
        }
        if (e.key.toLowerCase() === 'i') {
          (stateRef.current as any).score = Math.max(0, (stateRef.current as any).score + QUESTION_CHOICES.ignore.scoreChange);
          // Phase 3.6: Apply concentration penalty for ignoring and track loss
          const currentConc = (stateRef.current as any).concentration?.current ?? 100;
          const penalty = 10; // CONCENTRATION_CONFIG.interruptionPenalties.questionIgnore
          const recentLosses = (stateRef.current as any).concentration?.recentLosses ?? [];
          (stateRef.current as any).concentration = {
            ...(stateRef.current as any).concentration,
            current: Math.max(0, currentConc - penalty),
            recentLosses: [...recentLosses, { amount: penalty, timestampMs: performance.now() }]
          };
          (stateRef.current as any).activeQuestion = null;
        }
      };

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
function drawCoworkerWarnings(ctx: CanvasRenderingContext2D, state: GameState) {
  const warnings = (state.coworkerWarnings ?? []);
  for (const w of warnings) {
    if (w.type === 'boss_warning') continue; // handled in engine draw
    if (w.type === 'snitch_warning' || w.type === 'gossip_warning') {
      ctx.save();
      const denom = w.type === 'snitch_warning' ? 1000 : 5000;
      ctx.globalAlpha = Math.max(0.3, Math.min(1, w.remainingMs / denom));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = w.type === 'gossip_warning' ? '#FF69B4' : '#FFD700';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(w.message, w.position.x, w.position.y);
      ctx.restore();
    }
  }
}

function drawWorkQuestion(ctx: CanvasRenderingContext2D, state: GameState) {
  const q = (state as any).activeQuestion as GameState['activeQuestion'];
  if (!q || !q.isActive) return;
  // Sleek top-of-screen text overlay (no box)
  const centerX = CANVAS_WIDTH / 2;
  const y = 50;
  const pulseAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 500 * Math.PI);
  ctx.save();
  ctx.globalAlpha = Math.max(0.4, Math.min(1, pulseAlpha));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('Coworker needs help — H: help, I: ignore', centerX, y);
  ctx.restore();
}

function drawBossWarning(
  ctx: CanvasRenderingContext2D,
  warning: BossWarning | null,
  canvasWidth: number,
) {
  if (!warning || !warning.isActive) return;
  const centerX = canvasWidth / 2;
  const warningY = 50; // moved 20px higher again per request

  // Simplified 1-second minimal warning: text only, no box
  const pulseAlpha = 0.7 + 0.3 * Math.sin(Date.now() / WARNING_CONFIG.pulseIntervalMs * Math.PI);
  ctx.save();
  ctx.globalAlpha = Math.max(0.4, Math.min(1, pulseAlpha));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = WARNING_CONFIG.colors.medium;
  ctx.font = 'bold 18px monospace';
  ctx.fillText('Boss Incoming!', centerX, warningY);
  ctx.restore();
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


