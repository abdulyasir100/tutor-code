import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export class DebugLogger {
  private logPath: string
  private enabled: boolean
  private initialized = false

  constructor(private readonly workspaceRoot: string) {
    this.logPath = path.join(workspaceRoot, '.vscode', 'tutorcode-debug.log')
    this.enabled = vscode.workspace
      .getConfiguration('tutorcode')
      .get<boolean>('debugMode', false)
  }

  log(eventType: string, data: Record<string, unknown>): void {
    if (!this.enabled) {
      return
    }

    if (!this.initialized) {
      this.ensureLogDir()
      this.initialized = true
    }

    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] ${eventType} ${JSON.stringify(data)}\n`

    try {
      fs.appendFileSync(this.logPath, line, 'utf-8')
    } catch {
      // Silently ignore write failures — debug logging should never break the extension
    }
  }

  private ensureLogDir(): void {
    const dir = path.dirname(this.logPath)
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // Add to .gitignore if it exists
      this.addToGitignore()
    } catch {
      // Silently ignore
    }
  }

  private addToGitignore(): void {
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore')
    const entry = '.vscode/tutorcode-debug.log'

    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8')
        if (!content.includes(entry)) {
          fs.appendFileSync(gitignorePath, `\n${entry}\n`, 'utf-8')
        }
      }
    } catch {
      // Silently ignore
    }
  }

  dispose(): void {
    // Nothing to clean up — file handles are not kept open
  }
}
