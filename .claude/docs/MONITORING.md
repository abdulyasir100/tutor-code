# Monitoring

## What to Watch

Four VSCode API surfaces provide full workspace visibility:

| Source | API | Emits |
|--------|-----|-------|
| File edits | `onDidSaveTextDocument` | FileSave event |
| File structure | `onDidCreateFiles`, `onDidDeleteFiles` | FileCreate, FileDelete |
| Terminal | `onDidWriteTerminalData` | TerminalWrite event |
| Errors | `onDidChangeDiagnostics` | DiagnosticsChange event |

Note: `onDidChangeTextDocument` (fires on every keystroke) is **not** used for
evaluation — too noisy. Only `onDidSaveTextDocument` triggers evaluation.
`onDidChangeTextDocument` is only used to update the "last edited file" state
for context awareness, with no AI calls.

---

## Event Types

```typescript
type MonitoringEvent =
  | { type: 'file_save';    uri: vscode.Uri; content: string; timestamp: number }
  | { type: 'file_create';  uri: vscode.Uri; timestamp: number }
  | { type: 'file_delete';  uri: vscode.Uri; timestamp: number }
  | { type: 'terminal_cmd'; raw: string; command: string; timestamp: number }
  | { type: 'diagnostics';  uri: vscode.Uri; errors: vscode.Diagnostic[]; timestamp: number }
```

---

## fileWatcher.ts

Subscribe to three workspace events. Filter noise aggressively.

**Ignore patterns (never emit events for these):**
```typescript
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/.turbo/**',
  '**/*.log',
  '**/yarn.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/.vscode/tutorcode*.json',   // don't monitor own state files
]
```

**Debounce:** 1000ms. Coalesce duplicate events for the same file within 5 seconds.

**File save content:** Read the first 100 lines only (or 2000 chars, whichever
is less) when passing content to the evaluator. Never send whole files.

---

## terminalWatcher.ts

VSCode 1.74+ exposes `window.onDidWriteTerminalData`. This streams raw terminal
output including control characters.

**Command extraction:**
Shell integration injects markers around commands. Parse them out:
```
\x1b]633;C\x07{command}\x1b]633;D;{exit_code}\x07
```

If shell integration isn't available (older VSCode, unsupported shell), fall back
to heuristic parsing: look for lines starting with `$ ` or `> ` patterns,
or match common command patterns (`npm `, `npx `, `git `, `yarn `, etc.).

**What to emit:**
Only emit on command completion (when exit code marker is seen, or after 3s timeout).
Don't emit for every line of stdout — only the command itself plus exit code.

**VSCode requirement warning:**
On activation, check `vscode.version` >= "1.74.0". If not, show one-time info
message: "TutorCode: Terminal monitoring requires VSCode 1.74+. Update for full features."
Also suggest enabling: `"terminal.integrated.shellIntegration.enabled": true`

---

## diagnosticsWatcher.ts

```typescript
vscode.languages.onDidChangeDiagnostics((e) => {
  for (const uri of e.uris) {
    const diagnostics = vscode.languages
      .getDiagnostics(uri)
      .filter(d => d.severity === vscode.DiagnosticSeverity.Error)

    // Only emit if error count changed, not on every re-lint
    const prev = errorCounts.get(uri.toString()) ?? 0
    const curr = diagnostics.length
    if (curr !== prev) {
      errorCounts.set(uri.toString(), curr)
      emit({ type: 'diagnostics', uri, errors: diagnostics, timestamp: Date.now() })
    }
  }
})
```

Diagnostics events are lower priority — they don't reset the cooldown timer.
They're used for context enrichment, not primary interruption triggers.

---

## checkpointDetector.ts

Pure logic, no side effects. Input: current step + recent events. Output: verdict.

```typescript
interface CheckpointResult {
  status: 'on_track' | 'minor_drift' | 'major_drift' | 'step_complete' | 'ambiguous'
  confidence: 'high' | 'low'    // high = Tier 1 handles it; low = escalate to Tier 2
  reason: string                 // for logging / Tier 2 context
}

function evaluate(
  event: MonitoringEvent,
  step: Step,
  index: ProjectIndex,
  recentEvents: MonitoringEvent[]
): CheckpointResult
```

**Step completion detection (high confidence):**
- All `step.expectedFiles` exist in the actual project tree
- All `step.expectedCommands` appear in recent terminal events
- Error count for step's target files is 0

**On-track detection (high confidence):**
- `file_create` event path matches a path in `step.expectedFiles`
- `terminal_cmd` matches a command in `step.expectedCommands`
- `file_save` uri is one of the step's target files

**Drift detection:**
- `file_create` path not in plan's `recommendedStructure` at all → minor_drift
- `terminal_cmd` is a deploy/publish command and we're on step 2/8 → major_drift
- `file_delete` removes a file that was previously a completed step's deliverable → major_drift

**Ambiguous → escalate to Tier 2:**
- `file_save` with content change but path is expected
- Unclear if terminal command succeeded or failed
- Diagnostic change when errors appeared but count is high

---

## Monitoring Lifecycle

```typescript
class MonitoringOrchestrator {
  private disposables: vscode.Disposable[] = []

  start(session: TutorSession): void {
    // Register all watchers, store disposables
  }

  stop(): void {
    // Dispose all watchers
    this.disposables.forEach(d => d.dispose())
    this.disposables = []
  }

  pause(minutes: number): void {
    // Set cooldown timer without stopping watchers
    // Events still queued but cooldown prevents interruptions
  }
}
```

Call `start()` when plan is committed. Call `stop()` on session complete, abandon,
or extension deactivate. Call `pause()` when user clicks Pause button.
