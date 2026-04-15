# Phase 8 — Polish

## Goal
Production-ready: error handling, fallbacks, README, and a working .vsix.

---

## Error Handling Matrix

Implement a centralized `ErrorHandler` class that maps error types to recovery actions:

| Error | Detection | Recovery |
|-------|-----------|----------|
| Auth failure (401/403) | API call returns 401 | Re-trigger auth flow, clear cached creds |
| Auth failure (no creds) | resolveCredentials throws | Show setup message, guide to API key |
| Rate limit (429) | API returns 429 | Exponential backoff: 2s, 4s, 8s (3 attempts) |
| Network timeout | fetch timeout after 10s | Retry once, then fall back to rule-based hint |
| JSON parse failure | plan/monitor response not valid JSON | Strip markdown fences, retry once |
| Plan validation failure | validatePlan throws | Retry generation with explicit JSON instruction |
| No workspace | no open folder | Show message: "Open a folder first" |
| VSCode too old | vscode.version < 1.74 | Show warning, disable terminal monitoring only |
| Plan file corrupt | JSON.parse fails on tutorcode.json | Offer to reset session |

```typescript
class ErrorHandler {
  async handleAPIError(error: unknown, context: string): Promise<ErrorAction>
  // Returns: 'retry' | 'fallback' | 'notify_user' | 'abort'
}
```

---

## Rule-Based Fallback Guidance

When AI is unavailable (rate limited, no key, network down), provide basic
guidance from a static lookup table. Not as good as AI but better than silence.

```typescript
const FALLBACK_HINTS: Record<string, string[]> = {
  'file_create': [
    "Good — you're creating files. Check the plan to make sure this one is expected.",
    "New file created. Does it match what the current step requires?",
  ],
  'terminal_cmd': [
    "Command ran. Check the output — did it succeed?",
    "Terminal activity detected. Is this the command the current step needs?",
  ],
  'major_drift': [
    "This might not be what the current step needs. Review step {N} before continuing.",
    "Heads up — this action looks different from the plan. Intentional?",
  ],
  'step_start': [
    "Step {N}: {title}. Read the description and think about your first move.",
    "Moving to step {N}. What needs to happen before this step can be called done?",
  ],
}
```

Pick randomly from the array for variety. Replace `{N}` and `{title}` via simple
string replacement. Show as `mood: 'neutral'` in guide panel.

---

## Telemetry / Logging (Local Only)

No external telemetry. Write a local debug log to:
```
{workspaceRoot}/.vscode/tutorcode-debug.log
```

Only written when `tutorcode.debugMode: true` in settings (default false).
Log: timestamp, event type, tier used, token count, verdict. Nothing sensitive.

Add to `.gitignore` entries on first write.

---

## README.md

Include:
- What TutorCode is (one paragraph, non-marketing)
- Prerequisites (VSCode 1.74+, Anthropic API key or Claude Code installed)
- Installation (from VSIX or marketplace)
- Auth setup: how Claude Code credential detection works, how to use API key
- First session walkthrough (step by step with what to expect)
- Guide Mode vs Chat Mode explanation
- How monitoring works and what "drift" means
- Settings reference (aiProvider, guidanceModel, monitorModel, cooldownSeconds)
- Known limitations (no float over editor, terminal monitoring VSCode version req)
- Privacy note (no data leaves VSCode except API calls to your chosen provider)

---

## .vscodeignore

```
.vscode/**
src/**
node_modules/**
tsconfig*.json
esbuild.config.js
.eslintrc*
*.md
!README.md
.gitignore
tasks/**
docs/**
prompts/**
```

Only ship: `dist/`, `package.json`, `README.md`.

---

## VSIX_BUILD.sh

```bash
#!/usr/bin/env bash
set -e

echo "→ Installing dependencies..."
npm ci

echo "→ Building extension and webviews..."
npm run build

echo "→ Packaging VSIX..."
npx vsce package --no-dependencies

echo "✓ Done. Install with:"
echo "  code --install-extension tutorcode-*.vsix"
```

Make executable: `chmod +x VSIX_BUILD.sh`

---

## Edge Cases to Handle

### Vague goal
If the goal input is fewer than 5 words or seems very generic ("build something"),
prompt once: "Can you be more specific? For example: 'A REST API with Node.js and
PostgreSQL' or 'A React todo app with local storage'."

### User ignores guidance
If no monitoring events for 10 minutes during an active step:
- First: gentle nudge ("Still working on step {N}? Let me know if you need a hint.")
- After 20 minutes: "Take your time — I'm here when you're ready. Press [Need a hint] if stuck."
- After 30 minutes: stop nudging. User clearly paused on their own.

Implement with a `lastActivityAt` timestamp, checked on a 10-minute interval timer.

### Plan changes mid-session (revisePlan command)
1. Stop monitoring
2. Open chat panel in planning mode
3. Show current plan with suggestion input
4. User submits suggestion → AI revises
5. On commit: update session, rebuild prompt cache, restart monitoring from current step

### Multi-root workspaces
`vscode.workspace.workspaceFolders` may have multiple entries. For now:
- Use the first folder as the primary workspace
- Show info message: "TutorCode is tracking the first workspace folder: {name}"
- Each folder can have its own `.vscode/tutorcode.json` — scoped per folder

### Empty hint response
If AI returns an empty string or whitespace for a hint, retry once.
If still empty, show: "I'm having trouble generating a hint right now. Try reviewing
the step description for clues."

---

## Final Verification Checklist

- [ ] `npm run build` → zero TypeScript errors
- [ ] `vsce package` → produces `tutorcode-1.0.0.vsix`
- [ ] Install VSIX in a clean VSCode window
- [ ] Complete session: empty folder → goal → plan → 3 steps → step complete
- [ ] Auth chain: works with Claude Code installed, works with API key, works with env var
- [ ] Toggle: Guide ↔ Chat, keybinding works
- [ ] Hint: 3 hints on same step, each progressively more specific, no code in any
- [ ] Pause: 5-min pause, monitoring resumes after
- [ ] Drift detection: create a file not in plan → character warns within 30s
- [ ] Resume: close VSCode mid-session, reopen, offered resume
- [ ] Existing project: open a half-built Next.js app, session detects what's done
- [ ] API failure: set wrong API key, verify graceful fallback to rule-based hints
- [ ] No workspace: run command with no folder open, verify message
