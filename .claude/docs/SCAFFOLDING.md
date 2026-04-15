# Scaffolding

## Concept

Scaffolding is the gradual removal of support as competence grows. Coined by
Vygotsky — the idea that a learner needs structured help at first, but the help
itself must fade or it becomes a crutch. TutorCode implements this as three
discrete levels the user can set manually, with an optional adaptive suggestion
system layered on top.

Level is stored in `session.settings.scaffoldingLevel` and can be changed at
any time. Changing level mid-session takes effect immediately.

---

## Level Behaviour Matrix

| Behaviour | Level 1 — Guided | Level 2 — Standard | Level 3 — Challenge |
|-----------|-----------------|-------------------|---------------------|
| **Step descriptions** | Verbose, explicit steps | Moderate detail | Title only |
| **Hints per step** | Unlimited | 3 max | 1 max |
| **Hint style** | Near-answer, directional | Socratic question | "Something is off" only |
| **Cooldown** | 15s | 30s | 60s |
| **Auto-nudge if stuck** | After 5 min | After 10 min | Never |
| **Drift flagged** | Minor + Major | Minor + Major | Major only |
| **Plan granularity** | 10–12 fine steps | 7–9 steps | 5–6 broad steps |
| **Character frequency** | Chatty | Moderate | Mostly silent |
| **Step complete** | Immediate praise + message | Praise + message | Silent advance |
| **Error guidance** | Explains what the error means | Points to the error | Silent |
| **Re-entry message** | Full context recap | Brief recap | None |

---

## Level Definitions for AI Prompts

These blocks are injected as `{scaffoldingBehavior}` in the tutor system prompt.

### Level 1 — Guided

```
SCAFFOLDING LEVEL: 1 (Guided)

Behaviour rules for this level:
- Be generous with context. Describe what the user needs to do with enough
  detail that someone new to this framework could follow.
- Hints can be near-answers. It's okay to say "the hook you need is useEffect"
  without writing the code itself.
- Nudge the user if they haven't acted in 5 minutes.
- Flag minor drift — even small deviations are worth noting.
- Celebrate every step completion, even small ones.
- If the user has errors, briefly explain what category of error it is
  (e.g. "This looks like a type mismatch — check what you're passing vs what's expected").
- Re-entry from chat should fully recap where they were.
```

### Level 2 — Standard

```
SCAFFOLDING LEVEL: 2 (Standard)

Behaviour rules for this level:
- Step descriptions are clear but not hand-holding. Assume the user knows
  the language, not necessarily the framework.
- Hints are Socratic — questions that guide reasoning, not near-answers.
  Maximum 3 hints per step. After the 3rd, you may be slightly more direct.
- Nudge after 10 minutes of inactivity.
- Flag minor and major drift.
- Acknowledge step completion with encouragement but keep it brief.
- Don't explain errors — point to them and ask what the user thinks they mean.
```

### Level 3 — Challenge

```
SCAFFOLDING LEVEL: 3 (Challenge)

Behaviour rules for this level:
- Step titles only. No description, no guidance message on entry. The user
  figures out what "Create data layer" means.
- Maximum 1 hint per step. Make it count — only confirm something is wrong,
  never point to what.
- Never nudge for inactivity.
- Only flag major drift — minor deviations are the user's business.
- Step completion is silent. Advance without ceremony.
- Never explain errors. If asked about an error, respond only with
  "What does the error message tell you?"
- No re-entry message when returning from chat.
```

---

## Hint Style by Level

The hint system uses the scaffolding level to select the prompt variant.
See `prompts/tasks/TASK_PROMPTS.md → HINT_REQUEST` for the full prompt.

**Level 1 example** (user stuck on writing a fetch call):
> "The browser has a built-in function called `fetch` — it takes a URL and returns a Promise. What do you think you need to do with a Promise to get the data out of it?"

**Level 2 example** (same situation):
> "What does your function need to do asynchronously, and what JavaScript pattern handles that?"

**Level 3 example** (same situation):
> "Something about how you're handling the async response isn't right."

---

## Adaptive Level Suggestions

TutorCode tracks hint usage and step completion patterns to optionally suggest
a level change. This is a suggestion only — never automatic.

### Suggest Level Up (harder)

Trigger when: last 3 steps completed with 0 hints each.

Message in character bubble:
> "You haven't needed a hint in a while — you might be ready for Level {N+1}. Want to try it?"

Buttons: [Try it] [Stay here]

### Suggest Level Down (easier)

Trigger when: user used max hints on 3 consecutive steps.

Message in character bubble:
> "These steps have been tough — no shame in getting more support. Want to switch to Level {N-1}?"

Buttons: [Switch] [Keep going]

### Implementation

Track in `session.progress`:
```typescript
interface Progress {
  // ... existing fields
  consecutiveHintlessSteps: number    // reset on any hint use
  consecutiveMaxHintSteps: number     // reset on any step with unused hints
  lastLevelSuggestionAt?: string      // don't suggest again within same session
}
```

Only one suggestion per session. If user dismisses, don't ask again.
Costs one Tier 1 check (pure logic, no AI call).

---

## Plan Generation and Scaffolding Level

The plan generation prompt must receive the scaffolding level so it calibrates
step granularity appropriately. Pass `{scaffoldingLevel}` in the plan generation
call. See `prompts/tasks/PLAN_GENERATION.md` for how it affects the output.

Level 1 plan for "Next.js to-do app": 11 steps, first step is "Run npx create-next-app and verify it starts"
Level 3 plan for same goal: 5 steps, first step is "Initialize project"

Same destination, completely different amount of hand-holding on the way there.

---

## Settings Override

`settings.json` values override level defaults for the current workspace:

```jsonc
{
  "tutorcode.scaffoldingLevel": 2,
  "tutorcode.cooldownSeconds": 45,      // overrides level 2 default of 30
  "tutorcode.maxHintsPerStep": 2,       // overrides level 2 default of 3
  "tutorcode.autoNudgeMinutes": null    // null = use level default
}
```

Resolution order: explicit setting > level default.
