# TutorCode — Master Instructions for Claude Code

You are building **TutorCode**, a VSCode extension that acts as a live AI tutor.
It observes the user's coding in real-time and guides them step-by-step — like a
teacher standing beside a student — without writing code for them.

## Prime Directive

**Never write code for the user. Only guide.** This applies to the AI prompts
you inject into the extension, not the extension code itself. The extension code
you write can be complete and production-ready. But the AI inside the extension
must only ever guide, hint, and question — never produce code the user should write.

---

## How to Read This Repo

Work through files in this order:

1. `docs/ARCHITECTURE.md` — full system map, read first
2. `docs/AUTH.md` — auth chain (critical, read before writing any auth code)
3. `docs/TOKEN_EFFICIENCY.md` — tiered evaluation, read before writing any AI call
4. `docs/SCAFFOLDING.md` — scaffolding levels, adaptive suggestions, level behaviour
5. `docs/PERSONALITIES.md` — personality presets, avatar settings
6. `docs/STATE.md` — JSON schemas for session and index files
7. `docs/MONITORING.md` — what to watch and how
8. `docs/UI.md` — panel behavior, toggle, guide vs chat mode
9. `docs/EXISTING_PROJECTS.md` — scan flow for non-empty workspaces
10. `docs/TYPES_REFERENCE.md` — all TypeScript interfaces, source of truth
11. `prompts/` — all AI prompt templates, reference when implementing AI calls
12. `tasks/BUILD_ORDER.md` — execute phases in order

---

## Build Rules

- **Language**: TypeScript throughout. Strict mode on.
- **Webview UI**: React + esbuild. Two separate bundles: `guide` and `chat`.
- **No secrets in settings.json** — API keys go to VSCode SecretStorage only.
- **Async everything** — no blocking calls on the extension host thread.
- **Debounce all monitoring events** — 1000ms minimum between evaluations.
- **Cooldown on notifications** — 30 second minimum between unprompted messages.
- **Prompt caching** — always use `cache_control: ephemeral` on static prompt blocks.
- **Haiku for monitoring, Sonnet for guidance** — never use Sonnet for Tier 2 calls.

## Key Constraints

- VSCode webviews cannot float over editor — use narrow `ViewColumn.Three` panel.
- `onDidWriteTerminalData` requires VSCode >= 1.74 and shell integration enabled.
- Claude Code credentials are read-only from disk — never write or invalidate them.
- Guide Mode is input-locked — no chat input box, only [Got it] [Need a hint] [Pause].

---

## File Output Structure

```
tutorcode/
  package.json
  tsconfig.json
  esbuild.config.js
  src/
    extension.ts
    auth/
      claudeAuth.ts
      secretStorage.ts
    ai/
      providers/
        anthropic.ts
        openai.ts
      promptCache.ts
      tierEvaluator.ts
    monitoring/
      fileWatcher.ts
      terminalWatcher.ts
      diagnosticsWatcher.ts
      checkpointDetector.ts
    state/
      sessionManager.ts
      projectIndexer.ts
    ui/
      guidePanel.ts
      chatPanel.ts
      statusBar.ts
      webview/
        guide/
          index.tsx
        chat/
          index.tsx
  prompts/           ← compiled into extension bundle as strings
    index.ts         ← exports all prompt templates as typed constants
```

---

## Phases

| Phase | Focus | Files |
|-------|-------|-------|
| 1 | Scaffold | package.json, tsconfig, esbuild, extension.ts skeleton |
| 2 | Auth | claudeAuth.ts, secretStorage.ts |
| 3 | State | sessionManager.ts, projectIndexer.ts |
| 4 | AI layer | anthropic.ts, openai.ts, promptCache.ts, tierEvaluator.ts |
| 5 | Monitoring | all watchers + checkpointDetector.ts |
| 6 | UI | guidePanel, chatPanel, statusBar, React webviews |
| 7 | Integration | wire extension.ts, connect all modules |
| 8 | Polish | edge cases, error handling, VSIX build |

Start with Phase 1. Do not skip ahead. Each phase task file is in `tasks/`.
