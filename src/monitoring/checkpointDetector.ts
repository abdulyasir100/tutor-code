import { MonitoringEvent } from './types'
import { Step, ProjectIndex, EvaluationStatus } from '../state/types'

export interface CheckpointResult {
  status: EvaluationStatus | 'ambiguous'
  confidence: 'high' | 'low'
  reason: string
}

export function evaluate(
  _event: MonitoringEvent,
  _step: Step,
  _index: ProjectIndex,
  _recentEvents: MonitoringEvent[],
): CheckpointResult {
  // Stub — Phase 5 implements real logic
  return {
    status: 'ambiguous',
    confidence: 'low',
    reason: 'Checkpoint detector stub — awaiting Phase 5 implementation',
  }
}
