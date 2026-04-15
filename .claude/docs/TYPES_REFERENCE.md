# Types Reference

This file is the source of truth for all shared TypeScript interfaces.
When implementing any module, import types from `src/state/types.ts` (session/plan/index types)
and `src/monitoring/types.ts` (event types) rather than redefining them.

Claude Code: generate `src/state/types.ts` and `src/monitoring/types.ts` from this file
during Phase 3 and Phase 5 respectively. All interfaces here must be reflected exactly.

---

## Session Types (→ src/state/types.ts)

```typescript
export type SessionStatus = 'planning' | 'active' | 'paused' | 'complete' | 'abandoned'

export type EvaluationStatus = 'on_track' | 'minor_drift' | 'major_drift' | 'step_complete'

export type StepStatus = 'pending' | 'active' | 'complete' | 'skipped'

export type AIProviderName = 'anthropic' | 'openai' | 'grok' | 'openrouter'

export type AuthResolvedVia = 'file' | 'cli' | 'env' | 'secret'

export type ScaffoldingLevel = 1 | 2 | 3

export type PersonalityName = 'mentor' | 'sensei' | 'peer'

export interface SessionSettings {
  scaffoldingLevel: ScaffoldingLevel          // default: 2
  personality: PersonalityName                // default: 'mentor'
  avatar: string                              // default: 'default'
  cooldownSeconds: number | null              // null = use level default
  maxHintsPerStep: number | null              // null = use level default
  autoNudgeMinutes: number | null             // null = use level default
}

export interface Credentials {
  provider: AIProviderName
  authType: 'bearer' | 'apikey'
  token: string
  guidanceModel: string
  monitorModel: string
  resolvedVia: AuthResolvedVia
}

export interface AIProviderConfig {
  provider: AIProviderName
  guidanceModel: string
  monitorModel: string
  resolvedVia: AuthResolvedVia
}

export interface Step {
  id: string
  number: number
  title: string
  description: string
  guidance: string
  expectedFiles: string[]
  expectedCommands: string[]
  completionCriteria: string
  status: StepStatus
  startedAt?: string
  completedAt?: string
}

export interface Milestone {
  id: string
  title: string
  afterStep: number
  celebrationMessage: string
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  ignored: boolean
}

export interface Plan {
  title: string
  description: string
  recommendedStructure: Array<{ path: string; purpose: string }>
  steps: Step[]
  milestones: Milestone[]
  mermaidDiagram: string
  committedAt?: string
  revisionCount: number
}

export interface Progress {
  currentStepId: string
  completedStepIds: string[]
  percentComplete: number
}

export interface ActionEntry {
  timestamp: string
  type: 'file_save' | 'file_create' | 'file_delete' | 'terminal_command' | 'diagnostic_change'
  description: string
  stepId: string
  evaluationResult?: EvaluationStatus
}

export interface Progress {
  currentStepId: string
  completedStepIds: string[]
  percentComplete: number
  hintsUsedThisStep: number
  consecutiveHintlessSteps: number
  consecutiveMaxHintSteps: number
  lastLevelSuggestionAt?: string
}

export interface TutorSession {
  version: string
  goal: string
  createdAt: string
  updatedAt: string
  status: SessionStatus
  aiProvider: AIProviderConfig
  settings: SessionSettings
  plan: Plan
  progress: Progress
  actionHistory: ActionEntry[]
}

export interface FileSummary {
  path: string
  purpose: string
  exports?: string[]
  imports?: string[]
  generatedAt: string
}

export interface DetectedStack {
  language: string[]
  framework: string[]
  runtime: string[]
  packageManager: string
  hasTypeScript: boolean
  configFiles: string[]
}

export interface ProjectIndex {
  version: string
  indexedAt: string
  workspaceRoot: string
  tree: FileTreeNode[]
  keySummaries: Record<string, FileSummary>
  detectedStack: DetectedStack
}
```

---

## Monitoring Types (→ src/monitoring/types.ts)

```typescript
export type MonitoringEventType =
  | 'file_save'
  | 'file_create'
  | 'file_delete'
  | 'terminal_cmd'
  | 'diagnostics'

export interface FileSaveEvent {
  type: 'file_save'
  uri: string            // vscode.Uri.toString() — serializable
  relativePath: string
  contentPreview: string // first 2000 chars
  timestamp: number
}

export interface FileCreateEvent {
  type: 'file_create'
  uri: string
  relativePath: string
  timestamp: number
}

export interface FileDeleteEvent {
  type: 'file_delete'
  uri: string
  relativePath: string
  timestamp: number
}

export interface TerminalCmdEvent {
  type: 'terminal_cmd'
  raw: string
  command: string        // parsed command string
  exitCode: number | null
  timestamp: number
}

export interface DiagnosticsEvent {
  type: 'diagnostics'
  uri: string
  relativePath: string
  errorCount: number
  warningCount: number
  timestamp: number
}

export type MonitoringEvent =
  | FileSaveEvent
  | FileCreateEvent
  | FileDeleteEvent
  | TerminalCmdEvent
  | DiagnosticsEvent
```

---

## AI Provider Types (→ src/ai/providers/types.ts)

```typescript
export interface CacheableBlock {
  text: string
  cache?: boolean
}

export interface Message {
  role: 'user' | 'assistant'
  content: string | CacheableBlock[]
}

export interface CompleteOptions {
  model: string
  maxTokens: number
  system?: CacheableBlock[]
  temperature?: number
}

export interface AIProvider {
  complete(messages: Message[], options: CompleteOptions): Promise<string>
  stream(messages: Message[], options: CompleteOptions): AsyncIterable<string>
  completeJSON<T>(messages: Message[], options: CompleteOptions): Promise<T>
  monitor(messages: Message[], options: CompleteOptions): Promise<string>
}

export interface EvaluationResult {
  status: EvaluationStatus
  message: string | null
  tier: 1 | 2 | 3
  tokensUsed?: number
}

export type CheckpointConfidence = 'high' | 'low'

export interface CheckpointResult {
  status: EvaluationStatus | 'ambiguous'
  confidence: CheckpointConfidence
  reason: string
}
```

---

## Webview Message Types (→ src/ui/messages.ts)

```typescript
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
  | { type: 'webview_ready' }   // sent by webview on mount — signals ready to receive messages
```
