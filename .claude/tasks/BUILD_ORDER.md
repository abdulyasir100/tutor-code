# Build Order

Execute phases strictly in order. Each phase produces working, testable code
before the next phase begins. Do not skip ahead.

---

## Phase Summary

| # | Phase | Deliverable | Test |
|---|-------|-------------|------|
| 1 | Scaffold | Compilable extension skeleton | `vsce package` runs clean |
| 2 | Auth | Credential resolution + SecretStorage | Auth chain resolves in test workspace |
| 3 | State | Session + index R/W | JSON files created correctly |
| 4 | AI Layer | All providers + tier evaluator | Mock calls return correct shapes |
| 5 | Monitoring | All watchers + checkpoint detector | Events emit on real file edits |
| 6 | UI | Both webviews + status bar | Panels open, toggle works |
| 7 | Integration | Full flow end-to-end | Complete session from start to step 3 |
| 8 | Polish | Error handling + VSIX build | `vsce package` → installable .vsix |

---

## Phase 1 — Scaffold

Read: `tasks/PHASE_1_SCAFFOLD.md`

Produces:
- `package.json` with all contributes, deps, build scripts
- `tsconfig.json` strict config
- `esbuild.config.js` for extension + two webview bundles
- `src/extension.ts` skeleton (activate/deactivate, command stubs)
- `src/ui/webview/guide/index.tsx` minimal React component
- `src/ui/webview/chat/index.tsx` minimal React component
- `.vscodeignore`, `.gitignore`

---

## Phase 2 — Auth

Read: `tasks/PHASE_2_AUTH.md`

Produces:
- `src/auth/claudeAuth.ts` — full Option C/B/env/secret chain
- `src/auth/secretStorage.ts` — thin SecretStorage wrapper
- Integration in `extension.ts` activate()

---

## Phase 3 — State

Read: `tasks/PHASE_3_STATE.md`

Produces:
- `src/state/sessionManager.ts`
- `src/state/projectIndexer.ts`
- `.vscode/tutorcode.json` schema validation
- `.vscode/tutorcode-index.json` schema validation

---

## Phase 4 — AI Layer

Read: `tasks/PHASE_4_AI.md`

Produces:
- `src/ai/providers/anthropic.ts`
- `src/ai/providers/openai.ts`
- `src/ai/promptCache.ts`
- `src/ai/tierEvaluator.ts`
- `src/prompts/index.ts` — all prompt templates as typed string constants

---

## Phase 5 — Monitoring

Read: `tasks/PHASE_5_MONITORING.md`

Produces:
- `src/monitoring/fileWatcher.ts`
- `src/monitoring/terminalWatcher.ts`
- `src/monitoring/diagnosticsWatcher.ts`
- `src/monitoring/checkpointDetector.ts`

---

## Phase 6 — UI

Read: `tasks/PHASE_6_UI.md`

Produces:
- `src/ui/guidePanel.ts`
- `src/ui/chatPanel.ts`
- `src/ui/statusBar.ts`
- `src/ui/webview/guide/index.tsx` (full implementation)
- `src/ui/webview/chat/index.tsx` (full implementation)
- Shared `src/ui/messages.ts` (typed message protocol)

---

## Phase 7 — Integration

Read: `tasks/PHASE_7_INTEGRATION.md`

Produces:
- `src/extension.ts` fully wired (no more stubs)
- Full command implementations
- Event routing from monitoring → evaluator → UI
- Session resume on workspace open
- Plan suggestion loop connected to chat panel

---

## Phase 8 — Polish

Read: `tasks/PHASE_8_POLISH.md`

Produces:
- Error handling for all AI call failures
- Fallback rule-based guidance when AI unavailable
- `README.md` with setup instructions and screenshots
- `.vscodeignore` tuned for minimal package size
- `VSIX_BUILD.sh` — build + package script
- Final `vsce package` producing `tutorcode-1.0.0.vsix`
