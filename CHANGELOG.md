# Changelog

All notable changes to TutorCode are documented here.

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
