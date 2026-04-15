# Phase 5 — Monitoring

## Goal
All four watchers producing normalized events, debounced correctly.
Checkpoint detector returning correct Tier 1 verdicts for common cases.

## Read First
`docs/MONITORING.md` — full spec.

## Files to Create
- `src/monitoring/fileWatcher.ts`
- `src/monitoring/terminalWatcher.ts`
- `src/monitoring/diagnosticsWatcher.ts`
- `src/monitoring/checkpointDetector.ts`
- `src/monitoring/types.ts` — `MonitoringEvent` union type
- `src/monitoring/orchestrator.ts` — `MonitoringOrchestrator` class

## Implementation Notes

### fileWatcher.ts
Use `vscode.workspace.onDidSaveTextDocument` as the primary trigger (not onChange).
Use `vscode.workspace.onDidCreateFiles` and `onDidDeleteFiles` for structure changes.
Implement `shouldIgnore(uri)` using the ignore patterns from `docs/MONITORING.md`.
Debounce with a `Map<string, NodeJS.Timeout>` keyed by URI string.

### terminalWatcher.ts
Check `vscode.version` on creation. If < 1.74.0, set `this.available = false`
and return empty disposable from `start()`. Show one-time warning.
Parse shell integration escape sequences for command extraction.
Fall back to heuristic parsing if no shell integration markers detected.

### diagnosticsWatcher.ts
Track error counts per URI in a `Map<string, number>`.
Only emit when count changes. Filter to `DiagnosticSeverity.Error` only.

### checkpointDetector.ts
Implement as a pure function (no class needed). No async, no side effects.
Write unit-testable logic. Each decision branch should be clear and documented.

## MonitoringOrchestrator

```typescript
class MonitoringOrchestrator {
  private fileWatcher: FileWatcher
  private terminalWatcher: TerminalWatcher
  private diagnosticsWatcher: DiagnosticsWatcher
  readonly onEvent: vscode.EventEmitter<MonitoringEvent>

  constructor(context: vscode.ExtensionContext) {}
  start(session: TutorSession): void
  stop(): void
  pause(minutes: number): void
  resume(): void
}
```

The orchestrator fans all watcher events into a single `onEvent` emitter.
`extension.ts` subscribes to `onEvent` and routes to the tier evaluator.

## Verification
With a real workspace open, start the orchestrator (even without a real session
by passing a mock step). Save a file → `onEvent` fires with `file_save` event.
Create a file → `onEvent` fires with `file_create` event.
Confirm `node_modules/` changes don't emit.
