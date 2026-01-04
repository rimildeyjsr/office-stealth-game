import React from 'react';
import { PHASES } from '../game/constants.ts';
import type { PhaseState } from '../game/types.ts';

interface PhaseTransitionProps {
  phaseState: PhaseState;
  onContinue: () => void;
  isStartOfPhase?: boolean; // true when starting a phase, false when transitioning to next
}

export const PhaseTransition: React.FC<PhaseTransitionProps> = ({ phaseState, onContinue, isStartOfPhase = false }) => {
  // Get the current phase
  const currentPhase = PHASES[phaseState.currentPhase - 1];

  // Get the previous phase (if transitioning from one phase to another)
  const completedPhaseNumber = phaseState.currentPhase - 1;
  const completedPhase = completedPhaseNumber > 0 ? PHASES[completedPhaseNumber - 1] : null;

  if (!currentPhase) {
    return null;
  }

  // If this is the start of Phase 1, show welcome screen
  if (phaseState.currentPhase === 1 && isStartOfPhase) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            backgroundColor: '#1F2937',
            padding: '40px',
            borderRadius: '12px',
            maxWidth: '600px',
            textAlign: 'center',
            border: '3px solid #60A5FA',
            boxShadow: '0 0 30px rgba(96, 165, 250, 0.5)',
          }}
        >
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#60A5FA',
              marginBottom: '24px',
            }}
          >
            {currentPhase.name}
          </h1>

          <p
            style={{
              fontSize: '16px',
              color: '#9CA3AF',
              marginBottom: '20px',
              lineHeight: '1.6',
            }}
          >
            Welcome to your first day! Learn the basics:
          </p>

          <div
            style={{
              backgroundColor: '#374151',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'left',
            }}
          >
            <p style={{ fontSize: '14px', color: '#D1D5DB', marginBottom: '8px' }}>
              <strong>Controls:</strong>
            </p>
            <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '4px' }}>
              • WASD to move, E to sit at your desk
            </p>
            <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '4px' }}>
              • SPACE to switch between Work/Gaming
            </p>
            <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '12px' }}>
              • Gaming earns points but is risky!
            </p>
            <p style={{ fontSize: '14px', color: '#FCD34D', fontWeight: '500' }}>
              {currentPhase.unlockMessage}
            </p>
          </div>

          <div
            style={{
              borderTop: '2px solid #374151',
              padding: '20px 0',
              margin: '20px 0',
            }}
          >
            <p
              style={{
                fontSize: '18px',
                color: '#D1D5DB',
                fontWeight: '500',
              }}
            >
              Goal: {currentPhase.goal} points
            </p>
          </div>

          <button
            onClick={onContinue}
            style={{
              backgroundColor: '#60A5FA',
              color: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
              padding: '12px 32px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              marginTop: '20px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3B82F6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#60A5FA';
            }}
          >
            Press SPACE to Start
          </button>
        </div>
      </div>
    );
  }

  // Show transition screen when advancing to a new phase
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#1F2937',
          padding: '40px',
          borderRadius: '12px',
          maxWidth: '600px',
          textAlign: 'center',
          border: '3px solid #10B981',
          boxShadow: '0 0 30px rgba(16, 185, 129, 0.5)',
        }}
      >
        {completedPhase && (
          <>
            <h1
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#10B981',
                marginBottom: '16px',
              }}
            >
              Phase {completedPhaseNumber} Complete!
            </h1>

            <div
              style={{
                fontSize: '18px',
                color: '#D1D5DB',
                marginBottom: '24px',
              }}
            >
              <p style={{ marginBottom: '8px' }}>
                <strong>Phase Score:</strong> {Math.round(phaseState.phaseScore)} pts
              </p>
              <p>
                <strong>Total Score:</strong> {Math.round(phaseState.totalScore)} pts
              </p>
            </div>
          </>
        )}

        <div
          style={{
            borderTop: '2px solid #374151',
            borderBottom: '2px solid #374151',
            padding: '20px 0',
            margin: '20px 0',
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
            {currentPhase.name}
          </h2>
          <p
            style={{
              fontSize: '16px',
              color: '#9CA3AF',
              marginBottom: '16px',
            }}
          >
            Goal: {currentPhase.goal === Infinity ? 'Survive!' : `${currentPhase.goal} points`}
          </p>
          {currentPhase.unlockMessage && (
            <div
              style={{
                backgroundColor: '#374151',
                padding: '16px',
                borderRadius: '8px',
                textAlign: 'left',
                marginTop: '16px',
              }}
            >
              <p style={{ fontSize: '14px', color: '#10B981', fontWeight: 'bold', marginBottom: '8px' }}>
                NEW MECHANICS:
              </p>
              {currentPhase.unlockMessage.split('\n\n').map((section, idx) => (
                <p
                  key={idx}
                  style={{
                    fontSize: '14px',
                    color: '#D1D5DB',
                    marginBottom: idx < currentPhase.unlockMessage.split('\n\n').length - 1 ? '12px' : '0',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {section}
                </p>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onContinue}
          style={{
            backgroundColor: '#10B981',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold',
            padding: '12px 32px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            marginTop: '20px',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#10B981';
          }}
        >
          Press SPACE to Continue
        </button>
      </div>
    </div>
  );
};
