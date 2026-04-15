import * as vscode from 'vscode'
import { MonitoringEvent } from './types'

// Shell integration markers
const COMMAND_START = '\x1b]633;C\x07'
const COMMAND_END_PREFIX = '\x1b]633;D;'
const COMMAND_END_SUFFIX = '\x07'

// Common command prefixes for heuristic detection
const KNOWN_COMMANDS = [
  'npm', 'npx', 'git', 'yarn', 'pnpm', 'bun', 'node', 'python',
  'python3', 'pip', 'pip3', 'cargo', 'go', 'make', 'cmake',
  'docker', 'kubectl', 'terraform', 'tsc', 'eslint', 'prettier',
  'jest', 'vitest', 'mocha', 'deno', 'ruby', 'rails', 'mvn',
  'gradle', 'dotnet', 'rustc', 'gcc', 'g++', 'java', 'javac',
]

const PROMPT_PATTERNS = /^[\s]*[$>]\s+/

/** Timeout for command completion when no exit code marker seen. */
const COMMAND_TIMEOUT_MS = 3000

interface PendingCommand {
  command: string
  rawChunks: string[]
  timer: ReturnType<typeof setTimeout>
}

/**
 * Watches terminal output for command execution events.
 * Requires VSCode >= 1.74 for onDidWriteTerminalData.
 */
export class TerminalWatcher {
  private readonly _onEvent = new vscode.EventEmitter<MonitoringEvent>()
  public readonly onEvent = this._onEvent.event

  private disposables: vscode.Disposable[] = []
  private available = true
  private versionWarningShown = false

  /** Pending commands per terminal, keyed by terminal name. */
  private pending = new Map<string, PendingCommand>()

  /** Buffer for partial data per terminal. */
  private buffers = new Map<string, string>()

  start(): void {
    // Version check
    const version = vscode.version
    if (this.compareVersions(version, '1.74.0') < 0) {
      this.available = false
      if (!this.versionWarningShown) {
        this.versionWarningShown = true
        vscode.window.showInformationMessage(
          'TutorCode: Terminal monitoring requires VSCode 1.74+. Update for full features.',
        )
      }
      return
    }

    // Suggest shell integration
    const config = vscode.workspace.getConfiguration('terminal.integrated')
    const shellIntegration = config.get<boolean>('shellIntegration.enabled')
    if (shellIntegration === false && !this.versionWarningShown) {
      this.versionWarningShown = true
      vscode.window.showInformationMessage(
        'TutorCode: Enable "terminal.integrated.shellIntegration.enabled" for better terminal monitoring.',
      )
    }

    // onDidWriteTerminalData may not be in type defs — use type assertion
    const onDidWrite = (vscode.window as any).onDidWriteTerminalData as
      | ((listener: (e: { terminal: vscode.Terminal; data: string }) => void) => vscode.Disposable)
      | undefined

    if (!onDidWrite) {
      this.available = false
      return
    }

    this.disposables.push(
      onDidWrite.call(vscode.window, (e: { terminal: vscode.Terminal; data: string }) => {
        this.handleTerminalData(e.terminal, e.data)
      }),
    )
  }

  stop(): void {
    // Clear all pending command timers
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
    }
    this.pending.clear()
    this.buffers.clear()
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }

  private handleTerminalData(terminal: vscode.Terminal, data: string): void {
    const key = terminal.name
    const buffer = (this.buffers.get(key) ?? '') + data
    this.buffers.set(key, buffer)

    // Try shell integration parsing first
    if (this.tryParseShellIntegration(key, buffer)) {
      return
    }

    // Fallback: heuristic command detection
    this.tryHeuristicParse(key, buffer)
  }

  private tryParseShellIntegration(key: string, buffer: string): boolean {
    const cmdStartIdx = buffer.indexOf(COMMAND_START)
    if (cmdStartIdx === -1) return false

    const afterStart = buffer.slice(cmdStartIdx + COMMAND_START.length)

    // Look for command end marker
    const endIdx = afterStart.indexOf(COMMAND_END_PREFIX)
    if (endIdx !== -1) {
      const command = afterStart.slice(0, endIdx).trim()
      const afterEnd = afterStart.slice(endIdx + COMMAND_END_PREFIX.length)
      const suffixIdx = afterEnd.indexOf(COMMAND_END_SUFFIX)

      let exitCode: number | null = null
      if (suffixIdx !== -1) {
        const codeStr = afterEnd.slice(0, suffixIdx).trim()
        const parsed = parseInt(codeStr, 10)
        if (!isNaN(parsed)) {
          exitCode = parsed
        }
      }

      if (command) {
        this.emitCommand(command, buffer, exitCode)
      }

      // Clear buffer past the parsed command
      const consumedLength = cmdStartIdx + COMMAND_START.length + endIdx +
        COMMAND_END_PREFIX.length + (suffixIdx !== -1 ? suffixIdx + COMMAND_END_SUFFIX.length : 0)
      this.buffers.set(key, buffer.slice(consumedLength))

      // Clear any pending command
      const pending = this.pending.get(key)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(key)
      }

      return true
    }

    // Command started but not ended yet — set up timeout
    const command = afterStart.split('\n')[0]?.trim()
    if (command && !this.pending.has(key)) {
      const timer = setTimeout(() => {
        this.pending.delete(key)
        if (command) {
          this.emitCommand(command, buffer, null)
        }
        this.buffers.set(key, '')
      }, COMMAND_TIMEOUT_MS)

      this.pending.set(key, {
        command,
        rawChunks: [buffer],
        timer,
      })
    }

    return true // We found shell integration markers, even if incomplete
  }

  private tryHeuristicParse(key: string, buffer: string): void {
    const lines = buffer.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()

      // Check for prompt patterns: $ command or > command
      const promptMatch = trimmed.match(PROMPT_PATTERNS)
      if (promptMatch) {
        const command = trimmed.slice(promptMatch[0].length).trim()
        if (command && this.isKnownCommand(command)) {
          this.startPendingCommand(key, command, buffer)
          return
        }
      }

      // Direct command detection without prompt prefix
      if (this.isKnownCommand(trimmed)) {
        this.startPendingCommand(key, trimmed, buffer)
        return
      }
    }

    // Limit buffer size to prevent memory growth
    if (buffer.length > 10000) {
      this.buffers.set(key, buffer.slice(-2000))
    }
  }

  private isKnownCommand(text: string): boolean {
    const firstWord = text.split(/\s+/)[0]?.toLowerCase()
    return firstWord !== undefined && KNOWN_COMMANDS.includes(firstWord)
  }

  private startPendingCommand(key: string, command: string, raw: string): void {
    // Clear existing pending command for this terminal
    const existing = this.pending.get(key)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(() => {
      this.pending.delete(key)
      this.emitCommand(command, raw, null)
      this.buffers.set(key, '')
    }, COMMAND_TIMEOUT_MS)

    this.pending.set(key, { command, rawChunks: [raw], timer })
  }

  private emitCommand(command: string, raw: string, exitCode: number | null): void {
    if (!command) return

    // Truncate raw output for event
    const truncatedRaw = raw.length > 2000 ? raw.slice(-2000) : raw

    this._onEvent.fire({
      type: 'terminal_cmd',
      command,
      raw: truncatedRaw,
      exitCode,
      timestamp: Date.now(),
    })
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0
      const nb = pb[i] ?? 0
      if (na > nb) return 1
      if (na < nb) return -1
    }
    return 0
  }

  dispose(): void {
    this.stop()
    this._onEvent.dispose()
  }
}
