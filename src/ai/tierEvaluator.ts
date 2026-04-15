import { AIProvider, EvaluationResult, Message, CompleteOptions } from './providers/types'
import { PromptCache } from './promptCache'
import { TutorSession, Step, ProjectIndex, EvaluationStatus } from '../state/types'
import { MonitoringEvent } from '../monitoring/types'
import { evaluate as checkpointEvaluate } from '../monitoring/checkpointDetector'
import {
  Prompts,
  interpolate,
  MONITOR_HAIKU_EVENT_TEMPLATE,
  HINT_REQUEST_PROMPT,
  STEP_GUIDANCE_PROMPT,
  REENTRY_PROMPT,
  STEP_COMPLETE_CONFIRM_PROMPT,
} from '../prompts/index'

export class TierEvaluator {
  private recentEvents: MonitoringEvent[] = []

  constructor(
    private provider: AIProvider,
    private promptCache: PromptCache,
    private session: TutorSession,
    private index: ProjectIndex,
  ) {}

  async evaluate(event: MonitoringEvent, step: Step): Promise<EvaluationResult> {
    // Track recent events
    this.recentEvents.push(event)
    if (this.recentEvents.length > 20) {
      this.recentEvents = this.recentEvents.slice(-20)
    }

    // ── Tier 1: local checkpoint detection ────────────────────────
    const checkpoint = checkpointEvaluate(event, step, this.index, this.recentEvents)
    if (checkpoint.confidence === 'high' && checkpoint.status !== 'ambiguous') {
      return {
        status: checkpoint.status,
        message: null,
        tier: 1,
      }
    }

    // ── Tier 2: Haiku monitoring call ─────────────────────────────
    const cached = this.promptCache.buildTier2Prefix(this.session, this.index)

    const eventDescription = this.describeEvent(event)
    const eventFile = 'relativePath' in event ? event.relativePath : 'n/a'

    const suffix = interpolate(MONITOR_HAIKU_EVENT_TEMPLATE, {
      stepNumber: String(step.number),
      total: String(this.session.plan.steps.length),
      stepTitle: step.title,
      expectedFiles: step.expectedFiles.join(', '),
      expectedCommands: step.expectedCommands.join(', '),
      eventType: event.type,
      eventDescription,
      eventFile,
      activeErrors: '0', // Will be wired to real diagnostics in Phase 5
      checkpointReason: checkpoint.reason,
    })

    // Build full message list: cached context + non-cached suffix
    const messages: Message[] = [
      ...cached.contextMessages,
    ]

    // Append non-cached suffix to the last user message
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      const last = messages[messages.length - 1]
      if (Array.isArray(last.content)) {
        last.content = [
          ...last.content,
          { text: '\n\n' + suffix, cache: false },
        ]
      } else {
        last.content = last.content + '\n\n' + suffix
      }
    } else {
      messages.push({ role: 'user', content: suffix })
    }

    const options: CompleteOptions = {
      model: '', // monitor() ignores this
      maxTokens: 256,
      system: cached.system,
      temperature: 0.3,
    }

    const raw = await this.provider.monitor(messages, options)

    try {
      const parsed = this.parseMonitorJSON(raw)
      return {
        status: parsed.status as EvaluationStatus,
        message: parsed.message ?? null,
        tier: 2,
      }
    } catch {
      // If parsing fails, default to on_track
      return {
        status: 'on_track',
        message: null,
        tier: 2,
      }
    }
  }

  async requestHint(step: Step, hintsUsed: number, maxHints: number): Promise<EvaluationResult> {
    const cached = this.promptCache.buildTier3Prefix(
      this.session,
      this.index,
      this.session.settings.personality,
      this.session.settings.scaffoldingLevel,
    )

    const userContent = interpolate(HINT_REQUEST_PROMPT, {
      stepNumber: String(step.number),
      stepTitle: step.title,
      stepDescription: step.description,
      completionCriteria: step.completionCriteria,
      projectState: 'See project state above',
      activeErrors: '0',
      scaffoldingLevel: String(this.session.settings.scaffoldingLevel),
      hintsUsedThisStep: String(hintsUsed),
      maxHintsPerStep: String(maxHints),
    })

    const messages: Message[] = [
      ...cached.contextMessages,
      { role: 'user', content: userContent },
    ]

    const options: CompleteOptions = {
      model: this.session.aiProvider.guidanceModel,
      maxTokens: 512,
      system: cached.system,
      temperature: 0.7,
    }

    const text = await this.provider.complete(messages, options)
    return {
      status: 'on_track',
      message: text,
      tier: 3,
    }
  }

  async requestGuidance(step: Step, trigger: string, userInput?: string): Promise<EvaluationResult> {
    const cached = this.promptCache.buildTier3Prefix(
      this.session,
      this.index,
      this.session.settings.personality,
      this.session.settings.scaffoldingLevel,
    )

    let template: string
    let vars: Record<string, string>

    const lastAction = this.session.actionHistory.length > 0
      ? this.session.actionHistory[this.session.actionHistory.length - 1].description
      : 'none'

    switch (trigger) {
      case 'step_guidance':
        template = STEP_GUIDANCE_PROMPT
        vars = {
          stepNumber: String(step.number),
          total: String(this.session.plan.steps.length),
          stepTitle: step.title,
          stepDescription: step.description,
          stepGuidance: step.guidance,
          lastAction,
        }
        break
      case 'reentry':
        template = REENTRY_PROMPT
        vars = {
          stepNumber: String(step.number),
          stepTitle: step.title,
          recentChatSummary: userInput ?? 'No recent chat',
          lastAction,
        }
        break
      case 'step_complete_confirm':
        template = STEP_COMPLETE_CONFIRM_PROMPT
        vars = {
          stepNumber: String(step.number),
          stepTitle: step.title,
          completionCriteria: step.completionCriteria,
          currentFiles: step.expectedFiles.join(', '),
          terminalHistory: 'See recent actions above',
          activeErrors: '0',
        }
        break
      default:
        template = STEP_GUIDANCE_PROMPT
        vars = {
          stepNumber: String(step.number),
          total: String(this.session.plan.steps.length),
          stepTitle: step.title,
          stepDescription: step.description,
          stepGuidance: step.guidance,
          lastAction,
        }
    }

    const userContent = interpolate(template, vars)
    const messages: Message[] = [
      ...cached.contextMessages,
      { role: 'user', content: userContent },
    ]

    const options: CompleteOptions = {
      model: this.session.aiProvider.guidanceModel,
      maxTokens: 1024,
      system: cached.system,
      temperature: 0.7,
    }

    const text = await this.provider.complete(messages, options)
    return {
      status: 'on_track',
      message: text,
      tier: 3,
    }
  }

  async *chat(messages: Message[], step: Step): AsyncIterable<string> {
    const cached = this.promptCache.buildTier3Prefix(
      this.session,
      this.index,
      this.session.settings.personality,
      this.session.settings.scaffoldingLevel,
    )

    // Prepend cached context messages to chat messages
    const fullMessages: Message[] = [
      ...cached.contextMessages,
      ...messages,
    ]

    const options: CompleteOptions = {
      model: this.session.aiProvider.guidanceModel,
      maxTokens: 1024,
      system: cached.system,
      temperature: 0.7,
    }

    yield* this.provider.stream(fullMessages, options)
  }

  // ── Private helpers ──────────────────────────────────────────────

  private describeEvent(event: MonitoringEvent): string {
    switch (event.type) {
      case 'file_save':
        return `User saved ${event.relativePath}`
      case 'file_create':
        return `User created ${event.relativePath}`
      case 'file_delete':
        return `User deleted ${event.relativePath}`
      case 'terminal_cmd':
        return `User ran: ${event.command}${event.exitCode !== null ? ` (exit ${event.exitCode})` : ''}`
      case 'diagnostics':
        return `Diagnostics changed in ${event.relativePath}: ${event.errorCount} errors, ${event.warningCount} warnings`
    }
  }

  private parseMonitorJSON(raw: string): { status: string; message: string | null } {
    try {
      return JSON.parse(raw) as { status: string; message: string | null }
    } catch {
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const trimmed = raw.substring(firstBrace, lastBrace + 1)
        return JSON.parse(trimmed) as { status: string; message: string | null }
      }
      throw new Error('Failed to parse monitor JSON response')
    }
  }
}
