# Changelog

All notable changes to TutorCode are documented here.

## [1.0.0] — Sprint 2: Core Engine

### Added — Phase 3: State
- `src/state/types.ts` — all session/plan/index TypeScript interfaces (verbatim from TYPES_REFERENCE.md)
- `src/state/sessionManager.ts` — load/save `.vscode/tutorcode.json`, updateProgress, appendAction (trim to 20), getCurrentStep/getNextStep/isComplete, onSessionChange emitter, atomic writes, auto-gitignore
- `src/state/projectIndexer.ts` — recursive tree walk, detectStack (language/framework/runtime/packageManager), KEY_FILE_PATTERNS matching, `.vscode/tutorcode-index.json` persistence
- `src/ui/messages.ts` — updated to import Step/Plan from state/types (removed inline placeholders)

### Added — Phase 4: AI Layer
- `src/ai/providers/types.ts` — AIProvider interface, CacheableBlock, Message, CompleteOptions, EvaluationResult, CheckpointResult
- `src/ai/providers/anthropic.ts` — Anthropic SDK provider with lazy init, cache_control: ephemeral on cached blocks, stream() async generator, completeJSON() with JSON extraction, monitor() always uses Haiku
- `src/ai/providers/openai.ts` — OpenAI SDK provider supporting Grok (api.x.ai) and OpenRouter base URLs, no manual cache_control
- `src/ai/promptCache.ts` — builds Tier 2/3 cached prefixes, injects personality and scaffolding blocks, plan-hash invalidation
- `src/ai/tierEvaluator.ts` — 3-tier routing: Tier 1 checkpoint rules → Tier 2 Haiku monitor → Tier 3 Sonnet guidance/hints/chat
- `src/prompts/index.ts` — 9 prompt templates + 3 personality blocks + 3 scaffolding blocks as typed string constants
- `src/monitoring/types.ts` — MonitoringEvent union type (stub for Phase 5)
- `src/monitoring/checkpointDetector.ts` — evaluate() stub returning ambiguous/low

### Quality
- @api-guardian: PASS — AIProvider interface matches TYPES_REFERENCE.md exactly
- @validator: all 6 checks PASS — build clean, 11 files, zero any, cache_control correct
- @tester: all 5 checks PASS — types fidelity, sessionManager, promptCache, tierEvaluator routing, prompts completeness

## [1.0.0] — Sprint 1: Foundation

### Added — Phase 1: Scaffold
- `package.json` with 6 commands, keybinding (Ctrl+Shift+T), 4 configuration properties
- `tsconfig.json` (strict, CommonJS, ES2020) and `tsconfig.webview.json` (ESNext, DOM, JSX)
- `esbuild.config.js` producing 3 bundles: extension host (CJS), guide webview (ESM), chat webview (ESM)
- `src/extension.ts` — activate/deactivate lifecycle, 6 command stubs, `tutorcode.sessionActive` context key
- `src/ui/webview/guide/index.tsx` — React 18 guide panel scaffold
- `src/ui/webview/chat/index.tsx` — React 18 chat panel scaffold
- `src/ui/messages.ts` — full `HostMessage` and `WebviewMessage` discriminated union types
- `.vscodeignore` and `.gitignore`

### Added — Phase 2: Auth
- `src/auth/types.ts` — `Credentials` interface and `AuthError` class
- `src/auth/secretStorage.ts` — VSCode SecretStorage wrapper (get/set/delete)
- `src/auth/claudeAuth.ts` — full 4-option credential chain:
  - Option C: reads Claude Code credential files from 6 OS-specific paths
  - Option B: shells out to Claude CLI binary (5 path probes, 3s timeout)
  - Option ENV: reads `ANTHROPIC_API_KEY` environment variable
  - Option S: checks SecretStorage then prompts user via input box
  - Token validation via Anthropic `/v1/models` probe (5s timeout)
  - Module-level credential cache for session lifetime

### Quality
- @validator: all 6 checks PASS — zero TypeScript errors, 3 dist bundles present, vscode external
- @tester: all 5 checks PASS after fix — auth chain no-crash guarantee confirmed (trySecretStorage wrapped in try/catch)
- `npm run build` clean, `dist/extension.js` + `dist/webview/guide.js` + `dist/webview/chat.js` produced
