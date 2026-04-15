import * as vscode from 'vscode'
import { MonitoringEvent } from './types'

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
 * Watches language diagnostics (errors only) and emits events
 * when the error count for a file changes.
 *
 * Lower priority — does not reset cooldown timer.
 */
export class DiagnosticsWatcher {
  private readonly _onEvent = new vscode.EventEmitter<MonitoringEvent>()
  public readonly onEvent = this._onEvent.event

  private disposables: vscode.Disposable[] = []
  private workspaceRoot = ''

  /** Track error counts per URI to only emit on change. */
  private errorCounts = new Map<string, number>()

  start(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot

    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) => {
        for (const uri of e.uris) {
          const diagnostics = vscode.languages
            .getDiagnostics(uri)
            .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)

          const key = uri.toString()
          const prev = this.errorCounts.get(key) ?? 0
          const curr = diagnostics.length

          if (curr !== prev) {
            this.errorCounts.set(key, curr)

            const relativePath = toRelativePath(uri, this.workspaceRoot)

            // Count warnings too for context
            const allDiagnostics = vscode.languages.getDiagnostics(uri)
            const warningCount = allDiagnostics.filter(
              (d) => d.severity === vscode.DiagnosticSeverity.Warning,
            ).length

            this._onEvent.fire({
              type: 'diagnostics',
              uri: key,
              relativePath,
              errorCount: curr,
              warningCount,
              timestamp: Date.now(),
            })
          }
        }
      }),
    )
  }

  stop(): void {
    this.errorCounts.clear()
    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }

  dispose(): void {
    this.stop()
    this._onEvent.dispose()
  }
}
