import { EvaluationStatus } from '../../state/types'

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
