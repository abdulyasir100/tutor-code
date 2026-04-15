# Token Efficiency

## Why This Matters

Monitoring fires on every save, terminal write, and file change. A user coding
for 2 hours might generate 200+ evaluation events. If each hits the AI with full
context, that's 200 × ~1100 tokens = 220k tokens just for monitoring. With
caching and tiering, the real cost is closer to 200 × ~50 tokens cached =
effectively ~10k tokens for the same session. The difference is a ~20x reduction.

---

## Three-Tier Architecture

### Tier 1 — Local Rules (0 tokens, ~0ms)

Pure TypeScript logic in `checkpointDetector.ts`. Handles ~80% of events.

**On-track signals (silent, no AI call):**
- Saved file path matches a path mentioned in current step definition
- Created file path matches expected project structure from plan
- Terminal command matches the expected command for current step
  (e.g., step says "run npm install" → terminal ran "npm install")
- Active editor file matches target file for current step
- Diagnostic count decreased since last check (user is fixing errors)

**Drift signals (escalate to Tier 2):**
- Created file path not in plan structure AND not a config/hidden file
- Terminal ran a command not expected at this step (e.g., deploying before building)
- Active errors in a file that should be complete per the plan

**Step complete signals (escalate to Tier 2 for confirmation):**
- All expected files for current step exist
- No errors in step's target files
- Expected terminal command was run and appeared to succeed

**Drop signals (no action, no AI):**
- Event is in a `node_modules/`, `.git/`, or `.next/` path
- Event is a `.log`, `.lock`, or auto-generated file
- Cooldown period active (< 30s since last interruption)
- User has active Pause running

---

### Tier 2 — Haiku Monitoring Call (~50-100 tokens net, ~300ms)

Used when Tier 1 is ambiguous or needs confirmation. Uses prompt caching
aggressively — the bulk of the prompt is marked cached and only the delta changes.

**Cached prefix (written once per session, ~1000 tokens, paid once):**
```
[SYSTEM - cached]
You are TutorCode's monitoring agent. Respond only in JSON.
Never write code. Evaluate user actions against the plan.

[USER - cached block 1]
PLAN:
{full plan markdown}

[USER - cached block 2]
PROJECT STRUCTURE (expected):
{expected file tree from plan}
```

**Non-cached suffix (per call, ~80 tokens, paid every call):**
```
CURRENT STEP: {step number} — {step title}
STEP EXPECTS: {step.expectedFiles}, {step.expectedCommands}
RECENT ACTION: {action description — 1-2 sentences}
ACTIVE ERRORS: {count or "none"}

Respond with exactly this JSON:
{"status":"on_track"|"minor_drift"|"major_drift"|"step_complete","message":"one sentence, max 15 words, or null"}
```

The `message` field is shown directly to the user in the character bubble.
Keep it under 15 words. Socratic where possible ("Is this file in your plan?")
not declarative ("You made a mistake").

**Cost math:**
- Cached tokens: ~1000 tokens, billed at cache read price (~10% of normal)
- Non-cached tokens: ~80 tokens, billed at normal price
- Effective per-call cost: ~100 tokens equivalent
- vs. uncached full call: ~1100 tokens
- Savings: ~91%

---

### Tier 3 — Sonnet Guidance Call (~800-1500 tokens, ~1-2s)

Used for: plan generation, step hints, chat responses, step transitions,
re-entry messages from chat back to guide mode, existing project scans.

Only triggered by:
- User clicking [Need a hint]
- User sending a chat message
- Step completion confirmation
- Plan generation / revision
- Existing project scan

Not triggered by passive monitoring. This is the expensive, high-quality model.

**Full context block for Tier 3:**
```
[SYSTEM - cached]
{TUTOR_SYSTEM prompt — see prompts/system/TUTOR_SYSTEM.md}

[USER - cached]
GOAL: {user goal}
PLAN: {full plan}
PROJECT STRUCTURE (expected): {expected tree}
PROJECT INDEX (actual): {current file tree + key file summaries}

[USER - non-cached]
CURRENT STEP: {step}
CONVERSATION HISTORY: {last 6 exchanges, if in chat mode}
USER ACTION / REQUEST: {what triggered this call}
```

---

## Prompt Caching Implementation

Use Anthropic's `cache_control` parameter. The `promptCache.ts` module builds
the cached prefix once per session and reuses it. Regenerate when plan changes.

```typescript
// Structure of a cached Anthropic request
{
  system: [
    {
      type: "text",
      text: TUTOR_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `PLAN:\n${plan}\n\nEXPECTED STRUCTURE:\n${structure}`,
          cache_control: { type: "ephemeral" }
        },
        {
          type: "text",
          text: `CURRENT STEP: ${step}\nRECENT ACTION: ${action}\n...`
          // no cache_control — this changes every call
        }
      ]
    }
  ]
}
```

For OpenAI/Grok providers, prompt caching is not manually controlled —
the provider handles it automatically based on prefix matching.
Structure requests the same way (stable prefix first) to maximize cache hits.

---

## Cooldown System

Maintained in `extension.ts` as a simple timestamp. Default comes from the
active scaffolding level — explicit `settings.cooldownSeconds` overrides it.

```typescript
const LEVEL_COOLDOWN_MS: Record<number, number> = { 1: 15_000, 2: 30_000, 3: 60_000 }

let lastInterruptionAt = 0

function getCooldownMs(settings: SessionSettings): number {
  if (settings.cooldownSeconds !== null) return settings.cooldownSeconds * 1000
  return LEVEL_COOLDOWN_MS[settings.scaffoldingLevel]
}

function canInterrupt(settings: SessionSettings): boolean {
  return Date.now() - lastInterruptionAt > getCooldownMs(settings)
}

function recordInterruption(): void { lastInterruptionAt = Date.now() }
```

Interruptions = any time the character speaks. Silent status bar ticks do not count.
Pause: `lastInterruptionAt = Date.now() + (pauseMinutes * 60_000)`.

Auto-nudge thresholds are also level-derived:
- Level 1: nudge at 5 min idle, again at 20 min if still idle
- Level 2: nudge once at 10 min, then silent
- Level 3: never nudge

Override via `settings.autoNudgeMinutes` (null = use level default).

---

## Event Debouncing

All monitoring events are debounced before hitting the evaluation pipeline:

```typescript
// In each watcher
const debouncedEvaluate = debounce((event: MonitoringEvent) => {
  evaluationQueue.push(event)
}, 1000)
```

Additionally, duplicate events within a 5-second window are coalesced:
if the same file is saved 3 times in 5 seconds, only the last save triggers
evaluation. This prevents "save storm" from keyboard shortcuts.
