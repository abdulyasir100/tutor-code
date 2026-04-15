import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { TutorSession, Step, StepStatus, ActionEntry } from './types'

export class SessionManager {
  private readonly sessionPath: string
  private readonly workspaceRoot: string

  private readonly _onSessionChange = new vscode.EventEmitter<TutorSession>()
  public readonly onSessionChange = this._onSessionChange.event

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
    this.sessionPath = path.join(workspaceRoot, '.vscode', 'tutorcode.json')
  }

  async load(): Promise<TutorSession | null> {
    try {
      const raw = await fs.promises.readFile(this.sessionPath, 'utf-8')
      return JSON.parse(raw) as TutorSession
    } catch {
      return null
    }
  }

  async save(session: TutorSession): Promise<void> {
    session.updatedAt = new Date().toISOString()

    const dir = path.dirname(this.sessionPath)
    await fs.promises.mkdir(dir, { recursive: true })

    // Atomic write: write to tmp, then rename
    const tmpPath = this.sessionPath + '.tmp'
    await fs.promises.writeFile(tmpPath, JSON.stringify(session, null, 2), 'utf-8')
    await fs.promises.rename(tmpPath, this.sessionPath)

    await this.ensureGitignore()
    this._onSessionChange.fire(session)
  }

  async updateProgress(stepId: string, status: StepStatus): Promise<void> {
    const session = await this.load()
    if (!session) { return }

    const step = session.plan.steps.find(s => s.id === stepId)
    if (!step) { return }

    step.status = status

    if (status === 'active' && !step.startedAt) {
      step.startedAt = new Date().toISOString()
    }
    if (status === 'complete') {
      step.completedAt = new Date().toISOString()
    }

    // Update progress fields
    session.progress.currentStepId = stepId
    session.progress.completedStepIds = session.plan.steps
      .filter(s => s.status === 'complete')
      .map(s => s.id)

    const total = session.plan.steps.length
    const completed = session.progress.completedStepIds.length
    session.progress.percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0

    // Reset hints on step change
    if (status === 'active') {
      session.progress.hintsUsedThisStep = 0
    }

    await this.save(session)
  }

  async appendAction(entry: ActionEntry): Promise<void> {
    const session = await this.load()
    if (!session) { return }

    session.actionHistory.push(entry)

    // Trim to last 20
    if (session.actionHistory.length > 20) {
      session.actionHistory = session.actionHistory.slice(-20)
    }

    await this.save(session)
  }

  getCurrentStep(session: TutorSession): Step | null {
    return session.plan.steps.find(s => s.status === 'active') ?? null
  }

  getNextStep(session: TutorSession): Step | null {
    return session.plan.steps.find(s => s.status === 'pending') ?? null
  }

  isComplete(session: TutorSession): boolean {
    return session.plan.steps.every(s => s.status === 'complete' || s.status === 'skipped')
  }

  private async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore')
    const entries = [
      '.vscode/tutorcode.json',
      '.vscode/tutorcode-index.json',
    ]

    let content = ''
    try {
      content = await fs.promises.readFile(gitignorePath, 'utf-8')
    } catch {
      // .gitignore does not exist — will create
    }

    const missing = entries.filter(e => !content.includes(e))
    if (missing.length === 0) { return }

    const block = (content.length > 0 ? '\n' : '') +
      '# TutorCode\n' +
      missing.join('\n') +
      '\n'

    await fs.promises.writeFile(gitignorePath, content + block, 'utf-8')
  }

  dispose(): void {
    this._onSessionChange.dispose()
  }
}
