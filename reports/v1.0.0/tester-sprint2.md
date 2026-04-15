# TutorCode Sprint 2 — Static Analysis Report

**Tester:** @tester (agent-a2b14339)
**Date:** 2026-04-15
**Branch:** feature/base
**Worktree:** C:\Yasir\Repo\tutor-code\.claude\worktrees\agent-a2b14339
**Files analysed (read from main src):**
- `src/state/types.ts`
- `src/state/sessionManager.ts`
- `src/ai/promptCache.ts`
- `src/ai/tierEvaluator.ts`
- `src/prompts/index.ts`
- `.claude/docs/TYPES_REFERENCE.md`

---

## Check 1 — types.ts Fidelity

**Result: PASS (with advisory note)**

Every interface and type alias in `src/state/types.ts` matches the "Session Types"
section of `TYPES_REFERENCE.md` exactly:

| Type / Interface | Match |
|---|---|
| `SessionStatus` | ✓ |
| `EvaluationStatus` | ✓ |
| `StepStatus` | ✓ |
| `AIProviderName` | ✓ |
| `AuthResolvedVia` | ✓ |
| `ScaffoldingLevel` | ✓ |
| `PersonalityName` | ✓ |
| `SessionSettings` (6 fields) | ✓ |
| `Credentials` (5 fields) | ✓ |
| `AIProviderConfig` (4 fields) | ✓ |
| `Step` (10 fields) | ✓ |
| `Milestone` (4 fields) | ✓ |
| `FileTreeNode` (5 fields) | ✓ |
| `Plan` (7 fields) | ✓ |
| `Progress` (7 fields incl. optional) | ✓ |
| `ActionEntry` (5 fields) | ✓ |
| `TutorSession` (10 fields) | ✓ |
| `FileSummary` (5 fields) | ✓ |
| `DetectedStack` (6 fields) | ✓ |
| `ProjectIndex` (6 fields) | ✓ |

**Advisory (doc bug, not code bug):** `TYPES_REFERENCE.md` contains a duplicate
`Progress` interface. The first occurrence (lines 97–99) is a truncated stub
(only 3 fields). The second occurrence (lines 108–116) is the canonical full
definition with all 7 fields. The implementation in `src/state/types.ts` correctly
implements the full 7-field version. The doc should be cleaned up to remove the
stub.

---

## Check 2 — sessionManager Correctness

**Result: PASS**

| Sub-check | Detail | Result |
|---|---|---|
| `load()` reads from `.vscode/tutorcode.json` | `this.sessionPath = path.join(workspaceRoot, '.vscode', 'tutorcode.json')` — `load()` calls `fs.promises.readFile(this.sessionPath, 'utf-8')` | ✓ |
| `save()` writes JSON with indent | `JSON.stringify(session, null, 2)` — indent=2 spaces; uses atomic tmp→rename pattern | ✓ |
| `appendAction` trims to max 20 | Pushes entry then checks `actionHistory.length > 20` and slices to last 20 via `slice(-20)` | ✓ |
| `ensureGitignore` adds both entries | `entries = ['.vscode/tutorcode.json', '.vscode/tutorcode-index.json']` — appends any missing under `# TutorCode` header | ✓ |
| `onSessionChange` EventEmitter exists | `private readonly _onSessionChange = new vscode.EventEmitter<TutorSession>()` with public `onSessionChange = this._onSessionChange.event` | ✓ |

---

## Check 3 — promptCache Structure

**Result: PASS**

| Sub-check | Detail | Result |
|---|---|---|
| `buildTier2Prefix` returns `CachedPrefix` | Return type matches `{ system: CacheableBlock[]; contextMessages: Message[] }` | ✓ |
| system block is `MONITOR_HAIKU_PROMPT` with `cache: true` | `system = [{ text: MONITOR_HAIKU_PROMPT, cache: true }]` | ✓ |
| `contextMessages` contains plan+structure+goal with `cache: true` | Uses `MONITOR_HAIKU_USER_TEMPLATE` interpolated with `planText`, `expectedStructure`, `goal`; wrapped as `[{ text: contextUserContent, cache: true }]` | ✓ |
| `buildTier3Prefix` injects personality block into system | `PERSONALITY_BLOCKS[personality]` replaces `{personalityBlock}` in `TUTOR_SYSTEM_PROMPT` | ✓ |
| `buildTier3Prefix` injects scaffolding block into system | `SCAFFOLDING_BLOCKS[scaffoldingLevel]` replaces `{scaffoldingBehavior}` in `TUTOR_SYSTEM_PROMPT` | ✓ |
| `invalidate()` nulls cached data | Sets `tier2Cache`, `tier3Cache`, `tier2PlanHash`, `tier3PlanHash` all to `null` | ✓ |

---

## Check 4 — tierEvaluator Routing

**Result: PASS**

| Sub-check | Detail | Result |
|---|---|---|
| `evaluate()` calls `checkpointDetector` first (Tier 1) | `const checkpoint = checkpointEvaluate(event, step, this.index, this.recentEvents)` — first statement after event tracking | ✓ |
| High confidence Tier 1 → returns without AI call | `if (checkpoint.confidence === 'high' && checkpoint.status !== 'ambiguous')` returns `{ status, message: null, tier: 1 }` immediately | ✓ |
| Low confidence → calls `provider.monitor()` (Tier 2, Haiku) | Falls through to `this.provider.monitor(messages, options)` using `buildTier2Prefix` cached system | ✓ |
| `requestHint` uses `provider.complete()` not `monitor()` | Calls `this.provider.complete(messages, options)` with `tier: 3` result | ✓ |
| `requestGuidance` uses `provider.complete()` not `monitor()` | Calls `this.provider.complete(messages, options)` with `tier: 3` result | ✓ |

**Note:** The model selection for Tier 2 relies on `provider.monitor()` internalising
the Haiku model. The `CompleteOptions` passed to `monitor()` sets `model: ''` with a
comment "monitor() ignores this". This is an implementation contract with the provider
layer — acceptable per the architecture, but the provider implementation should be
verified to enforce Haiku for all `monitor()` calls in a separate check.

---

## Check 5 — prompts/index.ts Completeness

**Result: PASS**

All required exports are present:

| Export | Present |
|---|---|
| `TUTOR_SYSTEM_PROMPT` | ✓ |
| `MONITOR_HAIKU_PROMPT` | ✓ |
| `STEP_GUIDANCE_PROMPT` | ✓ |
| `HINT_REQUEST_PROMPT` | ✓ |
| `REENTRY_PROMPT` | ✓ |
| `EXISTING_SCAN_PROMPT` | ✓ |
| `STEP_COMPLETE_CONFIRM_PROMPT` | ✓ |
| `PLAN_GENERATION_PROMPT` | ✓ |
| `PLAN_REVISION_PROMPT` | ✓ |
| `PERSONALITY_MENTOR` | ✓ |
| `PERSONALITY_SENSEI` | ✓ |
| `PERSONALITY_PEER` | ✓ |
| `SCAFFOLDING_LEVEL_1` | ✓ |
| `SCAFFOLDING_LEVEL_2` | ✓ |
| `SCAFFOLDING_LEVEL_3` | ✓ |
| `PERSONALITY_BLOCKS` map | ✓ |
| `SCAFFOLDING_BLOCKS` map | ✓ |
| `interpolate()` helper | ✓ |
| `Prompts` convenience object | ✓ (bonus — not required, present) |

All 9 required named prompts and all 6 personality/scaffolding blocks are exported.

---

## Summary

| Check | Result |
|---|---|
| 1. types.ts fidelity | **PASS** (doc has duplicate stub — advisory only) |
| 2. sessionManager correctness | **PASS** |
| 3. promptCache structure | **PASS** |
| 4. tierEvaluator routing | **PASS** |
| 5. prompts/index.ts completeness | **PASS** |

**Overall: 5/5 PASS.** Sprint 2 implementation is structurally correct. No blocking
issues found. One advisory item: clean up the duplicate partial `Progress` definition
in `TYPES_REFERENCE.md` (lines 97–99).
