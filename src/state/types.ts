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
  hintsUsedThisStep: number
  consecutiveHintlessSteps: number
  consecutiveMaxHintSteps: number
  lastLevelSuggestionAt?: string
}

export interface ActionEntry {
  timestamp: string
  type: 'file_save' | 'file_create' | 'file_delete' | 'terminal_command' | 'diagnostic_change'
  description: string
  stepId: string
  evaluationResult?: EvaluationStatus
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
