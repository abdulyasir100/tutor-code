import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { resolveCredentials, clearCredentialCache } from './auth/claudeAuth'
import { SecretStorage } from './auth/secretStorage'
import { Credentials } from './auth/types'
import { AnthropicProvider } from './ai/providers/anthropic'
import { OpenAIProvider } from './ai/providers/openai'
import { AIProvider } from './ai/providers/types'
import { PromptCache } from './ai/promptCache'
import { TierEvaluator } from './ai/tierEvaluator'
import { SessionManager } from './state/sessionManager'
import { ProjectIndexer } from './state/projectIndexer'
import {
  TutorSession,
  Plan,
  Step,
  SessionSettings,
  ScaffoldingLevel,
  AIProviderConfig,
  Progress,
} from './state/types'
import { MonitoringOrchestrator } from './monitoring/orchestrator'
import { MonitoringEvent } from './monitoring/types'
import { GuidePanel } from './ui/guidePanel'
import { ChatPanel } from './ui/chatPanel'
import { TutorStatusBar } from './ui/statusBar'
import { ErrorHandler, ErrorAction } from './errorHandler'
import { DebugLogger } from './debugLogger'
import {
  Prompts,
  interpolate,
  PLAN_GENERATION_PROMPT,
  PLAN_REVISION_PROMPT,
  EXISTING_SCAN_PROMPT,
} from './prompts/index'

// ── Module-level singletons ──────────────────────────────────────────

let sessionManager: SessionManager | undefined
let projectIndexer: ProjectIndexer | undefined
let monitoringOrchestrator: MonitoringOrchestrator | undefined
let tierEvaluator: TierEvaluator | undefined
let promptCache: PromptCache | undefined
let aiProvider: AIProvider | undefined
let guidePanel: GuidePanel | undefined
let chatPanel: ChatPanel | undefined
let statusBar: TutorStatusBar | undefined
let credentials: Credentials | undefined
let errorHandler: ErrorHandler | undefined
let debugLogger: DebugLogger | undefined

// Cooldown state
let lastInterruptionAt = 0

// Inactivity nudge
let lastActivityAt = 0
let nudgeTimer: ReturnType<typeof setInterval> | undefined
let nudgeCount = 0

// Chat history for streaming
let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []

// Event listener disposables for plan mode (cleaned up on commit/abandon)
let planListenerDisposables: vscode.Disposable[] = []
// Event listener disposables for guide mode
let guideListenerDisposables: vscode.Disposable[] = []
let monitoringListenerDisposable: vscode.Disposable | undefined

// ── Cooldown System ──────────────────────────────────────────────────

const LEVEL_COOLDOWN_MS: Record<number, number> = { 1: 15_000, 2: 30_000, 3: 60_000 }
const LEVEL_MAX_HINTS: Record<number, number> = { 1: 999, 2: 3, 3: 1 }
const LEVEL_NUDGE_MINUTES: Record<number, number | null> = { 1: 5, 2: 10, 3: null }

function getCooldownMs(settings: SessionSettings): number {
  if (settings.cooldownSeconds !== null) return settings.cooldownSeconds * 1000
  return LEVEL_COOLDOWN_MS[settings.scaffoldingLevel] ?? 30_000
}

function canInterrupt(settings: SessionSettings): boolean {
  return Date.now() - lastInterruptionAt > getCooldownMs(settings)
}

function recordInterruption(): void {
  lastInterruptionAt = Date.now()
}

function getMaxHints(settings: SessionSettings): number {
  if (settings.maxHintsPerStep !== null) return settings.maxHintsPerStep
  return LEVEL_MAX_HINTS[settings.scaffoldingLevel] ?? 3
}

function getNudgeMinutes(settings: SessionSettings): number | null {
  if (settings.autoNudgeMinutes !== null) return settings.autoNudgeMinutes
  return LEVEL_NUDGE_MINUTES[settings.scaffoldingLevel] ?? null
}

// ── Workspace Helpers ────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

async function classifyWorkspace(root: string): Promise<'empty' | 'existing'> {
  try {
    const entries = await fs.promises.readdir(root)
    const significant = entries.filter(
      (e) => !['node_modules', '.git', '.vscode', '.DS_Store', 'Thumbs.db'].includes(e),
    )
    return significant.length === 0 ? 'empty' : 'existing'
  } catch {
    return 'empty'
  }
}

// ── Plan Validation ──────────────────────────────────────────────────

function validatePlan(raw: unknown): Plan {
  const obj = raw as Record<string, unknown>
  if (!obj || typeof obj !== 'object') {
    throw new Error('Plan is not an object')
  }
  if (typeof obj.title !== 'string' || !obj.title) {
    throw new Error('Plan missing title')
  }

  const steps = obj.steps as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('Plan has no steps')
  }

  // Normalize steps with defaults
  const normalizedSteps: Step[] = steps.map((s, i) => ({
    id: (s.id as string) || `step_${i + 1}`,
    number: (s.number as number) || i + 1,
    title: (s.title as string) || `Step ${i + 1}`,
    description: (s.description as string) || '',
    guidance: (s.guidance as string) || '',
    expectedFiles: Array.isArray(s.expectedFiles) ? (s.expectedFiles as string[]) : [],
    expectedCommands: Array.isArray(s.expectedCommands) ? (s.expectedCommands as string[]) : [],
    completionCriteria: (s.completionCriteria as string) || '',
    status: i === 0 ? 'active' as const : 'pending' as const,
  }))

  const milestones = Array.isArray(obj.milestones)
    ? (obj.milestones as Array<Record<string, unknown>>).map((m) => ({
        id: (m.id as string) || '',
        title: (m.title as string) || '',
        afterStep: (m.afterStep as number) || 0,
        celebrationMessage: (m.celebrationMessage as string) || '',
      }))
    : []

  const recommendedStructure = Array.isArray(obj.recommendedStructure)
    ? (obj.recommendedStructure as Array<Record<string, unknown>>).map((s) => ({
        path: (s.path as string) || '',
        purpose: (s.purpose as string) || '',
      }))
    : []

  return {
    title: obj.title as string,
    description: (obj.description as string) || '',
    recommendedStructure,
    steps: normalizedSteps,
    milestones,
    mermaidDiagram: (obj.mermaidDiagram as string) || '',
    revisionCount: 0,
  }
}

// ── Hint counting ────────────────────────────────────────────────────

function countHintsThisStep(session: TutorSession, stepId: string): number {
  // Count hint actions in action history for this step
  return session.actionHistory.filter(
    (a) => a.stepId === stepId && a.type === 'diagnostic_change' && a.description.startsWith('hint_request'),
  ).length + (session.progress.hintsUsedThisStep ?? 0)
}

// ── Fallback Guidance ────────────────────────────────────────────────

const FALLBACK_HINTS: Record<string, string[]> = {
  file_create: [
    'Good -- you\'re creating files. Check the plan to make sure this one is expected.',
    'New file created. Does it match what the current step requires?',
  ],
  terminal_cmd: [
    'Command ran. Check the output -- did it succeed?',
    'Terminal activity detected. Is this the command the current step needs?',
  ],
  major_drift: [
    'This might not be what the current step needs. Review the step before continuing.',
    'Heads up -- this action looks different from the plan. Intentional?',
  ],
  step_start: [
    'Read the description and think about your first move.',
    'What needs to happen before this step can be called done?',
  ],
}

function fallbackGuidance(step: Step, category?: string): string {
  const key = category || 'step_start'
  const hints = FALLBACK_HINTS[key] ?? FALLBACK_HINTS['step_start']!
  const hint = hints[Math.floor(Math.random() * hints.length)]!
  return hint
    .replace('{N}', String(step.number))
    .replace('{title}', step.title)
}

// ── Event Description ────────────────────────────────────────────────

function describeEvent(event: MonitoringEvent): string {
  switch (event.type) {
    case 'file_save':
      return `Saved ${event.relativePath}`
    case 'file_create':
      return `Created ${event.relativePath}`
    case 'file_delete':
      return `Deleted ${event.relativePath}`
    case 'terminal_cmd':
      return `Ran: ${event.command}`
    case 'diagnostics':
      return `Diagnostics: ${event.relativePath} (${event.errorCount} errors)`
  }
}

// ── Provider Factory ─────────────────────────────────────────────────

function createProvider(creds: Credentials): AIProvider {
  if (creds.provider === 'anthropic') {
    return new AnthropicProvider(creds)
  }
  return new OpenAIProvider(creds)
}

// ── Inactivity Nudge ─────────────────────────────────────────────────

function startNudgeTimer(session: TutorSession): void {
  stopNudgeTimer()
  nudgeCount = 0
  lastActivityAt = Date.now()

  const nudgeMinutes = getNudgeMinutes(session.settings)
  if (nudgeMinutes === null) return

  nudgeTimer = setInterval(() => {
    const idleMs = Date.now() - lastActivityAt
    const idleMinutes = idleMs / 60_000

    if (idleMinutes >= nudgeMinutes && nudgeCount === 0) {
      const step = sessionManager?.getCurrentStep(session)
      if (step && guidePanel) {
        guidePanel.sendCharacterMessage(
          `Still working on step ${step.number}? Let me know if you need a hint.`,
          'neutral',
        )
        nudgeCount = 1
        recordInterruption()
      }
    } else if (idleMinutes >= nudgeMinutes * 2 && nudgeCount === 1) {
      guidePanel?.sendCharacterMessage(
        'Take your time -- I\'m here when you\'re ready. Press [Need a hint] if stuck.',
        'neutral',
      )
      nudgeCount = 2
      recordInterruption()
    }
    // After nudgeCount 2, stop nudging
  }, 60_000) // Check every minute
}

function stopNudgeTimer(): void {
  if (nudgeTimer !== undefined) {
    clearInterval(nudgeTimer)
    nudgeTimer = undefined
  }
}

function recordActivity(): void {
  lastActivityAt = Date.now()
  nudgeCount = 0
}

// ── Main Extension Lifecycle ─────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Init status bar (always visible)
  statusBar = new TutorStatusBar()
  context.subscriptions.push(statusBar)

  errorHandler = new ErrorHandler()

  const workspaceRoot = getWorkspaceRoot()

  // 2. Init debug logger
  if (workspaceRoot) {
    debugLogger = new DebugLogger(workspaceRoot)
  }

  // 3. Init state managers (only if workspace is open)
  if (workspaceRoot) {
    sessionManager = new SessionManager(workspaceRoot)
    projectIndexer = new ProjectIndexer(workspaceRoot)

    // 4. Check for existing session
    try {
      const existing = await sessionManager.load()
      if (existing && existing.status === 'active') {
        const resume = await vscode.window.showInformationMessage(
          `TutorCode: Resume "${existing.goal}"?`,
          'Resume',
          'Start Fresh',
          'Dismiss',
        )
        if (resume === 'Resume') {
          await resumeSession(existing, context)
        } else if (resume === 'Start Fresh') {
          existing.status = 'abandoned'
          await sessionManager.save(existing)
        }
      }
    } catch {
      // Session file corrupt or missing — ignore
    }
  }

  // 5. Register commands
  const secretStore = new SecretStorage(context.secrets)

  context.subscriptions.push(
    vscode.commands.registerCommand('tutorcode.start', () => startSession(context, secretStore)),
    vscode.commands.registerCommand('tutorcode.toggle', () => toggleMode()),
    vscode.commands.registerCommand('tutorcode.pause', () => pauseSession()),
    vscode.commands.registerCommand('tutorcode.revisePlan', () => revisePlan(context, secretStore)),
    vscode.commands.registerCommand('tutorcode.reindex', () => reindexProject()),
    vscode.commands.registerCommand('tutorcode.abandon', () => abandonSession()),
  )

  // 6. Set initial context key
  await vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', false)
}

export function deactivate(): void {
  stopNudgeTimer()
  disposePlanListeners()
  disposeGuideListeners()
  monitoringOrchestrator?.dispose()
  guidePanel?.dispose()
  chatPanel?.dispose()
  debugLogger?.dispose()
  credentials = undefined
}

// ── Command Implementations ──────────────────────────────────────────

async function startSession(
  context: vscode.ExtensionContext,
  secretStore: SecretStorage,
): Promise<void> {
  const workspaceRoot = getWorkspaceRoot()
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('TutorCode: Open a folder first.')
    return
  }

  // Multi-root workspace notice
  const folders = vscode.workspace.workspaceFolders
  if (folders && folders.length > 1) {
    vscode.window.showInformationMessage(
      `TutorCode is tracking the first workspace folder: ${folders[0]!.name}`,
    )
  }

  // Ensure state managers exist
  if (!sessionManager) {
    sessionManager = new SessionManager(workspaceRoot)
  }
  if (!projectIndexer) {
    projectIndexer = new ProjectIndexer(workspaceRoot)
  }

  try {
    // 1. Resolve credentials
    if (!credentials) {
      credentials = await resolveCredentials(context, secretStore)
      aiProvider = createProvider(credentials)
    }

    // 2. Capture goal
    const goal = await vscode.window.showInputBox({
      prompt: 'What do you want to build today?',
      placeHolder: 'e.g. A to-do app with Next.js and a PostgreSQL backend',
      ignoreFocusOut: true,
    })
    if (!goal) return

    // Vague goal check
    if (goal.split(/\s+/).length < 5) {
      const refined = await vscode.window.showInputBox({
        prompt: 'Can you be more specific? For example: "A REST API with Node.js and PostgreSQL" or "A React todo app with local storage".',
        value: goal,
        ignoreFocusOut: true,
      })
      if (!refined) return
      // Use the refined goal
      return await continueStartSession(context, refined, workspaceRoot)
    }

    await continueStartSession(context, goal, workspaceRoot)
  } catch (e) {
    const action = await errorHandler!.handleAPIError(e, 'start_session')
    if (action === 'notify_user') {
      vscode.window.showErrorMessage(
        `TutorCode: ${e instanceof Error ? e.message : String(e)}`,
      )
    } else if (action === 'retry') {
      // Clear cached creds and retry
      clearCredentialCache()
      credentials = undefined
      vscode.window.showErrorMessage(
        'TutorCode: Auth failed. Please try again.',
      )
    }
    statusBar?.showError('Session start failed')
  }
}

async function continueStartSession(
  context: vscode.ExtensionContext,
  goal: string,
  workspaceRoot: string,
): Promise<void> {
  // 3. Scan workspace
  statusBar!.showStep(0, 0, 'Scanning project...')
  await projectIndexer!.buildIndex()
  const index = projectIndexer!.getIndex()!

  // 4. Open chat panel for plan generation
  chatPanel = new ChatPanel(context)
  chatPanel.show()
  chatPanel.sendChatChunk('Analyzing your goal and workspace...', false)

  // 5. Classify workspace
  const workspaceState = await classifyWorkspace(workspaceRoot)

  // 6. Get settings
  const config = vscode.workspace.getConfiguration('tutorcode')
  const scaffoldingLevel = (config.get<number>('scaffoldingLevel') ?? 2) as ScaffoldingLevel

  // 7. Generate plan
  let planPrompt: string
  if (workspaceState === 'existing') {
    const treeStr = renderTreeAsText(index.tree)
    const keySummaries = Object.entries(index.keySummaries)
      .map(([p, s]) => `${p}: ${s.purpose}`)
      .join('\n')
    planPrompt = Prompts.existingScan({
      goal,
      detectedStack: JSON.stringify(index.detectedStack),
      fileTree: treeStr,
      keyFileContents: keySummaries || '(none)',
    })
  } else {
    planPrompt = Prompts.planGeneration({
      goal,
      scaffoldingLevel: String(scaffoldingLevel),
      workspaceState,
      detectedStack: JSON.stringify(index.detectedStack),
      existingFiles: '(empty workspace)',
    })
  }

  let plan: Plan
  try {
    const planJson = await aiProvider!.completeJSON<Record<string, unknown>>(
      [{ role: 'user', content: planPrompt }],
      { model: credentials!.guidanceModel, maxTokens: 4000 },
    )
    plan = validatePlan(planJson)
  } catch (firstErr) {
    // Retry once with explicit JSON instruction
    try {
      const retryPrompt = planPrompt + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences. No prose before or after the JSON object.'
      const planJson = await aiProvider!.completeJSON<Record<string, unknown>>(
        [{ role: 'user', content: retryPrompt }],
        { model: credentials!.guidanceModel, maxTokens: 4000 },
      )
      plan = validatePlan(planJson)
    } catch {
      chatPanel.sendChatChunk('\n\nFailed to generate a plan. Please try again.', true)
      statusBar?.showError('Plan generation failed')
      throw firstErr
    }
  }

  // 8. Build session object
  const session = createNewSession(goal, plan, credentials!, scaffoldingLevel)
  await sessionManager!.save(session)

  // 9. Display plan in chat panel
  chatPanel.displayPlan(plan)
  chatPanel.sendChatChunk('', true) // clear the loading message

  // 10. Wire plan suggestion/commit events
  wireChatPanelPlanEvents(session, context)

  debugLogger?.log('plan_generated', { goal, steps: plan.steps.length })
}

function createNewSession(
  goal: string,
  plan: Plan,
  creds: Credentials,
  scaffoldingLevel: ScaffoldingLevel,
): TutorSession {
  const config = vscode.workspace.getConfiguration('tutorcode')

  const settings: SessionSettings = {
    scaffoldingLevel,
    personality: 'mentor',
    avatar: 'default',
    cooldownSeconds: config.get<number>('cooldownSeconds') ?? null,
    maxHintsPerStep: null,
    autoNudgeMinutes: null,
  }

  const aiProviderConfig: AIProviderConfig = {
    provider: creds.provider,
    guidanceModel: creds.guidanceModel,
    monitorModel: creds.monitorModel,
    resolvedVia: creds.resolvedVia,
  }

  const progress: Progress = {
    currentStepId: plan.steps[0]?.id ?? '',
    completedStepIds: [],
    percentComplete: 0,
    hintsUsedThisStep: 0,
    consecutiveHintlessSteps: 0,
    consecutiveMaxHintSteps: 0,
  }

  return {
    version: '1.0',
    goal,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'planning',
    aiProvider: aiProviderConfig,
    settings,
    plan,
    progress,
    actionHistory: [],
  }
}

// ── Plan Suggestion Loop ─────────────────────────────────────────────

function wireChatPanelPlanEvents(
  session: TutorSession,
  context: vscode.ExtensionContext,
): void {
  disposePlanListeners()

  // Plan suggestion
  const suggestionDisp = chatPanel!.onPlanSuggestion(async (suggestion: string) => {
    try {
      const planSteps = session.plan.steps
        .map((s) => `${s.number}. ${s.title}: ${s.description}`)
        .join('\n')
      const revised = await aiProvider!.completeJSON<Record<string, unknown>>(
        [{ role: 'user', content: Prompts.planRevision({ planSteps, userSuggestion: suggestion }) }],
        { model: credentials!.guidanceModel, maxTokens: 4000 },
      )
      session.plan = validatePlan(revised)
      session.plan.revisionCount += 1
      await sessionManager!.save(session)
      chatPanel!.displayPlan(session.plan)
    } catch (e) {
      const action = await errorHandler!.handleAPIError(e, 'plan_revision')
      if (action === 'notify_user') {
        chatPanel?.sendChatChunk('Failed to revise plan. Please try again.', true)
      }
    }
  })
  planListenerDisposables.push(suggestionDisp)

  // Plan committed — enter guidance mode
  const commitDisp = chatPanel!.onPlanCommit(async () => {
    session.plan.committedAt = new Date().toISOString()
    session.status = 'active'
    await sessionManager!.save(session)
    disposePlanListeners()
    await enterGuidanceMode(session, context)
  })
  planListenerDisposables.push(commitDisp)
}

function disposePlanListeners(): void {
  for (const d of planListenerDisposables) {
    d.dispose()
  }
  planListenerDisposables = []
}

// ── Guidance Mode ────────────────────────────────────────────────────

async function enterGuidanceMode(
  session: TutorSession,
  context: vscode.ExtensionContext,
): Promise<void> {
  // 1. Set context key
  await vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', true)

  // 2. Open guide panel
  guidePanel = new GuidePanel(context)
  guidePanel.show()

  // 3. Update status bar
  const step = sessionManager!.getCurrentStep(session)
  if (!step) return

  statusBar!.showStep(step.number, session.plan.steps.length, step.title)

  // 4. Generate opening message
  let opening: string
  try {
    const cached = getOrCreateTier3Prefix(session)
    const userContent = Prompts.stepGuidance({
      stepNumber: String(step.number),
      total: String(session.plan.steps.length),
      stepTitle: step.title,
      stepDescription: step.description,
      stepGuidance: step.guidance,
      lastAction: 'none',
    })
    opening = await aiProvider!.complete(
      [...cached.contextMessages, { role: 'user', content: userContent }],
      { model: credentials!.guidanceModel, maxTokens: 200, system: cached.system },
    )
    if (!opening || !opening.trim()) {
      opening = fallbackGuidance(step, 'step_start')
    }
  } catch {
    opening = fallbackGuidance(step, 'step_start')
  }

  guidePanel.sendStep(step, session.plan.steps.length)
  guidePanel.sendCharacterMessage(opening, 'neutral')

  // 5. Wire guide panel events
  wireGuidePanelEvents(session, context)

  // 6. Start monitoring
  const workspaceRoot = getWorkspaceRoot()
  if (workspaceRoot) {
    promptCache = new PromptCache()
    const index = projectIndexer!.getIndex()!
    tierEvaluator = new TierEvaluator(aiProvider!, promptCache, session, index)
    monitoringOrchestrator = new MonitoringOrchestrator(workspaceRoot)
    monitoringListenerDisposable = monitoringOrchestrator.onMonitoringEvent(
      (event) => handleMonitoringEvent(event, session),
    )
    monitoringOrchestrator.start()
  }

  // 7. Start nudge timer
  startNudgeTimer(session)

  // 8. Reset chat history
  chatHistory = []

  debugLogger?.log('guidance_mode_entered', { step: step.number })
}

function getOrCreateTier3Prefix(session: TutorSession) {
  if (!promptCache) {
    promptCache = new PromptCache()
  }
  const index = projectIndexer!.getIndex()!
  return promptCache.buildTier3Prefix(
    session,
    index,
    session.settings.personality,
    session.settings.scaffoldingLevel,
  )
}

// ── Monitoring Event Handler ─────────────────────────────────────────

async function handleMonitoringEvent(
  event: MonitoringEvent,
  session: TutorSession,
): Promise<void> {
  recordActivity()

  // Cooldown check
  if (!canInterrupt(session.settings)) return

  const step = sessionManager!.getCurrentStep(session)
  if (!step) return

  try {
    const result = await tierEvaluator!.evaluate(event, step)

    // Log action
    await sessionManager!.appendAction({
      timestamp: new Date().toISOString(),
      type: event.type as 'file_save' | 'file_create' | 'file_delete' | 'terminal_command' | 'diagnostic_change',
      description: describeEvent(event),
      stepId: step.id,
      evaluationResult: result.status,
    })

    debugLogger?.log('evaluation', {
      tier: result.tier,
      status: result.status,
      event: event.type,
    })

    if (result.status === 'on_track') return // silent

    if (result.status === 'step_complete') {
      await handleStepComplete(session, step)
    } else {
      const mood = result.status === 'major_drift' ? 'warn' as const : 'neutral' as const
      const message = result.message || fallbackGuidance(step, result.status)
      guidePanel?.sendCharacterMessage(message, mood)
      recordInterruption()

      if (result.status === 'major_drift') {
        statusBar?.showError('Off track')
      }
    }
  } catch (e) {
    // AI call failed during monitoring — use fallback
    const action = await errorHandler!.handleAPIError(e, 'monitoring_evaluation')
    if (action === 'fallback') {
      const category = event.type === 'terminal_cmd' ? 'terminal_cmd' : 'file_create'
      guidePanel?.sendCharacterMessage(fallbackGuidance(step, category), 'neutral')
      recordInterruption()
    }
    debugLogger?.log('monitoring_error', { error: String(e) })
  }
}

// ── Step Completion ──────────────────────────────────────────────────

async function handleStepComplete(session: TutorSession, step: Step): Promise<void> {
  try {
    const cached = getOrCreateTier3Prefix(session)
    const userContent = Prompts.stepCompleteConfirm({
      stepNumber: String(step.number),
      stepTitle: step.title,
      completionCriteria: step.completionCriteria,
      currentFiles: step.expectedFiles.join(', '),
      terminalHistory: 'See recent actions above',
      activeErrors: '0',
    })

    const confirmRaw = await aiProvider!.completeJSON<Record<string, unknown>>(
      [...cached.contextMessages, { role: 'user', content: userContent }],
      { model: credentials!.guidanceModel, maxTokens: 300, system: cached.system },
    )

    const confirmed = confirmRaw.confirmed as boolean
    const message = (confirmRaw.message as string) || ''

    if (!confirmed) {
      guidePanel?.sendCharacterMessage(message || 'Not quite done yet -- keep going!', 'neutral')
      recordInterruption()
      return
    }

    // Mark complete
    await sessionManager!.updateProgress(step.id, 'complete')
    session = (await sessionManager!.load())!

    guidePanel?.sendCharacterMessage(message || 'Great work on that step!', 'praise')
    recordInterruption()

    // Check milestone
    const milestone = session.plan.milestones.find((m) => m.afterStep === step.number)
    if (milestone) {
      setTimeout(() => {
        guidePanel?.sendCharacterMessage(milestone.celebrationMessage, 'praise')
      }, 4000)
    }

    // Check adaptive level suggestion
    checkAdaptiveLevelSuggestion(session)

    debugLogger?.log('step_complete', { step: step.number })
  } catch {
    // Fallback: just mark it and move on
    guidePanel?.sendCharacterMessage(
      `Step ${step.number} looks done. Click [Got it] when you're ready to move on.`,
      'praise',
    )
    recordInterruption()
  }
}

// ── Adaptive Level Suggestions ───────────────────────────────────────

function checkAdaptiveLevelSuggestion(session: TutorSession): void {
  // Only one suggestion per session
  if (session.progress.lastLevelSuggestionAt) return

  const level = session.settings.scaffoldingLevel

  // Suggest level up
  if (session.progress.consecutiveHintlessSteps >= 3 && level < 3) {
    session.progress.lastLevelSuggestionAt = new Date().toISOString()
    const nextLevel = level + 1
    setTimeout(() => {
      guidePanel?.sendCharacterMessage(
        `You haven't needed a hint in a while -- you might be ready for Level ${nextLevel}. Want to try it?`,
        'praise',
      )
    }, 6000)
  }

  // Suggest level down
  if (session.progress.consecutiveMaxHintSteps >= 3 && level > 1) {
    session.progress.lastLevelSuggestionAt = new Date().toISOString()
    const prevLevel = level - 1
    setTimeout(() => {
      guidePanel?.sendCharacterMessage(
        `These steps have been tough -- no shame in getting more support. Want to switch to Level ${prevLevel}?`,
        'neutral',
      )
    }, 6000)
  }
}

// ── Guide Panel Event Wiring ─────────────────────────────────────────

function wireGuidePanelEvents(
  session: TutorSession,
  context: vscode.ExtensionContext,
): void {
  disposeGuideListeners()

  // Got it → advance to next step
  const gotItDisp = guidePanel!.onGotIt(async () => {
    recordActivity()
    let currentSession = (await sessionManager!.load())!
    const currentStep = sessionManager!.getCurrentStep(currentSession)

    // If current step is not complete yet, mark it complete
    if (currentStep && currentStep.status === 'active') {
      await sessionManager!.updateProgress(currentStep.id, 'complete')
      currentSession = (await sessionManager!.load())!

      // Track consecutive hintless steps
      if (currentSession.progress.hintsUsedThisStep === 0) {
        currentSession.progress.consecutiveHintlessSteps += 1
        currentSession.progress.consecutiveMaxHintSteps = 0
      } else {
        currentSession.progress.consecutiveHintlessSteps = 0
        const maxHints = getMaxHints(currentSession.settings)
        if (currentSession.progress.hintsUsedThisStep >= maxHints) {
          currentSession.progress.consecutiveMaxHintSteps += 1
        } else {
          currentSession.progress.consecutiveMaxHintSteps = 0
        }
      }
      await sessionManager!.save(currentSession)
    }

    const next = sessionManager!.getNextStep(currentSession)
    if (!next) {
      await completeSession(currentSession)
      return
    }

    await sessionManager!.updateProgress(next.id, 'active')
    currentSession = (await sessionManager!.load())!

    statusBar!.showStep(next.number, currentSession.plan.steps.length, next.title)

    // Generate step guidance message
    let msg: string
    try {
      const cached = getOrCreateTier3Prefix(currentSession)
      const lastAction = currentSession.actionHistory.length > 0
        ? currentSession.actionHistory[currentSession.actionHistory.length - 1]!.description
        : 'none'

      const userContent = Prompts.stepGuidance({
        stepNumber: String(next.number),
        total: String(currentSession.plan.steps.length),
        stepTitle: next.title,
        stepDescription: next.description,
        stepGuidance: next.guidance,
        lastAction,
      })

      msg = await aiProvider!.complete(
        [...cached.contextMessages, { role: 'user', content: userContent }],
        { model: credentials!.guidanceModel, maxTokens: 200, system: cached.system },
      )
      if (!msg || !msg.trim()) {
        msg = fallbackGuidance(next, 'step_start')
      }
    } catch {
      msg = fallbackGuidance(next, 'step_start')
    }

    guidePanel!.sendStep(next, currentSession.plan.steps.length)
    guidePanel!.sendCharacterMessage(msg, 'neutral')

    // Update tier evaluator with new session state
    if (tierEvaluator) {
      const index = projectIndexer!.getIndex()!
      promptCache?.invalidate()
      tierEvaluator = new TierEvaluator(aiProvider!, promptCache!, currentSession, index)
    }

    // Check adaptive level suggestion
    checkAdaptiveLevelSuggestion(currentSession)
  })
  guideListenerDisposables.push(gotItDisp)

  // Need hint
  const hintDisp = guidePanel!.onNeedHint(async () => {
    recordActivity()
    const currentSession = (await sessionManager!.load())!
    const step = sessionManager!.getCurrentStep(currentSession)
    if (!step) return

    const maxHints = getMaxHints(currentSession.settings)
    const hintsUsed = currentSession.progress.hintsUsedThisStep

    try {
      const result = await tierEvaluator!.requestHint(step, hintsUsed, maxHints)
      let hint = result.message || ''

      if (!hint.trim()) {
        // Retry once
        const retry = await tierEvaluator!.requestHint(step, hintsUsed, maxHints)
        hint = retry.message || ''
      }

      if (!hint.trim()) {
        hint = 'I\'m having trouble generating a hint right now. Try reviewing the step description for clues.'
      }

      guidePanel!.sendCharacterMessage(hint, 'neutral')
      recordInterruption()

      // Update hint count
      currentSession.progress.hintsUsedThisStep = hintsUsed + 1
      await sessionManager!.save(currentSession)
    } catch {
      guidePanel!.sendCharacterMessage(
        'I\'m having trouble generating a hint right now. Try reviewing the step description for clues.',
        'neutral',
      )
      recordInterruption()
    }

    debugLogger?.log('hint_requested', { step: step.number, hintsUsed: hintsUsed + 1 })
  })
  guideListenerDisposables.push(hintDisp)

  // Pause
  const pauseDisp = guidePanel!.onPause((minutes: number) => {
    if (monitoringOrchestrator) {
      if (minutes === 0) {
        // "Until I say so" — use a very large number
        monitoringOrchestrator.pause(60 * 24) // 24 hours
      } else {
        monitoringOrchestrator.pause(minutes)
      }
    }
    statusBar?.showPaused()
    const msg = minutes === 0
      ? 'Take your time -- I\'ll be here when you\'re ready.'
      : `No problem -- I'll check back in ${minutes} minutes.`
    guidePanel?.sendCharacterMessage(msg, 'neutral')
    stopNudgeTimer()
  })
  guideListenerDisposables.push(pauseDisp)

  // Toggle
  const toggleDisp = guidePanel!.onToggle(() => {
    toggleMode()
  })
  guideListenerDisposables.push(toggleDisp)
}

function disposeGuideListeners(): void {
  for (const d of guideListenerDisposables) {
    d.dispose()
  }
  guideListenerDisposables = []
}

// ── Toggle Mode ──────────────────────────────────────────────────────

async function toggleMode(): Promise<void> {
  const inGuideMode = guidePanel?.isVisible() ?? false

  if (inGuideMode) {
    // Switch to chat mode
    if (!chatPanel) {
      const context = (guidePanel as any)?.context as vscode.ExtensionContext
      if (context) {
        chatPanel = new ChatPanel(context)
      }
    }
    chatPanel?.show()
    guidePanel?.hide()

    // Wire chat events if needed
    const currentSession = await sessionManager?.load()
    if (currentSession && chatPanel) {
      wireChatModeEvents(currentSession)
    }
  } else {
    // Switch to guide mode — generate re-entry message
    const currentSession = await sessionManager?.load()
    if (currentSession) {
      const step = sessionManager!.getCurrentStep(currentSession)
      if (step) {
        let msg = ''
        try {
          // Only generate re-entry message for levels 1 and 2
          if (currentSession.settings.scaffoldingLevel < 3) {
            const cached = getOrCreateTier3Prefix(currentSession)
            const lastAction = currentSession.actionHistory.length > 0
              ? currentSession.actionHistory[currentSession.actionHistory.length - 1]!.description
              : 'none'

            const userContent = Prompts.reentry({
              stepNumber: String(step.number),
              stepTitle: step.title,
              recentChatSummary: chatHistory.length > 0
                ? chatHistory.slice(-2).map((m) => `${m.role}: ${m.content}`).join('\n')
                : 'No recent chat',
              lastAction,
            })

            msg = await aiProvider!.complete(
              [...cached.contextMessages, { role: 'user', content: userContent }],
              { model: credentials!.guidanceModel, maxTokens: 200, system: cached.system },
            )
          }
        } catch {
          // fallback: no re-entry message
        }

        if (msg && msg.trim()) {
          guidePanel?.sendCharacterMessage(msg, 'neutral')
        }
      }
    }

    guidePanel?.show()
    chatPanel?.hide()
  }
}

// ── Chat Mode Events ─────────────────────────────────────────────────

function wireChatModeEvents(session: TutorSession): void {
  if (!chatPanel) return

  const sendDisp = chatPanel.onChatSend(async (text: string) => {
    recordActivity()
    chatHistory.push({ role: 'user', content: text })

    const step = sessionManager!.getCurrentStep(session)
    if (!step) return

    try {
      const messages = chatHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      let fullResponse = ''
      for await (const chunk of tierEvaluator!.chat(messages, step)) {
        chatPanel!.sendChatChunk(chunk, false)
        fullResponse += chunk
      }
      chatPanel!.sendChatChunk('', true)

      chatHistory.push({ role: 'assistant', content: fullResponse })
      // Keep only last 12 messages (6 exchanges)
      if (chatHistory.length > 12) {
        chatHistory = chatHistory.slice(-12)
      }
    } catch {
      chatPanel!.sendChatChunk(
        'I\'m having trouble responding right now. Try again in a moment.',
        true,
      )
    }
  })

  const chatToggleDisp = chatPanel.onToggle(() => {
    toggleMode()
  })

  // These are managed separately since chat mode can be entered/exited multiple times
  // We store them but don't track them in guideListenerDisposables
  planListenerDisposables.push(sendDisp, chatToggleDisp)
}

// ── Pause Session ────────────────────────────────────────────────────

async function pauseSession(): Promise<void> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: '5 minutes', value: 5 },
      { label: '15 minutes', value: 15 },
      { label: 'Until I say so', value: 0 },
    ],
    { placeHolder: 'How long should I pause?' },
  )

  if (!choice) return

  const minutes = (choice as { label: string; value: number }).value
  if (monitoringOrchestrator) {
    if (minutes === 0) {
      monitoringOrchestrator.pause(60 * 24)
    } else {
      monitoringOrchestrator.pause(minutes)
    }
  }
  statusBar?.showPaused()
  stopNudgeTimer()
}

// ── Revise Plan ──────────────────────────────────────────────────────

async function revisePlan(
  context: vscode.ExtensionContext,
  secretStore: SecretStorage,
): Promise<void> {
  const session = await sessionManager?.load()
  if (!session || session.status !== 'active') {
    vscode.window.showInformationMessage('TutorCode: No active session to revise.')
    return
  }

  // Stop monitoring during plan revision
  monitoringOrchestrator?.stop()

  // Show chat panel in plan suggestion mode
  if (!chatPanel) {
    chatPanel = new ChatPanel(context)
  }
  chatPanel.show()
  chatPanel.displayPlan(session.plan)

  // Wire plan events for revision
  wireChatPanelPlanEvents(session, context)
}

// ── Reindex Project ──────────────────────────────────────────────────

async function reindexProject(): Promise<void> {
  if (!projectIndexer) {
    vscode.window.showInformationMessage('TutorCode: No workspace open.')
    return
  }

  statusBar?.showStep(0, 0, 'Re-scanning project...')
  await projectIndexer.buildIndex()
  promptCache?.invalidate()

  const session = await sessionManager?.load()
  if (session) {
    statusBar?.showStep(
      sessionManager!.getCurrentStep(session)?.number ?? 0,
      session.plan.steps.length,
      sessionManager!.getCurrentStep(session)?.title ?? '',
    )
  } else {
    statusBar?.showIdle()
  }

  vscode.window.showInformationMessage('TutorCode: Project re-scanned.')
}

// ── Abandon Session ──────────────────────────────────────────────────

async function abandonSession(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'TutorCode: Abandon current session? This cannot be undone.',
    { modal: true },
    'Abandon',
  )

  if (confirm !== 'Abandon') return

  const session = await sessionManager?.load()
  if (session) {
    session.status = 'abandoned'
    await sessionManager!.save(session)
  }

  // Clean up everything
  monitoringOrchestrator?.stop()
  stopNudgeTimer()
  disposePlanListeners()
  disposeGuideListeners()
  monitoringListenerDisposable?.dispose()

  guidePanel?.hide()
  chatPanel?.hide()

  statusBar?.showIdle()
  await vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', false)

  debugLogger?.log('session_abandoned', {})
}

// ── Complete Session ─────────────────────────────────────────────────

async function completeSession(session: TutorSession): Promise<void> {
  session.status = 'complete'
  await sessionManager!.save(session)

  monitoringOrchestrator?.stop()
  stopNudgeTimer()

  statusBar?.showComplete()
  guidePanel?.sendCharacterMessage(
    'You did it! The project is complete. Take a moment to appreciate what you built.',
    'praise',
  )
  guidePanel?.sendMessage({ type: 'session_complete' })

  await vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', false)

  debugLogger?.log('session_complete', { goal: session.goal })
}

// ── Resume Session ───────────────────────────────────────────────────

async function resumeSession(
  session: TutorSession,
  context: vscode.ExtensionContext,
): Promise<void> {
  const secretStore = new SecretStorage(context.secrets)

  try {
    credentials = await resolveCredentials(context, secretStore)
    aiProvider = createProvider(credentials)
  } catch {
    vscode.window.showErrorMessage('TutorCode: Could not resolve credentials for session resume.')
    return
  }

  if (projectIndexer) {
    await projectIndexer.buildIndex()
  }

  await enterGuidanceMode(session, context)
}

// ── Tree Rendering Helper ────────────────────────────────────────────

function renderTreeAsText(tree: Array<{ name: string; path: string; type: string; children?: unknown[]; ignored: boolean }>): string {
  const lines: string[] = []
  const walk = (nodes: typeof tree, indent: string): void => {
    for (const node of nodes) {
      if (node.ignored) {
        lines.push(`${indent}${node.name}/ (ignored)`)
      } else if (node.type === 'directory') {
        lines.push(`${indent}${node.name}/`)
        if (node.children && Array.isArray(node.children)) {
          walk(node.children as typeof tree, indent + '  ')
        }
      } else {
        lines.push(`${indent}${node.name}`)
      }
    }
  }
  walk(tree, '  ')
  return lines.join('\n')
}
