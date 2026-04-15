import { Step, Plan } from '../state/types'

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
