# Quick Reference

Fast lookup for Claude Code during implementation.
For full specs, follow the links to the relevant doc.

---

## Auth Chain Order
```
1. ~/.claude/.credentials.json (+ variant paths)  → Option C
2. `claude auth status --format json`              → Option B
3. process.env.ANTHROPIC_API_KEY                   → ENV
4. vscode.window.showInputBox → SecretStorage      → PROMPT
```
Full spec: `docs/AUTH.md`

---

## Model Assignment
| Call type | Model |
|-----------|-------|
| Plan generation | `credentials.guidanceModel` (Sonnet) |
| Step guidance message | `credentials.guidanceModel` (Sonnet) |
| Hint request | `credentials.guidanceModel` (Sonnet) |
| Chat response | `credentials.guidanceModel` (Sonnet) |
| Monitoring evaluation | `credentials.monitorModel` (Haiku) |
| File summarization | `credentials.monitorModel` (Haiku) |
| Existing project scan | `credentials.guidanceModel` (Sonnet) |

Default models when resolving via Claude credentials:
- guidanceModel: `claude-sonnet-4-5`
- monitorModel: `claude-haiku-4-5-20251001`

---

## Tier Routing
| Condition | Tier | AI call? |
|-----------|------|----------|
| Event matches expected exactly | 1 | No |
| Event in ignored path | 1 | No |
| Cooldown active | 1 | No |
| Ambiguous action | 2 | Haiku |
| User clicks [Need a hint] | 3 | Sonnet |
| User sends chat message | 3 | Sonnet |
| Step complete confirmation | 3 | Sonnet |
| Plan generation | 3 | Sonnet |

Full spec: `docs/TOKEN_EFFICIENCY.md`

---

## Prompt Template Locations
| Purpose | File |
|---------|------|
| Tutor system prompt (Sonnet) | `prompts/system/TUTOR_SYSTEM.md` |
| Monitor system prompt (Haiku) | `prompts/system/MONITOR_HAIKU.md` |
| Plan generation | `prompts/tasks/TASK_PROMPTS.md` → PLAN_GENERATION |
| Step guidance message | `prompts/tasks/TASK_PROMPTS.md` → STEP_GUIDANCE |
| Hint request | `prompts/tasks/TASK_PROMPTS.md` → HINT_REQUEST |
| Re-entry from chat | `prompts/tasks/TASK_PROMPTS.md` → REENTRY |
| Existing project scan | `prompts/tasks/TASK_PROMPTS.md` → EXISTING_SCAN |
| Step complete confirm | `prompts/tasks/TASK_PROMPTS.md` → STEP_COMPLETE_CONFIRM |

All prompts exported from `src/prompts/index.ts` as typed interpolation functions.

---

## State Files
| File | Purpose | Written by |
|------|---------|------------|
| `.vscode/tutorcode.json` | Session state | sessionManager.ts |
| `.vscode/tutorcode-index.json` | Project index | projectIndexer.ts |

Schemas: `docs/STATE.md`
Both files gitignored on first write.

---

## VSCode Context Keys
| Key | When true |
|-----|-----------|
| `tutorcode.sessionActive` | Plan committed, guidance running |

Set with: `vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', value)`

---

## Event Ignore Patterns
```
**/node_modules/**  **/.git/**  **/.next/**
**/dist/**  **/build/**  **/.turbo/**
**/*.log  **/yarn.lock  **/package-lock.json
**/pnpm-lock.yaml  **/.vscode/tutorcode*.json
```

---

## Scaffolding Level Defaults

| Setting | Level 1 | Level 2 | Level 3 |
|---------|---------|---------|---------|
| Cooldown | 15s | 30s | 60s |
| Max hints/step | unlimited | 3 | 1 |
| Auto-nudge | 5 min | 10 min | never |
| Drift flagged | minor + major | minor + major | major only |
| Plan steps | 10–12 | 7–9 | 5–6 |
| Step complete | praise + msg | praise + msg | silent |

All overridable via `settings.cooldownSeconds`, `settings.maxHintsPerStep`,
`settings.autoNudgeMinutes` (null = use level default).

Full spec: `docs/SCAFFOLDING.md`

---

## Personality Blocks

| Key | Style | Sample |
|-----|-------|--------|
| `mentor` | Warm, "we", encouraging | "Nice work — what do you think comes next?" |
| `sensei` | Terse, formal, no filler | "Incorrect path. Reconsider the data flow." |
| `peer` | Casual, Gen Z friendly | "yo that file's not in the plan lol — intentional?" |

Injected as `{personalityBlock}` in tutor system prompt.
Full spec: `docs/PERSONALITIES.md`

---

## Adaptive Level Suggestion Triggers

| Trigger | Condition | Suggestion |
|---------|-----------|------------|
| Level up | 3 consecutive hint-less steps | "Try Level {N+1}?" |
| Level down | Max hints used on 3 consecutive steps | "Switch to Level {N-1}?" |

One suggestion per session max. Tracked in `progress.consecutiveHintlessSteps`
and `progress.consecutiveMaxHintSteps`. Pure Tier 1 logic, no AI call.

---
- Default: 30 seconds between interruptions
- Configurable via `tutorcode.cooldownSeconds`
- Pause adds to cooldown: `lastInterruptionAt = Date.now() + (minutes * 60_000)`
- Silent status bar ticks do NOT count as interruptions
- Diagnostics events do NOT reset cooldown

---

## Key File Patterns (for indexer)
```
package.json  tsconfig.json  next.config.*  vite.config.*
app/layout.*  app/page.*  pages/index.*  src/index.*
src/main.*  src/App.*  prisma/schema.prisma
drizzle.config.*  .env.example  README.md
```

---

## esbuild Bundles
| Bundle | Entry | Target | Format | Output |
|--------|-------|--------|--------|--------|
| Extension | src/extension.ts | node18 | cjs | dist/extension.js |
| Guide webview | src/ui/webview/guide/index.tsx | browser | esm | dist/webview/guide.js |
| Chat webview | src/ui/webview/chat/index.tsx | browser | esm | dist/webview/chat.js |

External in extension bundle: `vscode`
React/ReactDOM: bundled into webview bundles (no CDN, CSP blocks it)

---

## Commands Reference
| Command | When available | Action |
|---------|---------------|--------|
| `tutorcode.start` | Always | Start new session |
| `tutorcode.toggle` | sessionActive=true | Toggle guide/chat |
| `tutorcode.pause` | sessionActive=true | Pause monitoring |
| `tutorcode.revisePlan` | sessionActive=true | Re-open plan suggestion loop |
| `tutorcode.reindex` | sessionActive=true | Re-scan project |
| `tutorcode.abandon` | sessionActive=true | End session, clear state |

---

## VSCode API Requirements
| Feature | API | Min Version |
|---------|-----|-------------|
| Terminal monitoring | `onDidWriteTerminalData` | 1.74.0 |
| Secret storage | `context.secrets` | 1.53.0 |
| File watchers | `workspace.onDidCreateFiles` | 1.43.0 |
| Webview retain context | `retainContextWhenHidden` | 1.44.0 |

Extension engine requirement: `"vscode": "^1.74.0"`
