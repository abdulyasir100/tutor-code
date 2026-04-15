// Placeholder until Phase 3 creates state/types.ts
export type Step = {
  id: string
  number: number
  title: string
  description: string
  guidance: string
  expectedFiles: string[]
  expectedCommands: string[]
  completionCriteria: string
  status: string
  startedAt?: string
  completedAt?: string
}

export type Plan = {
  title: string
  description: string
  recommendedStructure: Array<{ path: string; purpose: string }>
  steps: Step[]
  milestones: unknown[]
  mermaidDiagram: string
  committedAt?: string
  revisionCount: number
}

export type CharacterMood = 'neutral' | 'warn' | 'praise'

export type HostMessage =
  | { type: 'step_update'; step: Step; totalSteps: number }
  | { type: 'character_speak'; message: string; mood: CharacterMood }
  | { type: 'chat_chunk'; text: string; done: boolean }
  | { type: 'mode_change'; mode: 'guide' | 'chat' }
  | { type: 'plan_display'; plan: Plan }
  | { type: 'session_complete' }

export type WebviewMessage =
  | { type: 'got_it' }
  | { type: 'need_hint' }
  | { type: 'pause'; minutes: number }
  | { type: 'chat_send'; text: string }
  | { type: 'toggle_mode' }
  | { type: 'plan_suggestion'; text: string }
  | { type: 'plan_commit' }
  | { type: 'webview_ready' }
