import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { HostMessage } from '../../messages'

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscode = acquireVsCodeApi()

// ── Types ──────────────────────────────────────────────────────────────

interface StepInfo {
  number: number
  title: string
  description: string
  guidance: string
}

type Mood = 'neutral' | 'warn' | 'praise'

interface GuideState {
  step: StepInfo | null
  totalSteps: number
  message: string
  mood: Mood
  isPaused: boolean
  pauseMenuOpen: boolean
  percentComplete: number
  isComplete: boolean
}

// ── Styles ─────────────────────────────────────────────────────────────

const moodBorder: Record<Mood, string> = {
  neutral: 'var(--vscode-panel-border, #444)',
  warn: '#d97706',
  praise: '#16a34a',
}

const moodBg: Record<Mood, string> = {
  neutral: 'var(--vscode-editor-background)',
  warn: 'rgba(217,119,6,0.08)',
  praise: 'rgba(22,163,106,0.08)',
}

// ── Avatar SVG ─────────────────────────────────────────────────────────

function Avatar() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
      <circle cx="14" cy="14" r="13" fill="var(--vscode-button-background, #0078d4)" stroke="none" />
      <circle cx="10" cy="12" r="1.5" fill="var(--vscode-button-foreground, #fff)" />
      <circle cx="18" cy="12" r="1.5" fill="var(--vscode-button-foreground, #fff)" />
      <path d="M10 18 Q14 21 18 18" stroke="var(--vscode-button-foreground, #fff)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────────

function GuidePanel() {
  const [state, setState] = useState<GuideState>({
    step: null,
    totalSteps: 0,
    message: 'Waiting for session to start...',
    mood: 'neutral',
    isPaused: false,
    pauseMenuOpen: false,
    percentComplete: 0,
    isComplete: false,
  })

  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    vscode.postMessage({ type: 'webview_ready' })

    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage
      switch (msg.type) {
        case 'step_update':
          setState(prev => ({
            ...prev,
            step: {
              number: msg.step.number,
              title: msg.step.title,
              description: msg.step.description,
              guidance: msg.step.guidance,
            },
            totalSteps: msg.totalSteps,
            percentComplete:
              msg.totalSteps > 0
                ? Math.round(((msg.step.number - 1) / msg.totalSteps) * 100)
                : 0,
            isComplete: false,
          }))
          break
        case 'character_speak':
          setState(prev => ({
            ...prev,
            message: msg.message,
            mood: msg.mood,
          }))
          break
        case 'session_complete':
          setState(prev => ({
            ...prev,
            isComplete: true,
            percentComplete: 100,
            message: 'Session complete! Great work.',
            mood: 'praise',
          }))
          break
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Pulse animation on mood change
  useEffect(() => {
    if (bubbleRef.current && state.mood !== 'neutral') {
      bubbleRef.current.style.animation = 'none'
      // Force reflow
      void bubbleRef.current.offsetHeight
      bubbleRef.current.style.animation = 'moodPulse 0.5s ease-out'
    }
  }, [state.message, state.mood])

  const handlePauseOption = (minutes: number) => {
    vscode.postMessage({ type: 'pause', minutes })
    setState(prev => ({
      ...prev,
      isPaused: true,
      pauseMenuOpen: false,
    }))
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'var(--vscode-font-family)',
      fontSize: 'var(--vscode-font-size, 13px)',
      color: 'var(--vscode-foreground)',
      background: 'var(--vscode-editor-background)',
    }}>
      {/* Keyframe animation */}
      <style>{`
        @keyframes moodPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.01); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--vscode-panel-border, #444)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Avatar />
          <span style={{ fontWeight: 600 }}>TutorCode</span>
        </div>
        <button
          onClick={() => vscode.postMessage({ type: 'toggle_mode' })}
          style={{
            background: 'var(--vscode-button-secondaryBackground, #333)',
            color: 'var(--vscode-button-secondaryForeground, #ccc)',
            border: '1px solid var(--vscode-button-border, transparent)',
            borderRadius: '4px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Chat &#x2197;
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* Speech bubble */}
        <div
          ref={bubbleRef}
          style={{
            border: `2px solid ${moodBorder[state.mood]}`,
            background: moodBg[state.mood],
            borderRadius: '8px',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          {/* Step badge */}
          {state.step && !state.isComplete && (
            <>
              <div style={{
                display: 'inline-block',
                background: 'var(--vscode-badge-background, #4d4d4d)',
                color: 'var(--vscode-badge-foreground, #fff)',
                borderRadius: '10px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 600,
                marginBottom: '6px',
              }}>
                Step {state.step.number} of {state.totalSteps}
              </div>
              <div style={{
                fontWeight: 600,
                fontSize: '14px',
                marginBottom: '10px',
              }}>
                {state.step.title}
              </div>
            </>
          )}

          {/* Message */}
          <div style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
            {state.message}
          </div>
        </div>

        {/* Action buttons */}
        {!state.isComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => vscode.postMessage({ type: 'got_it' })}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'var(--vscode-button-background, #0078d4)',
                  color: 'var(--vscode-button-foreground, #fff)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Got it &#x2713;
              </button>
              <button
                onClick={() => vscode.postMessage({ type: 'need_hint' })}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'var(--vscode-button-secondaryBackground, #333)',
                  color: 'var(--vscode-button-secondaryForeground, #ccc)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Need a hint &#x1F4A1;
              </button>
            </div>

            {/* Pause button with dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() =>
                  setState(prev => ({
                    ...prev,
                    pauseMenuOpen: !prev.pauseMenuOpen,
                  }))
                }
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  background: 'var(--vscode-button-secondaryBackground, #333)',
                  color: 'var(--vscode-button-secondaryForeground, #ccc)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                {state.isPaused ? '\u23F8 Paused' : '\u23F8 Pause \u25BE'}
              </button>
              {state.pauseMenuOpen && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  width: '100%',
                  background: 'var(--vscode-dropdown-background, #252526)',
                  border: '1px solid var(--vscode-dropdown-border, #444)',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  zIndex: 10,
                  overflow: 'hidden',
                }}>
                  {[
                    { label: '5 minutes', minutes: 5 },
                    { label: '15 minutes', minutes: 15 },
                    { label: 'Until I say so', minutes: 0 },
                  ].map(opt => (
                    <button
                      key={opt.minutes}
                      onClick={() => handlePauseOption(opt.minutes)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: 'transparent',
                        color: 'var(--vscode-dropdown-foreground, #ccc)',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '12px',
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background =
                          'var(--vscode-list-hoverBackground, #2a2d2e)')
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--vscode-panel-border, #444)',
      }}>
        <div style={{
          height: '6px',
          borderRadius: '3px',
          background: 'var(--vscode-progressBar-background, #0078d4)'.replace(
            /[^,]+$/,
            '0.2)'
          ),
          overflow: 'hidden',
        }}>
          <div
            style={{
              height: '100%',
              width: `${state.percentComplete}%`,
              background: 'var(--vscode-progressBar-background, #0078d4)',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--vscode-descriptionForeground, #888)',
          marginTop: '4px',
          textAlign: 'right',
        }}>
          {state.percentComplete}%
        </div>
      </div>
    </div>
  )
}

// ── Mount ──────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<GuidePanel />)
}
