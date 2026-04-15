import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { HostMessage } from '../../messages'

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscode = acquireVsCodeApi()

// ── Types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'tutor' | 'user'
  text: string
  timestamp: number
}

interface PlanStep {
  number: number
  title: string
  status: string
}

interface PlanInfo {
  title: string
  description: string
  steps: PlanStep[]
  mermaidDiagram: string
}

interface ChatState {
  messages: ChatMessage[]
  plan: PlanInfo | null
  planExpanded: boolean
  inputValue: string
  isStreaming: boolean
  mode: 'planning' | 'chat'
}

// ── Main Component ─────────────────────────────────────────────────────

function ChatPanel() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    plan: null,
    planExpanded: false,
    inputValue: '',
    isStreaming: false,
    mode: 'chat',
  })
  const [suggestionInput, setSuggestionInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [state.messages])

  useEffect(() => {
    vscode.postMessage({ type: 'webview_ready' })

    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage
      switch (msg.type) {
        case 'chat_chunk':
          setState(prev => {
            const messages = [...prev.messages]
            if (
              prev.isStreaming &&
              messages.length > 0 &&
              messages[messages.length - 1].role === 'tutor'
            ) {
              // Append to current streaming message
              const last = { ...messages[messages.length - 1] }
              last.text += msg.text
              messages[messages.length - 1] = last
            } else {
              // Start new tutor message
              messages.push({
                role: 'tutor',
                text: msg.text,
                timestamp: Date.now(),
              })
            }
            return {
              ...prev,
              messages,
              isStreaming: !msg.done,
            }
          })
          break

        case 'plan_display':
          setState(prev => ({
            ...prev,
            plan: {
              title: msg.plan.title,
              description: msg.plan.description,
              steps: msg.plan.steps.map(s => ({
                number: s.number,
                title: s.title,
                status: s.status,
              })),
              mermaidDiagram: msg.plan.mermaidDiagram,
            },
            planExpanded: true,
            mode: msg.plan.committedAt ? 'chat' : 'planning',
          }))
          break

        case 'session_complete':
          setState(prev => ({
            ...prev,
            messages: [
              ...prev.messages,
              {
                role: 'tutor',
                text: 'Session complete! Great work.',
                timestamp: Date.now(),
              },
            ],
          }))
          break
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleSend = () => {
    const text = state.inputValue.trim()
    if (!text || state.isStreaming) return

    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        { role: 'user', text, timestamp: Date.now() },
      ],
      inputValue: '',
    }))
    vscode.postMessage({ type: 'chat_send', text })
  }

  const handleSuggestion = () => {
    const text = suggestionInput.trim()
    if (!text) return
    vscode.postMessage({ type: 'plan_suggestion', text })
    setSuggestionInput('')
  }

  const handleCommitPlan = () => {
    vscode.postMessage({ type: 'plan_commit' })
    setState(prev => ({ ...prev, mode: 'chat', planExpanded: false }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--vscode-panel-border, #444)',
      }}>
        <span style={{ fontWeight: 600 }}>TutorCode &mdash; Chat</span>
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
          Guide &#x2199;
        </button>
      </div>

      {/* Plan section (collapsible) */}
      {state.plan && (
        <div style={{
          borderBottom: '1px solid var(--vscode-panel-border, #444)',
        }}>
          <button
            onClick={() =>
              setState(prev => ({
                ...prev,
                planExpanded: !prev.planExpanded,
              }))
            }
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            {state.planExpanded ? '\u25BC' : '\u25B6'} Plan Overview
          </button>
          {state.planExpanded && (
            <div style={{ padding: '0 12px 12px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {state.plan.title}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--vscode-descriptionForeground, #888)',
                marginBottom: '8px',
              }}>
                {state.plan.description}
              </div>

              {/* Steps list */}
              <div style={{ marginBottom: '8px' }}>
                {state.plan.steps.map(s => (
                  <div
                    key={s.number}
                    style={{
                      fontSize: '12px',
                      padding: '2px 0',
                      color:
                        s.status === 'complete'
                          ? 'var(--vscode-charts-green, #16a34a)'
                          : s.status === 'active'
                          ? 'var(--vscode-foreground)'
                          : 'var(--vscode-descriptionForeground, #888)',
                    }}
                  >
                    {s.status === 'complete' ? '\u2713' : s.status === 'active' ? '\u25B6' : '\u25CB'}{' '}
                    {s.number}. {s.title}
                  </div>
                ))}
              </div>

              {/* Mermaid diagram as preformatted text */}
              {state.plan.mermaidDiagram && (
                <pre style={{
                  background: 'var(--vscode-textCodeBlock-background, #1e1e1e)',
                  padding: '8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  overflow: 'auto',
                  maxHeight: '200px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {state.plan.mermaidDiagram}
                </pre>
              )}

              {/* Planning mode: suggestion input + commit button */}
              {state.mode === 'planning' && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}>
                    Suggest a change:
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      value={suggestionInput}
                      onChange={e => setSuggestionInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSuggestion()
                      }}
                      placeholder="e.g. I want Zustand instead of Context..."
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        background: 'var(--vscode-input-background, #3c3c3c)',
                        color: 'var(--vscode-input-foreground, #ccc)',
                        border: '1px solid var(--vscode-input-border, #444)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleSuggestion}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--vscode-button-secondaryBackground, #333)',
                        color: 'var(--vscode-button-secondaryForeground, #ccc)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Suggest
                    </button>
                  </div>
                  <button
                    onClick={handleCommitPlan}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: 'var(--vscode-button-background, #0078d4)',
                      color: 'var(--vscode-button-foreground, #fff)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    &#x2713; Commit Plan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px',
      }}>
        {state.messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--vscode-descriptionForeground, #888)',
              marginBottom: '2px',
            }}>
              {msg.role === 'tutor' ? 'Tutor' : 'You'}
            </div>
            <div style={{
              background:
                msg.role === 'tutor'
                  ? 'var(--vscode-textCodeBlock-background, #1e1e1e)'
                  : 'var(--vscode-button-background, #0078d4)',
              color:
                msg.role === 'tutor'
                  ? 'var(--vscode-foreground)'
                  : 'var(--vscode-button-foreground, #fff)',
              padding: '8px 12px',
              borderRadius: '8px',
              maxWidth: '85%',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.text}
              {state.isStreaming &&
                i === state.messages.length - 1 &&
                msg.role === 'tutor' && (
                  <span style={{ opacity: 0.5 }}> &#x25CF;</span>
                )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '8px 12px',
        borderTop: '1px solid var(--vscode-panel-border, #444)',
      }}>
        <textarea
          value={state.inputValue}
          onChange={e =>
            setState(prev => ({ ...prev, inputValue: e.target.value }))
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          rows={1}
          style={{
            flex: 1,
            padding: '8px',
            background: 'var(--vscode-input-background, #3c3c3c)',
            color: 'var(--vscode-input-foreground, #ccc)',
            border: '1px solid var(--vscode-input-border, #444)',
            borderRadius: '4px',
            resize: 'none',
            fontFamily: 'var(--vscode-font-family)',
            fontSize: 'var(--vscode-font-size, 13px)',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={state.isStreaming || !state.inputValue.trim()}
          style={{
            padding: '8px 16px',
            background:
              state.isStreaming || !state.inputValue.trim()
                ? 'var(--vscode-button-secondaryBackground, #333)'
                : 'var(--vscode-button-background, #0078d4)',
            color: 'var(--vscode-button-foreground, #fff)',
            border: 'none',
            borderRadius: '4px',
            cursor:
              state.isStreaming || !state.inputValue.trim()
                ? 'default'
                : 'pointer',
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Mount ──────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<ChatPanel />)
}
