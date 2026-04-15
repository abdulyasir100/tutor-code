import {
  TutorSession,
  PersonalityName,
  ScaffoldingLevel,
  ProjectIndex,
} from '../state/types'
import { CacheableBlock, Message } from './providers/types'
import {
  MONITOR_HAIKU_PROMPT,
  TUTOR_SYSTEM_PROMPT,
  PERSONALITY_BLOCKS,
  SCAFFOLDING_BLOCKS,
  interpolate,
  MONITOR_HAIKU_USER_TEMPLATE,
} from '../prompts/index'

interface CachedPrefix {
  system: CacheableBlock[]
  contextMessages: Message[]
}

export class PromptCache {
  private tier2Cache: CachedPrefix | null = null
  private tier3Cache: CachedPrefix | null = null
  private tier2PlanHash: string | null = null
  private tier3PlanHash: string | null = null

  buildTier2Prefix(session: TutorSession, index: ProjectIndex): CachedPrefix {
    const planHash = this.hashPlan(session)

    if (this.tier2Cache && this.tier2PlanHash === planHash) {
      return this.tier2Cache
    }

    const system: CacheableBlock[] = [
      { text: MONITOR_HAIKU_PROMPT, cache: true },
    ]

    const planText = this.renderPlanAsText(session)
    const expectedStructure = this.renderExpectedStructure(session)

    const contextUserContent = interpolate(MONITOR_HAIKU_USER_TEMPLATE, {
      planText,
      expectedStructure,
      goal: session.goal,
    })

    const contextMessages: Message[] = [
      {
        role: 'user',
        content: [{ text: contextUserContent, cache: true }],
      },
    ]

    this.tier2Cache = { system, contextMessages }
    this.tier2PlanHash = planHash
    return this.tier2Cache
  }

  buildTier3Prefix(
    session: TutorSession,
    index: ProjectIndex,
    personality: PersonalityName,
    scaffoldingLevel: ScaffoldingLevel,
  ): CachedPrefix {
    const planHash = this.hashPlan(session)

    if (this.tier3Cache && this.tier3PlanHash === planHash) {
      return this.tier3Cache
    }

    const personalityBlock = PERSONALITY_BLOCKS[personality]
    const scaffoldingBehavior = SCAFFOLDING_BLOCKS[scaffoldingLevel]

    const systemText = TUTOR_SYSTEM_PROMPT
      .replace('{personalityBlock}', personalityBlock)
      .replace('{scaffoldingBehavior}', scaffoldingBehavior)

    const system: CacheableBlock[] = [
      { text: systemText, cache: true },
    ]

    // Build context block with goal, plan, expected structure, and project state
    const contextParts: string[] = [
      `GOAL: ${session.goal}`,
      '',
      'PLAN:',
      this.renderPlanAsText(session),
      '',
      'EXPECTED PROJECT STRUCTURE:',
      this.renderExpectedStructure(session),
      '',
      'CURRENT PROJECT STATE:',
      this.renderProjectTree(index),
      '',
      'KEY FILE SUMMARIES:',
      this.renderKeySummaries(index),
    ]

    const contextMessages: Message[] = [
      {
        role: 'user',
        content: [{ text: contextParts.join('\n'), cache: true }],
      },
    ]

    this.tier3Cache = { system, contextMessages }
    this.tier3PlanHash = planHash
    return this.tier3Cache
  }

  invalidate(): void {
    this.tier2Cache = null
    this.tier3Cache = null
    this.tier2PlanHash = null
    this.tier3PlanHash = null
  }

  // ── Private helpers ──────────────────────────────────────────────

  private hashPlan(session: TutorSession): string {
    // Simple hash based on plan title + step count + revision count
    const key = `${session.plan.title}|${session.plan.steps.length}|${session.plan.revisionCount}`
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      const chr = key.charCodeAt(i)
      hash = ((hash << 5) - hash) + chr
      hash |= 0 // Convert to 32bit integer
    }
    return hash.toString(36)
  }

  private renderPlanAsText(session: TutorSession): string {
    const lines: string[] = [session.plan.title, session.plan.description, '']
    for (const step of session.plan.steps) {
      lines.push(`${step.number}. ${step.title} — ${step.description}`)
      lines.push(`   Expected files: ${step.expectedFiles.join(', ')}`)
      lines.push(`   Expected commands: ${step.expectedCommands.join(', ')}`)
      lines.push(`   Completion: ${step.completionCriteria}`)
    }
    return lines.join('\n')
  }

  private renderExpectedStructure(session: TutorSession): string {
    return session.plan.recommendedStructure
      .map(s => `  ${s.path} — ${s.purpose}`)
      .join('\n')
  }

  private renderProjectTree(index: ProjectIndex): string {
    const lines: string[] = []
    const walk = (nodes: typeof index.tree, indent: string): void => {
      for (const node of nodes) {
        if (node.ignored) {
          lines.push(`${indent}${node.name}/ (ignored)`)
        } else if (node.type === 'directory') {
          lines.push(`${indent}${node.name}/`)
          if (node.children) {
            walk(node.children, indent + '  ')
          }
        } else {
          lines.push(`${indent}${node.name}`)
        }
      }
    }
    walk(index.tree, '  ')
    return lines.join('\n')
  }

  private renderKeySummaries(index: ProjectIndex): string {
    const entries = Object.entries(index.keySummaries)
    if (entries.length === 0) { return '  (none indexed)' }
    return entries
      .map(([p, s]) => `  ${p}: ${s.purpose}`)
      .join('\n')
  }
}
