# TutorCode

TutorCode is a VSCode extension that acts as a live AI tutor. It observes your coding in real-time and guides you step-by-step through building projects — like a teacher standing beside you — without writing code for you. You describe what you want to build, and TutorCode generates a plan, then watches your progress and offers hints, nudges, and feedback as you code.

## Prerequisites

- **VSCode 1.74 or later**
- One of the following for AI access:
  - An Anthropic API key
  - Claude Code installed (TutorCode can detect and use its credentials)
  - An OpenAI-compatible API key (OpenAI, Grok, OpenRouter)

## Installation

### From VSIX

1. Run `VSIX_BUILD.sh` (or manually: `npm ci && npm run build && npx vsce package --no-dependencies`)
2. In VSCode: `Ctrl+Shift+P` → "Extensions: Install from VSIX..." → select `tutorcode-1.0.0.vsix`

### From Marketplace

Search for "TutorCode" in the VSCode Extensions panel and click Install.

## Authentication Setup

TutorCode checks for credentials in this order:

1. **Claude Code credentials** — If Claude Code is installed, TutorCode reads its cached credentials from disk (read-only, never writes or invalidates them). No setup needed.
2. **VSCode SecretStorage** — Set your API key via the command palette: `TutorCode: Start Session` will prompt you if no credentials are found.
3. **Environment variable** — Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your shell environment.

To use a non-Anthropic provider, change the `tutorcode.aiProvider` setting to `openai`, `grok`, or `openrouter`, then provide the corresponding API key.

## First Session Walkthrough

1. Open a folder in VSCode (empty folder for a new project, or an existing project).
2. Run `Ctrl+Shift+P` → **TutorCode: Start Session**.
3. Enter your project goal (e.g., "A REST API with Node.js and Express").
4. TutorCode scans your workspace (if non-empty) and generates a step-by-step plan.
5. Review the plan in the Chat panel. Suggest changes or commit it as-is.
6. The Guide panel opens with your first step. Start coding!
7. As you work, TutorCode monitors your changes and offers guidance:
   - **Green check** — you completed a step, moving to the next one
   - **Hint** — click "Need a hint" for progressively more specific help
   - **Nudge** — if you go quiet, TutorCode gently checks in
   - **Drift warning** — if your code diverges from the plan, you get a heads-up

## Guide Mode vs Chat Mode

- **Guide Mode** (default): A focused, step-by-step view. No free-form input — just three buttons: [Got it], [Need a hint], [Pause]. The AI character speaks to you with contextual guidance.
- **Chat Mode**: Free-form conversation with the AI about your project. Ask questions, discuss architecture, or request plan changes.

Toggle between modes with `Ctrl+Shift+T` (or `Cmd+Shift+T` on Mac).

## How Monitoring Works

TutorCode watches three event sources:

- **File changes** — saves, creates, deletes
- **Terminal commands** — command execution and output (requires VSCode 1.74+ with shell integration)
- **Diagnostics** — TypeScript/linter errors and warnings

Events are evaluated in tiers:
- **Tier 1**: Local rules (zero tokens) — quick pattern checks
- **Tier 2**: Haiku-class model — lightweight monitoring evaluation
- **Tier 3**: Sonnet-class model — detailed guidance generation

**"Drift"** means your actions don't match what the current step expects. For example, if the step says "create a database schema file" but you're editing CSS, TutorCode flags it as drift and gently redirects you.

## Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tutorcode.aiProvider` | string | `"anthropic"` | AI provider: `anthropic`, `openai`, `grok`, `openrouter` |
| `tutorcode.guidanceModel` | string | `""` | Model for guidance/chat (blank = provider default) |
| `tutorcode.monitorModel` | string | `""` | Model for monitoring (blank = provider default) |
| `tutorcode.cooldownSeconds` | number | `30` | Minimum seconds between unprompted guidance messages |

## Known Limitations

- **No floating panels**: VSCode webviews cannot float over the editor. The guide panel opens in a side column.
- **Terminal monitoring**: Requires VSCode 1.74+ and shell integration enabled. If your VSCode is older, terminal events won't be tracked (file and diagnostics monitoring still work).
- **Multi-root workspaces**: TutorCode tracks the first workspace folder only. A message informs you which folder is being used.
- **Scaffolding levels**: The adaptive level system suggests changes based on hint usage patterns. It does not track actual code quality — it tracks how much help you need.

## Privacy

TutorCode does not collect telemetry or send data anywhere except API calls to your chosen AI provider. All session data is stored locally in your workspace's `.vscode/tutorcode.json` file. Debug logs (when enabled via `tutorcode.debugMode`) are written to `.vscode/tutorcode-debug.log` — also local only.
