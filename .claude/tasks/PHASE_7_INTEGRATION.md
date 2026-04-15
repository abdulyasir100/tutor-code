# Phase 7 — Integration

## Goal
Wire every module into `extension.ts`. By end of this phase, a complete session
works end-to-end: goal → plan → guide mode → step monitoring → step advance.
No stubs remaining in extension.ts.

## Read First
- `docs/ARCHITECTURE.md` — data flow and state machine
- `docs/EXISTING_PROJECTS.md` — scan flow

---

## extension.ts — Full Implementation

### Module Instances (singletons per activation)

```typescript
let sessionManager: SessionManager
let projectIndexer: ProjectIndexer
let monitoringOrchestrator: MonitoringOrchestrator
let tierEvaluator: TierEvaluator
let promptCache: PromptCache
let aiProvider: AIProvider
let guidePanel: GuidePanel | undefined
let chatPanel: ChatPanel | undefined
let statusBar: TutorStatusBar
let credentials: Credentials | undefined

// Cooldown state
let lastInterruptionAt = 0
```

---

### activate()

```typescript
export async function activate(context: vscode.ExtensionContext) {
  // 1. Init status bar (always visible)
  statusBar = new TutorStatusBar()
  context.subscriptions.push(statusBar)

  // 2. Init state managers
  sessionManager = new SessionManager(context)
  projectIndexer = new ProjectIndexer(context)

  // 3. Check for existing session
  const existing = await sessionManager.load()
  if (existing && existing.status === 'active') {
    const resume = await vscode.window.showInformationMessage(
      `TutorCode: Resume "${existing.goal}"?`,
      'Resume', 'Start Fresh', 'Dismiss'
    )
    if (resume === 'Resume') await resumeSession(existing, context)
    else if (resume === 'Start Fresh') await sessionManager.abandon()
  }

  // 4. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('tutorcode.start',      () => startSession(context)),
    vscode.commands.registerCommand('tutorcode.toggle',     () => toggleMode()),
    vscode.commands.registerCommand('tutorcode.pause',      () => pauseSession()),
    vscode.commands.registerCommand('tutorcode.revisePlan', () => revisePlan()),
    vscode.commands.registerCommand('tutorcode.reindex',    () => projectIndexer.buildIndex()),
    vscode.commands.registerCommand('tutorcode.abandon',    () => abandonSession()),
  )

  // 5. Set initial context key
  vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', false)
}
```

---

### startSession()

```typescript
async function startSession(context: vscode.ExtensionContext) {
  // 1. Resolve credentials (cached after first call)
  if (!credentials) {
    credentials = await resolveCredentials(context)
    aiProvider = createProvider(credentials)
  }

  // 2. Capture goal
  const goal = await vscode.window.showInputBox({
    prompt: 'What do you want to build today?',
    placeHolder: 'e.g. A to-do app with Next.js and a PostgreSQL backend',
    ignoreFocusOut: true,
  })
  if (!goal) return

  // 3. Scan workspace
  statusBar.showStep(0, 0, 'Scanning project...')
  await projectIndexer.buildIndex()
  const index = projectIndexer.getIndex()!

  // 4. Open chat panel for plan generation phase
  chatPanel = ChatPanel.createOrShow(context)
  chatPanel.sendChatChunk('Analyzing your goal and workspace...', false)

  // 5. Generate plan (one-shot)
  const workspaceState = classifyWorkspace(index)
  const planPrompt = workspaceState === 'existing'
    ? Prompts.existingScan({ goal, index })
    : Prompts.planGeneration({ goal, index })

  const planJson = await aiProvider.completeJSON(
    [{ role: 'user', content: planPrompt }],
    { model: credentials.guidanceModel, maxTokens: 4000 }
  )
  const plan = validatePlan(planJson)  // throws if invalid, retries once

  // 6. Display plan in chat panel (suggestion loop)
  const session = sessionManager.createNew(goal, plan, credentials)
  await sessionManager.save(session)

  chatPanel.displayPlan(plan)
  // User submits suggestions or commits — handled by chatPanel event listeners below
  wireChaPanelPlanEvents(session, context)
}
```

---

### wireChatPanelPlanEvents()

```typescript
function wireChatPanelPlanEvents(session: TutorSession, context: vscode.ExtensionContext) {
  // Suggestion submitted
  chatPanel!.onPlanSuggestion.event(async (suggestion) => {
    const revised = await aiProvider.completeJSON(
      [{ role: 'user', content: Prompts.planRevision({ plan: session.plan, suggestion }) }],
      { model: credentials!.guidanceModel, maxTokens: 2000 }
    )
    session.plan = validatePlan(revised)
    await sessionManager.save(session)
    chatPanel!.displayPlan(session.plan)
  })

  // Plan committed — enter guidance mode
  chatPanel!.onPlanCommit.event(async () => {
    session.plan.committedAt = new Date().toISOString()
    session.status = 'active'
    await sessionManager.save(session)
    await enterGuidanceMode(session, context)
  })
}
```

---

### enterGuidanceMode()

```typescript
async function enterGuidanceMode(session: TutorSession, context: vscode.ExtensionContext) {
  // 1. Set VSCode context key for keybinding
  vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', true)

  // 2. Open guide panel
  guidePanel = GuidePanel.createOrShow(context)

  // 3. Update status bar
  const step = sessionManager.getCurrentStep(session)!
  statusBar.showStep(step.number, session.plan.steps.length, step.title)

  // 4. Generate opening message for first step
  const opening = await aiProvider.complete(
    [{ role: 'user', content: Prompts.stepGuidance({ step, total: session.plan.steps.length }) }],
    { model: credentials!.guidanceModel, maxTokens: 200 }
  )
  guidePanel.sendStep(step, session.plan.steps.length)
  guidePanel.sendCharacterMessage(opening, 'neutral')

  // 5. Wire guide panel button events
  wireGuidePanelEvents(session, context)

  // 6. Start monitoring
  promptCache = new PromptCache()
  tierEvaluator = new TierEvaluator(aiProvider, promptCache)
  monitoringOrchestrator = new MonitoringOrchestrator(context)
  monitoringOrchestrator.onEvent.event((event) => handleMonitoringEvent(event, session))
  monitoringOrchestrator.start(session)
}
```

---

### handleMonitoringEvent()

```typescript
async function handleMonitoringEvent(event: MonitoringEvent, session: TutorSession) {
  // Cooldown check
  const config = vscode.workspace.getConfiguration('tutorcode')
  const cooldownMs = (config.get<number>('cooldownSeconds') ?? 30) * 1000
  if (Date.now() - lastInterruptionAt < cooldownMs) return

  const step = sessionManager.getCurrentStep(session)
  if (!step) return

  const index = projectIndexer.getIndex()!
  const result = await tierEvaluator.evaluate(event, step, index, [])

  // Log action
  await sessionManager.appendAction({
    timestamp: new Date().toISOString(),
    type: event.type,
    description: describeEvent(event),
    stepId: step.id,
    evaluationResult: result.status,
  })

  if (result.status === 'on_track') return  // silent

  // Interrupt — show in guide panel character
  if (result.status === 'step_complete') {
    await handleStepComplete(session, step)
  } else {
    const mood = result.status === 'major_drift' ? 'warn' : 'neutral'
    guidePanel?.sendCharacterMessage(result.message!, mood)
    lastInterruptionAt = Date.now()
  }
}
```

---

### handleStepComplete()

```typescript
async function handleStepComplete(session: TutorSession, step: Step) {
  // Tier 3 confirmation
  const confirm = await aiProvider.completeJSON(
    [{ role: 'user', content: Prompts.stepCompleteConfirm({ step, session, index: projectIndexer.getIndex()! }) }],
    { model: credentials!.guidanceModel, maxTokens: 300 }
  )

  if (!confirm.confirmed) {
    guidePanel?.sendCharacterMessage(confirm.message, 'neutral')
    lastInterruptionAt = Date.now()
    return
  }

  // Mark complete, show celebration
  await sessionManager.updateProgress(step.id, 'complete')
  guidePanel?.sendCharacterMessage(confirm.message, 'praise')
  lastInterruptionAt = Date.now()

  // Check milestone
  const milestone = session.plan.milestones.find(m => m.afterStep === step.number)
  if (milestone) {
    setTimeout(() => {
      guidePanel?.sendCharacterMessage(milestone.celebrationMessage, 'praise')
    }, 4000)
  }

  // Auto-advance to next step after 3s (with [Got it] button)
  // Advance happens when user clicks [Got it] — handled in wireGuidePanelEvents
}
```

---

### wireGuidePanelEvents()

```typescript
function wireGuidePanelEvents(session: TutorSession, context: vscode.ExtensionContext) {
  guidePanel!.onGotIt.event(async () => {
    const next = sessionManager.getNextStep(session)
    if (!next) {
      await completeSession(session)
      return
    }
    session = (await sessionManager.load())!
    await sessionManager.updateProgress(next.id, 'active')
    session = (await sessionManager.load())!

    statusBar.showStep(next.number, session.plan.steps.length, next.title)
    const msg = await aiProvider.complete(
      [{ role: 'user', content: Prompts.stepGuidance({ step: next, total: session.plan.steps.length }) }],
      { model: credentials!.guidanceModel, maxTokens: 200 }
    )
    guidePanel!.sendStep(next, session.plan.steps.length)
    guidePanel!.sendCharacterMessage(msg, 'neutral')
  })

  guidePanel!.onNeedHint.event(async () => {
    const step = sessionManager.getCurrentStep(session)!
    const hintCount = countHintsThisStep(session, step.id)
    const hint = await aiProvider.complete(
      [{ role: 'user', content: Prompts.hintRequest({ step, session, hintCount }) }],
      { model: credentials!.guidanceModel, maxTokens: 200 }
    )
    guidePanel!.sendCharacterMessage(hint, 'neutral')
    lastInterruptionAt = Date.now()
  })

  guidePanel!.onPause.event((minutes) => {
    monitoringOrchestrator.pause(minutes)
    statusBar.showPaused()
    guidePanel!.sendCharacterMessage(
      minutes === 0 ? "Take your time — I'll be here when you're ready." : `No problem — I'll check back in ${minutes} minutes.`,
      'neutral'
    )
  })

  guidePanel!.onToggle.event(() => toggleMode())
}
```

---

### toggleMode()

```typescript
function toggleMode() {
  const currentMode = chatPanel?.visible ? 'chat' : 'guide'
  if (currentMode === 'guide') {
    chatPanel?.show()
    guidePanel?.hide()
  } else {
    // Generate re-entry message then switch
    generateReentryMessage().then(msg => {
      guidePanel?.sendCharacterMessage(msg, 'neutral')
      guidePanel?.show()
      chatPanel?.hide()
    })
  }
}
```

---

### resumeSession()

```typescript
async function resumeSession(session: TutorSession, context: vscode.ExtensionContext) {
  credentials = await resolveCredentials(context)
  aiProvider = createProvider(credentials)
  await projectIndexer.buildIndex()
  await enterGuidanceMode(session, context)
}
```

---

## Verification

Full walkthrough test:
1. Open empty folder in VSCode
2. Run `TutorCode: Start Session`
3. Enter goal: "Build a Next.js to-do app"
4. Plan appears in chat panel with mermaid diagram and steps
5. Type a suggestion, see steps update
6. Click "Commit Plan"
7. Guide panel opens, Step 1 message visible
8. Run `npx create-next-app` in terminal → monitoring detects it
9. Character shows "Step 1 might be done — ready to move on?"
10. Click [Got it] → Step 2 message appears
11. Click [Need a hint] → Socratic hint appears (no code)
12. Click [Chat ↗] → chat panel opens, input box visible
13. Type a question → AI responds (Socratically, no code)
14. Click [Guide ↙] → guide panel returns with re-entry message
