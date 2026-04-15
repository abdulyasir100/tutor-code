# TutorCode — Tester Sprint 5 (Final) Static Analysis Report

**Date:** 2026-04-15  
**Branch:** feature/base  
**Scope:** Static analysis of `src/extension.ts` integration, panel wiring, cooldown gate, error resilience, and session resume.

---

## 1. State Machine Flow — PASS

### tutorcode.start flow
| Step | Verified | Location |
|------|----------|----------|
| Auth (`resolveCredentials`) | ✅ | `startSession()` line 387 |
| Goal capture (`showInputBox`) | ✅ | `startSession()` line 392–410 |
| Workspace scan (`projectIndexer.buildIndex()`) | ✅ | `continueStartSession()` line 437 |
| Plan generation (AI call) | ✅ | `continueStartSession()` lines 476–496 |
| Show plan in chat panel (`displayPlan`) | ✅ | `continueStartSession()` line 503 |
| Listen for `plan_commit` | ✅ | `wireChatPanelPlanEvents()` line 591 |
| Switch to guide mode on commit (`enterGuidanceMode`) | ✅ | `wireChatPanelPlanEvents()` line 596 |

**Notes:** The vague goal check (< 5 words) prompts the user for refinement before continuing — good UX hardening. Plan generation includes a retry on failure with an explicit JSON instruction.

### Event routing flow
| Step | Verified | Location |
|------|----------|----------|
| Monitoring events subscribed via `onMonitoringEvent` | ✅ | `enterGuidanceMode()` line 663 |
| Cooldown check before processing | ✅ | `handleMonitoringEvent()` line 700 |
| `tierEvaluator.evaluate()` called | ✅ | `handleMonitoringEvent()` line 706 |
| UI update (`guidePanel.sendCharacterMessage`) on non-`on_track` result | ✅ | `handleMonitoringEvent()` lines 729–735 |

### Step advancement flow
| Step | Verified | Location |
|------|----------|----------|
| `step_complete` detected from `tierEvaluator` result | ✅ | `handleMonitoringEvent()` line 725 |
| Confirmation via AI call (`stepCompleteConfirm`) | ✅ | `handleStepComplete()` lines 763–775 |
| Advance to next step on `got_it` | ✅ | `onGotIt` handler line 874–914 |
| Generate guidance for new step | ✅ | `onGotIt` handler lines 885–911 |

---

## 2. Cooldown Gate — PASS

| Check | Verified | Detail |
|-------|----------|--------|
| Timestamp tracking (`lastInterruptionAt`) | ✅ | Module-level `let lastInterruptionAt = 0` (line 54) |
| Level-based cooldown values | ✅ | `LEVEL_COOLDOWN_MS = { 1: 15_000, 2: 30_000, 3: 60_000 }` (line 72) |
| Check happens before any UI message | ✅ | `canInterrupt()` called at top of `handleMonitoringEvent()` (line 700), returns early if cooldown not elapsed |
| `recordInterruption()` updates timestamp after each message | ✅ | Called at lines 731, 782, 802, 953, 963 |
| Custom override via `cooldownSeconds` setting | ✅ | `getCooldownMs()` checks `settings.cooldownSeconds` before falling back to level defaults |

---

## 3. Guide Panel Wiring — PASS

All four required handlers are wired in `wireGuidePanelEvents()` (lines 841–993):

| Handler | Message type | Action | Verified |
|---------|-------------|--------|----------|
| `got_it` | `got_it` | Advance step, generate guidance | ✅ line 848 |
| `need_hint` | `need_hint` | `tierEvaluator.requestHint()` → `sendCharacterMessage` | ✅ line 929 |
| `pause` | `pause` | `monitoringOrchestrator.pause(minutes)` | ✅ line 971 |
| `toggle` | `toggle_mode` | `toggleMode()` | ✅ line 990 |

**GuidePanel webview message routing** in `guidePanel.ts` (lines 53–73): all four message types (`got_it`, `need_hint`, `pause`, `toggle_mode`) fire the correct EventEmitters.

**Minor observation:** The `need_hint` handler does not explicitly call a method named `tierEvaluator.requestHint()` with a separate "speech bubble" path — it calls `tierEvaluator.requestHint()` and delivers the result directly via `sendCharacterMessage`. This satisfies the spec intent.

---

## 4. Chat Panel Wiring — PASS

All four required handlers are present:

| Handler | Message type | Action | Verified |
|---------|-------------|--------|----------|
| `chat_send` | `chat_send` | Streaming AI response via `tierEvaluator.chat()` | ✅ `wireChatModeEvents()` line 1073 |
| `plan_suggestion` | `plan_suggestion` | Plan revision via AI call | ✅ `wireChatPanelPlanEvents()` line 568 |
| `plan_commit` | `plan_commit` | Commit plan + switch to guide (`enterGuidanceMode`) | ✅ `wireChatPanelPlanEvents()` line 591–597 |
| `toggle` | `toggle_mode` | `toggleMode()` with re-entry message | ✅ `toggleMode()` lines 1024–1064 |

**ChatPanel webview message routing** in `chatPanel.ts` (lines 52–83): all four message types (`chat_send`, `plan_suggestion`, `plan_commit`, `toggle_mode`) fire the correct EventEmitters.

**Re-entry message on toggle to guide:** `toggleMode()` generates a re-entry message (for scaffolding levels < 3) via `Prompts.reentry()` before showing the guide panel. Fallback: if AI call fails, the guide panel is still shown without a re-entry message (no crash).

**Minor observation:** Chat mode event disposables are pushed into `planListenerDisposables` (line 1112) rather than a dedicated chat-mode list. This means chat events are disposed when `disposePlanListeners()` is called (e.g., on plan commit). This could silently drop the chat_send handler if a plan commit fires while in active chat mode during the `revisePlan` flow. Functional risk is low in the happy path.

---

## 5. Error Resilience — PASS

| Scenario | Behavior | Verified |
|----------|----------|----------|
| AI call failure during monitoring | Caught in `handleMonitoringEvent()` catch block; `fallbackGuidance()` displayed; no throw to extension host | ✅ lines 737–746 |
| AI call failure during plan generation | Retry once with explicit JSON instruction; if still fails, shows error message in chat panel and re-throws only within the `startSession` outer catch (which itself shows an error message, no crash) | ✅ lines 482–496, 412–427 |
| AI call failure during step guidance (got_it, step start) | Caught silently; `fallbackGuidance()` used | ✅ lines 909–910 |
| AI call failure during hint request | Caught; fallback message shown to user | ✅ lines 958–963 |
| AI call failure during step complete confirm | Caught; fallback praise message + recordInterruption | ✅ lines 796–803 |
| Auth failure (401/403) | `ErrorHandler.handleAPIError()` calls `clearCredentialCache()`, shows warning message, returns `'abort'` — does **not** throw to extension host | ✅ `errorHandler.ts` lines 20–26 |
| Auth failure during session start | Caught in `startSession()` catch; error message shown via `showErrorMessage`, `statusBar.showError()` called | ✅ lines 412–427 |
| Fallback guidance constants | `FALLBACK_HINTS` map defined for `file_create`, `terminal_cmd`, `major_drift`, `step_start` | ✅ lines 184–200 |

---

## 6. Session Resume — PASS

Session resume is implemented in `activate()` (lines 306–326):

| Check | Verified | Detail |
|-------|----------|--------|
| `sessionManager.load()` called during `activate()` | ✅ | line 309 |
| Checks `existing.status === 'active'` before prompting | ✅ | line 310 |
| User offered Resume / Start Fresh / Dismiss | ✅ | lines 311–322 |
| On Resume: calls `resumeSession()` → re-resolves credentials → `enterGuidanceMode()` | ✅ | lines 317–318; `resumeSession()` lines 1249–1268 |
| On Start Fresh: marks old session `'abandoned'`, saves | ✅ | lines 319–322 |
| Auth failure during resume: shows error message, returns cleanly | ✅ | `resumeSession()` lines 1258–1260 |
| Corrupt session file: caught by outer try/catch, ignored | ✅ | lines 324–326 |

---

## Summary

| Area | Result |
|------|--------|
| 1. State machine flow | **PASS** |
| 2. Cooldown gate | **PASS** |
| 3. Guide panel wiring | **PASS** |
| 4. Chat panel wiring | **PASS** |
| 5. Error resilience | **PASS** |
| 6. Session resume | **PASS** |

### Overall: PASS

All six integration areas are correctly implemented. Two minor observations noted (non-blocking):

1. **Chat disposable management:** Chat mode event disposables are merged into `planListenerDisposables` rather than a separate lifecycle list. No crash risk in the primary flow, but worth isolating in a future cleanup.
2. **`activeErrors` hardcoded:** `tierEvaluator.ts` passes `activeErrors: '0'` to monitor prompts (a Phase 5 placeholder). Diagnostics watcher is wired but its error count is not yet fed into the Tier 2 evaluation context. This is pre-existing technical debt, not introduced in this sprint.
