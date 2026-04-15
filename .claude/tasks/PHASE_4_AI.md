# Phase 4 — AI Layer

## Goal
Implement the full AI abstraction: providers, prompt caching, and the three-tier
evaluator. By end of phase, calling `tierEvaluator.evaluate()` with a mock event
returns a correct `EvaluationResult`.

## Read First
- `docs/TOKEN_EFFICIENCY.md` — tier system, caching strategy
- `prompts/system/TUTOR_SYSTEM.md` — Sonnet system prompt
- `prompts/system/MONITOR_HAIKU.md` — Haiku monitoring prompt
- `prompts/tasks/PLAN_GENERATION.md` — plan generation prompt
- `prompts/tasks/TASK_PROMPTS.md` — all other task prompts

## Files to Create
- `src/ai/providers/anthropic.ts`
- `src/ai/providers/openai.ts`
- `src/ai/providers/types.ts` — shared provider interface
- `src/ai/promptCache.ts`
- `src/ai/tierEvaluator.ts`
- `src/prompts/index.ts`

---

## src/ai/providers/types.ts

```typescript
interface AIProvider {
  // Single-shot call, returns full text response
  complete(messages: Message[], options: CompleteOptions): Promise<string>
  // Streaming call, yields chunks
  stream(messages: Message[], options: CompleteOptions): AsyncIterable<string>
  // JSON call — enforces JSON response (retry once if parse fails)
  completeJSON<T>(messages: Message[], options: CompleteOptions): Promise<T>
}

interface CompleteOptions {
  model: string
  maxTokens: number
  system?: CacheableBlock[]        // blocks with optional cache_control
  temperature?: number             // default 0.3 for monitoring, 0.7 for guidance
}

interface CacheableBlock {
  text: string
  cache?: boolean                  // if true, add cache_control: ephemeral
}

interface Message {
  role: 'user' | 'assistant'
  content: string | CacheableBlock[]
}
```

---

## src/ai/providers/anthropic.ts

Use `@anthropic-ai/sdk`. Map `CacheableBlock[]` to Anthropic's content block format.
When `block.cache === true`, add `cache_control: { type: "ephemeral" }`.

Two instances internally:
- `guidanceClient` — uses `credentials.guidanceModel`
- `monitorClient` — uses `credentials.monitorModel`

Expose as a single `AnthropicProvider` implementing `AIProvider`.
The `complete()` method uses guidance model by default.
Add a `monitor()` method that routes to Haiku for Tier 2 calls.

Handle streaming: `stream()` yields string chunks from the SSE response.
The chat panel uses this to show tokens as they arrive.

---

## src/ai/providers/openai.ts

Use `openai` package. Same `AIProvider` interface.
Constructor takes `baseURL` — pass `https://api.x.ai/v1` for Grok,
`https://openrouter.ai/api/v1` for OpenRouter.

OpenAI doesn't have Haiku — use the same model for monitoring as guidance
unless user has configured a separate monitor model in settings.

---

## src/prompts/index.ts

Export all prompt template strings as typed constants. Templates use
`{variable}` placeholders — export a typed interpolation function for each:

```typescript
export const Prompts = {
  tutorSystem: TUTOR_SYSTEM_PROMPT,  // raw string, no interpolation needed

  monitorHaikuSystem: MONITOR_HAIKU_SYSTEM,

  planGeneration: (vars: PlanGenerationVars) => interpolate(PLAN_GENERATION_TEMPLATE, vars),

  stepGuidance: (vars: StepGuidanceVars) => interpolate(STEP_GUIDANCE_TEMPLATE, vars),

  hintRequest: (vars: HintRequestVars) => interpolate(HINT_REQUEST_TEMPLATE, vars),

  reentry: (vars: ReentryVars) => interpolate(REENTRY_TEMPLATE, vars),

  existingScan: (vars: ExistingScanVars) => interpolate(EXISTING_SCAN_TEMPLATE, vars),

  stepCompleteConfirm: (vars: StepCompleteVars) => interpolate(STEP_COMPLETE_TEMPLATE, vars),

  monitorHaikuUser: (vars: MonitorUserVars) => interpolate(MONITOR_HAIKU_USER_TEMPLATE, vars),
}
```

The `interpolate` helper replaces `{key}` with `vars[key]`, throws if a key is missing.

---

## src/ai/promptCache.ts

Builds and caches the stable prefix for Tier 2 calls:

```typescript
class PromptCache {
  private cachedPrefix: CacheableBlock[] | null = null
  private cachedForPlan: string | null = null  // plan hash for invalidation

  buildMonitorPrefix(session: TutorSession): CacheableBlock[] {
    const planStr = renderPlanAsText(session.plan)
    const planHash = hash(planStr)

    if (this.cachedForPlan === planHash && this.cachedPrefix) {
      return this.cachedPrefix  // reuse — cache hit on Anthropic's side too
    }

    this.cachedPrefix = [
      { text: Prompts.monitorHaikuSystem, cache: true },
      { text: buildPlanBlock(session), cache: true },
    ]
    this.cachedForPlan = planHash
    return this.cachedPrefix
  }
}
```

---

## src/ai/tierEvaluator.ts

```typescript
interface EvaluationResult {
  status: 'on_track' | 'minor_drift' | 'major_drift' | 'step_complete'
  message: string | null
  tier: 1 | 2 | 3               // which tier produced the verdict
  tokensUsed?: number
}

class TierEvaluator {
  async evaluate(
    event: MonitoringEvent,
    step: Step,
    index: ProjectIndex,
    recentEvents: MonitoringEvent[]
  ): Promise<EvaluationResult>
}
```

Implementation:
1. Call `checkpointDetector.evaluate()` (Tier 1)
2. If `confidence === 'high'` → return immediately as Tier 1 result
3. If `confidence === 'low'` or `status === 'ambiguous'` → call Haiku (Tier 2)
4. Tier 2 result is returned as-is (Tier 3 is never called from here — only from UI actions)

## Verification
Write a simple test script that creates a mock `MonitoringEvent` for a file save
and calls `tierEvaluator.evaluate()`. Should return `EvaluationResult` without errors.
Log which tier was used and how many tokens (if Tier 2).
