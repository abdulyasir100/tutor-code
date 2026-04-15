import * as vscode from 'vscode'
import { MonitoringEvent } from './types'

// ── Ignore patterns (simple string matching, no minimatch) ─────────

const IGNORED_SEGMENTS = [
  '/node_modules/',
  '/.git/',
  '/.next/',
  '/dist/',
  '/build/',
  '/.turbo/',
]

const IGNORED_EXTENSIONS = ['.log']

const IGNORED_FILENAMES = [
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
]

function shouldIgnore(relativePath: string): boolean {
  const normalized = '/' + relativePath.replace(/\\/g, '/')

  for (const seg of IGNORED_SEGMENTS) {
    if (normalized.includes(seg)) return true
  }
  if (normalized.startsWith('/node_modules/') || normalized.startsWith('/.git/')) return true

  for (const ext of IGNORED_EXTENSIONS) {
    if (normalized.endsWith(ext)) return true
  }

  const filename = normalized.split('/').pop() ?? ''
  if (IGNORED_FILENAMES.includes(filename)) return true

  // Own state files
  if (normalized.includes('/.vscode/tutorcode') && normalized.endsWith('.json')) return true

  return false
}

function toRelativePath(uri: vscode.Uri, workspaceRoot: string): string {
  const uriPath = uri.fsPath.replace(/\\/g, '/')
  const root = workspaceRoot.replace(/\\/g, '/')
  if (uriPath.startsWith(root)) {
    const rel = uriPath.slice(root.length)
    return rel.startsWith('/') ? rel.slice(1) : rel
  }
  return uriPath
}

/**
 * Watches file system events (save, create, delete) and emits
 * normalized MonitoringEvent objects after debouncing/coalescing.
 */
export class FileWatcher {
  private readonly _onEvent = new vscode.EventEmitter<MonitoringEvent>()
  public readonly onEvent = this._onEvent.event

  private disposables: vscode.Disposable[] = []
  private workspaceRoot = ''

  /** Debounce timers keyed by URI string. */
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** Coalesce window: track last event timestamp per URI. */
  private lastEventTime = new Map<string, number>()

  /** Coalesce window in ms — same file events within this window are merged. */
  private static readonly COALESCE_MS = 5000

  /** Minimum ms between evaluations for the same file. */
  private static readonly DEBOUNCE_MS = 1000

  start(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot

    // File save
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const relativePath = toRelativePath(doc.uri, this.workspaceRoot)
        if (shouldIgnore(relativePath)) return

        const text = doc.getText()
        const lines = text.split('\n')
        const first100 = lines.slice(0, 100).join('\n')
        const contentPreview =
          first100.length <= 2000 ? first100 : first100.slice(0, 2000)

        this.emitDebounced(doc.uri.toString(), {
          type: 'file_save',
          uri: doc.uri.toString(),
          relativePath,
          contentPreview,
          timestamp: Date.now(),
        })
      }),
    )

    // File create
    this.disposables.push(
      vscode.workspace.onDidCreateFiles((e) => {
        for (const fileUri of e.files) {
          const relativePath = toRelativePath(fileUri, this.workspaceRoot)
          if (shouldIgnore(relativePath)) continue

          this.emitDebounced(fileUri.toString(), {
            type: 'file_create',
            uri: fileUri.toString(),
            relativePath,
            timestamp: Date.now(),
          })
        }
      }),
    )

    // File delete
    this.disposables.push(
      vscode.workspace.onDidDeleteFiles((e) => {
        for (const fileUri of e.files) {
          const relativePath = toRelativePath(fileUri, this.workspaceRoot)
          if (shouldIgnore(relativePath)) continue

          this.emitDebounced(fileUri.toString(), {
            type: 'file_delete',
            uri: fileUri.toString(),
            relativePath,
            timestamp: Date.now(),
          })
        }
      }),
    )
  }

  stop(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.lastEventTime.clear()
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }

  /**
   * Debounce + coalesce: if the same URI fires multiple events within
   * COALESCE_MS, only the last one is emitted after DEBOUNCE_MS.
   */
  private emitDebounced(key: string, event: MonitoringEvent): void {
    const now = Date.now()
    const lastTime = this.lastEventTime.get(key) ?? 0

    // Clear any pending timer for this key
    const existing = this.debounceTimers.get(key)
    if (existing !== undefined) {
      clearTimeout(existing)
    }

    // If within coalesce window, update but keep debounce waiting
    this.lastEventTime.set(key, now)

    const delay =
      now - lastTime < FileWatcher.COALESCE_MS
        ? FileWatcher.DEBOUNCE_MS
        : FileWatcher.DEBOUNCE_MS

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key)
      // Update timestamp to emission time
      const emitted = { ...event, timestamp: Date.now() }
      this._onEvent.fire(emitted)
    }, delay)

    this.debounceTimers.set(key, timer)
  }

  dispose(): void {
    this.stop()
    this._onEvent.dispose()
  }
}
