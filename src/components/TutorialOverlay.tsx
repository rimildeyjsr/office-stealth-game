import React, { useEffect, useState } from 'react';
import type { GameState } from '../game/types.ts';

interface TutorialOverlayProps {
  gameState: GameState;
  onSkip: () => void;
}

type TutorialStep = 'movement' | 'sit' | 'switch' | 'avoid' | null;

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ gameState, onSkip }) => {
  const [currentStep, setCurrentStep] = useState<TutorialStep>('movement');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Only show tutorial in Phase 1
  if (gameState.phaseState.currentPhase !== 1) {
    return null;
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  // Determine which tutorial step to show based on game state
  const hasMoved = gameState.player.position.x !== gameState.desks.find((d) => d.isPlayerDesk)?.bounds.x;
  const isSitting = gameState.player.isSitting ?? false;
  const hasGameMode = gameState.gameMode === 'gaming';
  const hasBoss = gameState.bosses.length > 0;

  // Progress through tutorial steps automatically
  useEffect(() => {
    if (!dismissed.has('movement') && hasMoved) {
      setDismissed((prev) => new Set([...prev, 'movement']));
      setCurrentStep('sit');
    }
    if (!dismissed.has('sit') && isSitting) {
      setDismissed((prev) => new Set([...prev, 'sit']));
      setCurrentStep('switch');
    }
    if (!dismissed.has('switch') && hasGameMode) {
      setDismissed((prev) => new Set([...prev, 'switch']));
      setCurrentStep('avoid');
    }
    if (!dismissed.has('avoid') && hasBoss) {
      setDismissed((prev) => new Set([...prev, 'avoid']));
      setCurrentStep(null);
    }
  }, [hasMoved, isSitting, hasGameMode, hasBoss, dismissed]);

  // Don't show if all steps are completed
  if (currentStep === null || dismissed.size >= 4) {
    return null;
  }

  const hints: Record<Exclude<TutorialStep, null>, { title: string; text: string; keys: string }> = {
    movement: {
      title: 'Welcome to Your First Day!',
      text: 'Use WASD keys to move around the office',
      keys: 'W A S D',
    },
    sit: {
      title: 'Find Your Desk',
      text: 'Press E when near your desk (darker color) to sit down',
      keys: 'E',
    },
    switch: {
      title: 'Time to Work... or Play?',
      text: 'Press SPACE to switch between work and gaming mode',
      keys: 'SPACE',
    },
    avoid: {
      title: 'Watch Out for Your Boss!',
      text: 'The orange figure is your manager. Switch to work mode when they\'re nearby!',
      keys: 'SPACE',
    },
  };

  const hint = hints[currentStep];

  return (
    <>
      {/* Semi-transparent overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
          pointerEvents: 'none',
        }}
      />

      {/* Tutorial hint box */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#1F2937',
          padding: '24px 32px',
          borderRadius: '12px',
          border: '3px solid #3B82F6',
          boxShadow: '0 0 30px rgba(59, 130, 246, 0.6)',
          zIndex: 1000,
          maxWidth: '400px',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#60A5FA',
            marginBottom: '12px',
          }}
        >
          {hint.title}
        </h2>

        <p
          style={{
            fontSize: '16px',
            color: '#D1D5DB',
            marginBottom: '16px',
            lineHeight: '1.5',
          }}
        >
          {hint.text}
        </p>

        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#374151',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#FCD34D',
            fontFamily: 'monospace',
            marginBottom: '16px',
          }}
        >
          {hint.keys}
        </div>

        <div
          style={{
            fontSize: '12px',
            color: '#9CA3AF',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid #374151',
          }}
        >
          Press ESC to skip tutorial
        </div>
      </div>
    </>
  );
};
