# TutorCode Sprint 3 — Monitoring Static Analysis Report

**Agent**: @tester  
**Date**: 2026-04-15  
**Scope**: `src/monitoring/` — checkpointDetector, fileWatcher, terminalWatcher, diagnosticsWatcher, orchestrator

---

## 1. checkpointDetector.ts

### 1a. Drop signals — ignored paths return `on_track/high`

**PASS**

`isIgnoredPath()` checks `IGNORED_SEGMENTS` (includes `/node_modules/`, `/.git/`), `IGNORED_EXTENSIONS` (`.log`, `.lock`), and `IGNORED_FILENAMES` (yarn.lock, package-lock.json, pnpm-lock.yaml). Inside `evaluate()`, non-`terminal_cmd` events with a `relativePath` that matches `isIgnoredPath()` immediately return `{ status: 'on_track', confidence: 'high' }`.

### 1b. Step complete — all expected files exist AND expected commands ran AND zero errors

**PASS**

The check (lines 218–228) calls three helpers in sequence:
- `allExpectedFilesExist(step, index)` — walks the project tree; returns `false` when `expectedFiles` is empty.
- `allExpectedCommandsRan(step, recentEvents)` — returns `true` when `expectedCommands` is empty (correct shortcut).
- `stepFilesErrorFree(step, recentEvents)` — confirms the latest diagnostics event for each expected file has `errorCount === 0`.

All three must be truthy before `step_complete/high` is returned.

### 1c. On-track — `file_create` matching `expectedFiles` → `on_track/high`

**PASS**

`evaluateFileCreate()` calls `pathMatchesStep(path, step)`. A match returns `{ status: 'on_track', confidence: 'high' }`. Config/hidden files (`.`-prefixed, `*.config.*`, `tsconfig.json`, `package.json`) also return `on_track/high` as a secondary guard.

### 1d. Drift — `file_create` not in plan → `minor_drift`; deploy command early → `major_drift`

**PASS (minor_drift) / PASS (major_drift)**

- A `file_create` that does not match step expected files and is not a config file returns `{ status: 'minor_drift', confidence: 'low' }`.
- `evaluateTerminalCmd()` calls `isDeployCommand(cmd)` when the command does not match step expectations, returning `{ status: 'major_drift', confidence: 'high' }`.

**NOTE — partial gap in `minor_drift` spec**: the task spec says "file_create not in *plan structure*" should be `minor_drift`. The implementation does not receive the `Plan` object in `evaluateFileCreate()`, so it cannot call `pathInPlan()`. The helper `pathInPlan()` exists and is exported, but is unused inside `evaluate()`. The fallback to `minor_drift` still fires correctly (anything not in step and not a config file), but the nuance of "file is in plan but wrong step" vs "file is not in plan at all" is lost. This is a minor fidelity gap, not a correctness failure — `minor_drift` is still returned. **PASS with advisory note.**

### 1e. Ambiguous fallthrough for everything else → `low` confidence

**PASS**

- `evaluateFileSave()` returns `ambiguous/low` for step-target saves and `on_track/low` for non-target saves.
- `evaluateTerminalCmd()` returns `ambiguous/low` for `null` exit codes and non-zero exit codes; `on_track/low` for successful unrecognized commands.
- `evaluateDiagnostics()` returns `ambiguous/low` for increasing or unchanged non-zero error counts.

All remaining cases yield `confidence: 'low'` — satisfying the "low confidence → Tier 2 escalation" contract.

---

## 2. fileWatcher.ts

### 2a. 1000ms debounce between events

**PASS**

`DEBOUNCE_MS = 1000` (line 75). `emitDebounced()` always applies this delay via `setTimeout(... delay)` where `delay = FileWatcher.DEBOUNCE_MS` (lines 164–167).

**NOTE — dead branch**: the `delay` variable computation (lines 164–167) has an if/else that assigns `FileWatcher.DEBOUNCE_MS` on both branches. The COALESCE branch was presumably meant to impose a different delay, but currently both paths are identical. The debounce still works correctly at 1000ms; the coalesce branch is vacuous but harmless.

### 2b. Same-file events within 5s window coalesced

**PASS**

`COALESCE_MS = 5000` (line 72). `lastEventTime` tracks the last event per URI key. Every new event within the 5s window clears the previous pending timer and schedules a fresh one, so only the final event within a burst is actually emitted. This is standard debounce-as-coalesce behavior.

### 2c. Content preview truncated to 100 lines or 2000 chars

**PASS**

On `onDidSaveTextDocument` (lines 87–91):
1. Split content into lines; take first 100 via `slice(0, 100).join('\n')`.
2. Clamp that string to 2000 chars with `first100.slice(0, 2000)`.

Both limits are enforced.

---

## 3. terminalWatcher.ts

### 3a. Shell integration marker regex present (`\x1b]633`)

**PASS**

Constants at lines 5–7:
```
COMMAND_START  = '\x1b]633;C\x07'
COMMAND_END_PREFIX = '\x1b]633;D;'
COMMAND_END_SUFFIX = '\x07'
```
`tryParseShellIntegration()` searches the buffer for these markers to extract command text and exit code.

### 3b. Heuristic fallback for non-shell-integration terminals

**PASS**

`handleTerminalData()` calls `tryParseShellIntegration()` first; if it returns `false` (no marker found), it falls through to `tryHeuristicParse()`. The heuristic matches `PROMPT_PATTERNS` (`/^[\s]*[$>]\s+/`) and a `KNOWN_COMMANDS` list of 30+ known CLI tools.

### 3c. 3s timeout for command completion

**PASS**

`COMMAND_TIMEOUT_MS = 3000` (line 21). Both `startPendingCommand()` (heuristic path, line 216) and the incomplete shell-integration path (line 157) use `setTimeout(..., COMMAND_TIMEOUT_MS)` to emit the command with `exitCode: null` when no completion marker arrives.

### 3d. VSCode version check present

**PASS**

`start()` (lines 49–59) calls `this.compareVersions(version, '1.74.0')`. If the version is below 1.74.0, `this.available` is set to `false`, a user-facing information message is shown, and the method returns early without registering any listeners.

---

## 4. diagnosticsWatcher.ts

### 4a. Error count tracking per URI

**PASS**

`this.errorCounts = new Map<string, number>()` tracks the last-seen error count keyed by `uri.toString()` (line 27). Updated on every change where `curr !== prev`.

### 4b. Only emits on count CHANGE (not every re-lint)

**PASS**

`if (curr !== prev)` guard at line 44 ensures the event is fired only when the error count changes. Identical re-lint results are silently dropped.

### 4c. Filters to `Error` severity only (for count)

**PASS**

Line 38: `.filter((d) => d.severity === vscode.DiagnosticSeverity.Error)` is applied before computing `curr`. Warning count is collected separately for context but does not influence the `errorCount` field or the change guard.

---

## 5. orchestrator.ts

### 5a. `start()` creates and starts all 3 watchers

**PASS**

Constructor instantiates `FileWatcher`, `TerminalWatcher`, and `DiagnosticsWatcher`. `start()` (lines 39–55) calls `.start()` on each and subscribes to their `onEvent` emitters, routing all into `routeEvent()`.

### 5b. `stop()` disposes all

**PASS**

`stop()` (lines 62–75) clears pause state, calls `.stop()` on all three watchers, and disposes all subscriptions in `this.disposables`.

### 5c. `pause(minutes)` exists

**PASS**

`pause(minutes: number)` (lines 82–95) converts minutes to ms, sets `this.pausedUntil`, and schedules a timer to auto-resume and flush the queue. Queue is bounded to 50 events.

### 5d. `onMonitoringEvent` emitter exists

**PASS**

`private readonly _onMonitoringEvent = new vscode.EventEmitter<MonitoringEvent>()` and the public accessor `public readonly onMonitoringEvent = this._onMonitoringEvent.event` are present at lines 13–14.

---

## Summary

| Check | File | Result |
|---|---|---|
| Drop signals → `on_track/high` for ignored paths | checkpointDetector | PASS |
| Step complete requires files + commands + zero errors | checkpointDetector | PASS |
| `file_create` matching expectedFiles → `on_track/high` | checkpointDetector | PASS |
| `file_create` not in plan → `minor_drift` | checkpointDetector | PASS *(advisory: plan not threaded in)* |
| Deploy command early → `major_drift/high` | checkpointDetector | PASS |
| Ambiguous fallthrough → `low` confidence | checkpointDetector | PASS |
| 1000ms debounce | fileWatcher | PASS *(advisory: dead if/else branch)* |
| 5s coalesce window | fileWatcher | PASS |
| Content preview: 100 lines / 2000 chars | fileWatcher | PASS |
| Shell integration `\x1b]633` marker | terminalWatcher | PASS |
| Heuristic fallback | terminalWatcher | PASS |
| 3s command timeout | terminalWatcher | PASS |
| VSCode 1.74 version check | terminalWatcher | PASS |
| Error count per URI | diagnosticsWatcher | PASS |
| Emit only on count change | diagnosticsWatcher | PASS |
| Filter to Error severity | diagnosticsWatcher | PASS |
| `start()` starts all 3 watchers | orchestrator | PASS |
| `stop()` disposes all | orchestrator | PASS |
| `pause(minutes)` exists | orchestrator | PASS |
| `onMonitoringEvent` emitter | orchestrator | PASS |

**Overall: 20/20 checks PASS**

### Advisory Notes (non-blocking)

1. **checkpointDetector — `pathInPlan()` unused**: The exported helper exists but `evaluateFileCreate()` does not receive or call it. The "file in wrong step but in plan" case is conflated with "file not in plan at all" — both return `minor_drift`. Low impact; the drift signal is still correct.

2. **fileWatcher — dead `delay` branch**: Lines 164–167 assign `DEBOUNCE_MS` in both the `if` and the `else`. The intended behavior (possibly a shorter delay for coalesced events) was not implemented. Debounce still functions at 1000ms; the dead branch should be cleaned up.
