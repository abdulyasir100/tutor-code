# TutorCode Sprint 1 — Tester Report

**Date**: 2026-04-15
**Worktree**: `C:\Yasir\Repo\tutor-code\.claude\worktrees\agent-a92e7a07`
**Tester**: @tester (static analysis, no VSCode runtime)

---

## Task 1: Auth Chain Coverage — PASS

All seven sub-checks verified against `src/auth/claudeAuth.ts`.

| Sub-check | Result | Evidence |
|-----------|--------|----------|
| At least 5 credential file paths (macOS + Windows) | PASS | 6 paths defined in `CLAUDE_CREDENTIAL_PATHS` (lines 15–24): 3 macOS/Linux, 3 Windows — matches AUTH.md exactly |
| Claude CLI binary list includes `'claude'` and `'%APPDATA%/npm/claude.cmd'` path | PASS | `CLAUDE_BINARY_PATHS` (lines 26–33) includes `'claude'` (bare, for PATH lookup) and `path.join(process.env['APPDATA'] ?? '', 'npm', 'claude.cmd')` |
| ENV check reads `process.env.ANTHROPIC_API_KEY` | PASS | `tryEnvKey()` (line 141): `const key = process.env['ANTHROPIC_API_KEY']` |
| SecretStorage check happens BEFORE showing input prompt | PASS | `trySecretStorage()` (lines 158–169) calls `secretStorage.get('tutorcode.anthropic.apikey')` and returns early if stored value exists, before the `showInformationMessage` / `showInputBox` calls |
| Module-level credential cache exists | PASS | `let cachedCredentials: Credentials \| null = null` declared at module scope (line 13); checked at entry of `resolveCredentials` (line 200) |
| Validation probe hits `https://api.anthropic.com/v1/models` with Bearer token | PASS | `validateAnthropicToken()` (lines 58–72): `fetch('https://api.anthropic.com/v1/models', { headers: { 'Authorization': \`Bearer ${token}\` } })` |
| Timeout via AbortSignal or AbortController | PASS | `AbortSignal.timeout(5000)` on line 66 passed as `signal` in the fetch call |

---

## Task 2: No-Crash Guarantee — FAIL

**Finding**: `trySecretStorage` (lines 156–194) does not wrap its body in a try/catch. If `secretStorage.get()` rejects, or `vscode.window.showInformationMessage` / `showInputBox` rejects (e.g., disposed extension context), the exception propagates out of `resolveCredentials` unhandled — it will not fall through to the final `AuthError`.

Compare with:
- `tryCredentialFiles()` — inner loop body is wrapped in try/catch (lines 84–106), catching file-not-found, JSON parse errors, and network errors.
- `tryClaudeCLI()` — inner loop body is wrapped in try/catch (lines 112–136), catching binary-not-found, timeout, and parse errors.

`trySecretStorage` has no equivalent protection. The requirement states: "the auth chain wraps **each option** in try/catch and falls through on failure." This check fails for the SecretStorage option.

**Mitigation**: The `tutorcode.start` command handler in `extension.ts` (lines 16–25) does catch any thrown error and displays it via `showErrorMessage`, so the extension itself will not crash. However, the auth chain does not internally recover — a rejection in `trySecretStorage` bypasses the intended fallback to the final `AuthError` throw with a clean message.

**Fix required**: Wrap the body of `trySecretStorage` in a try/catch that returns `null` on failure, consistent with the other option functions.

---

## Task 3: secretStorage.ts — PASS

All three methods are present and delegate to `this.secrets` (the injected `vscode.SecretStorage` instance):

| Method | Implementation | Result |
|--------|---------------|--------|
| `get(key)` | `return this.secrets.get(key)` (line 7) | PASS |
| `set(key, value)` | `return this.secrets.store(key, value)` (line 11) | PASS |
| `delete(key)` | `return this.secrets.delete(key)` (line 15) | PASS |

Note: `set` correctly maps to `vscode.SecretStorage.store` (the VSCode API name for writes).

---

## Task 4: extension.ts Integration — PASS

The `tutorcode.start` handler (lines 15–26 of `src/extension.ts`):

- Calls `resolveCredentials(context, secretStore)` — PASS
- Wraps the call in a try/catch — PASS
- On catch, calls `vscode.window.showErrorMessage(...)` with the error message — PASS
- Does **not** re-throw — PASS

---

## Task 5: esbuild Bundles — PASS

Command executed: `node esbuild.config.js` from the worktree root.

Build exited with code 0 and printed `Build complete.`

All three expected output files confirmed present in `dist/`:

| File | Location | Result |
|------|----------|--------|
| Extension bundle | `dist/extension.js` | PASS |
| Guide webview bundle | `dist/webview/guide.js` | PASS |
| Chat webview bundle | `dist/webview/chat.js` | PASS |

Source maps (`*.js.map`) are also present for all three.

---

## Summary

| Task | Result |
|------|--------|
| 1. Auth chain coverage (7 sub-checks) | PASS |
| 2. No-crash guarantee (each option try/caught) | FAIL |
| 3. secretStorage.ts get/set/delete | PASS |
| 4. extension.ts integration | PASS |
| 5. esbuild bundles (3 files in dist/) | PASS |

**Action required**: Add try/catch to `trySecretStorage()` in `src/auth/claudeAuth.ts` so it returns `null` on any VSCode API rejection rather than propagating the error up through `resolveCredentials`.
