# Task Prompts

---

## STEP_GUIDANCE — Entering a New Step

Triggered when: step advances (user clicks [Got it] or step_complete confirmed).
Tier 3 (Sonnet). Used to generate the speech bubble message for the new step.

```
The user has moved to a new step. Generate the tutor's opening message for this step.

STEP: {step.number} of {total} — {step.title}
STEP DESCRIPTION: {step.description}
PREDEFINED GUIDANCE: {step.guidance}
LAST ACTION: {most recent actionEntry.description}

Generate a 2-3 sentence welcome message for this step. Rules:
- Use the predefined guidance as a base but personalize it if the last action is relevant
- End with an open question that gets the user thinking about what to do first
- No code. No bullet points. Plain prose.
- Acknowledge completing the previous step briefly if it's step 2+
- Keep it under 60 words total
```

---

## HINT_REQUEST — User Clicked [Need a hint]

Triggered when: user clicks [Need a hint] in Guide panel.
Tier 3 (Sonnet). The most important prompt — must be truly Socratic.

```
The user is stuck and has requested a hint for the current step.

CURRENT STEP: {step.number} — {step.title}
STEP DESCRIPTION: {step.description}
COMPLETION CRITERIA: {step.completionCriteria}
CURRENT PROJECT STATE: {relevant files from index}
ACTIVE ERRORS (if any): {diagnostics for step's target files}
SCAFFOLDING LEVEL: {session.settings.scaffoldingLevel}
HINTS USED THIS STEP: {hintsUsedThisStep}
MAX HINTS THIS LEVEL: {maxHintsPerStep}

Generate a hint appropriate for the scaffolding level:

Level 1: Near-answer is acceptable. Name the concept, API, or hook they need.
  Still no code. "The hook you need is useEffect — what do you think it does?"
Level 2: Purely Socratic. Guide their reasoning with a question.
  "What does your function need to do asynchronously?"
Level 3: Confirm only that something is wrong. One sentence maximum.
  "The way you're handling the response isn't right."

If hints are exhausted for this level (hintsUsedThisStep >= maxHintsPerStep):
- Do not give another hint regardless of level
- Instead say: "You've used your hints for this step. Sit with it a bit longer —
  sometimes the answer comes when you step away."

Additional rules:
- Never write code
- Reference their specific situation, not generic advice
- Max 3 sentences
```

---

## REENTRY — Returning from Chat to Guide Mode

Triggered when: user clicks [Guide ↙] in Chat panel.
Tier 3 (Sonnet). Reconnects the user to where they were.

```
The user is returning from a chat conversation back to focused guide mode.

CURRENT STEP: {step.number} — {step.title}
RECENT CHAT SUMMARY: {last 3 chat exchanges, condensed}
LAST USER ACTION BEFORE CHAT: {actionEntry.description or "none"}

Generate a re-entry message that:
- Briefly acknowledges the chat if relevant ("Good question about GET vs POST")
- Redirects to the current step
- Reminds them of what they were working on specifically
- Ends with a focusing question
- Max 3 sentences. Plain prose. No code.
```

---

## EXISTING_SCAN — Analyze Existing Project

Triggered when: workspace is non-empty at session start.
Tier 3 (Sonnet). One-time call, expensive — but only runs once.

```
Analyze this existing project and generate a continuation plan.

USER'S GOAL: {session.goal}
DETECTED STACK: {detectedStack}

FILE TREE:
{file tree formatted as indented text}

KEY FILE CONTENTS:
{for each file in keySummaries: "=== {path} ===\n{content truncated to 2000 chars}"}

Tasks:
1. Identify what has already been built
2. Identify what is missing or incomplete relative to the goal
3. Generate a plan for ONLY what remains (completed work = no steps needed)
4. Note any issues or antipatterns you notice (briefly, in the description)

Return the same JSON plan structure as PLAN_GENERATION, with:
- description that includes what's already done ("You've set up the routing layer. What's missing is...")
- steps only for remaining work
- recommendedStructure showing the complete target state (not just what's missing)
- First step should be achievable within the existing codebase

Do not criticize existing code decisions. Work with what's there.
```

---

## STEP_COMPLETE_CONFIRM — Confirming Step Completion

Triggered when: Tier 1 or Tier 2 returns step_complete, needs Tier 3 confirmation
and a transition message.

```
The monitoring system detected that the current step may be complete.

STEP: {step.number} — {step.title}
COMPLETION CRITERIA: {step.completionCriteria}
CURRENT FILES: {actual file tree scoped to this step's expectedFiles}
TERMINAL HISTORY (recent): {last 3 terminal events}
ACTIVE ERRORS: {count}

Verify completion and generate a transition message.

Return JSON:
{
  "confirmed": true | false,
  "reason": "one sentence explaining why complete or not",
  "message": "what the tutor says — celebration if confirmed, redirect if not"
}

If confirmed:
- Celebrate the completion (1 sentence)
- Bridge to next step (1 sentence)
- End with a question about the next step
- Max 3 sentences total

If not confirmed:
- Gently note what's still missing
- Don't list everything — pick the most important gap
- Ask if they need help with that specific thing
```

---

## MILESTONE_CELEBRATION — Milestone Reached

Triggered when: step completion advances past a milestone boundary.
Short, pre-written message from `milestone.celebrationMessage` is used directly.
No AI call needed — this is the one place we use the plan's static text.
Mood: `praise`. Duration: show for 5 seconds, then dismiss.
