# Plan Generation Prompt

Used on `tutorcode.start` after goal capture and workspace scan.
Tier 3 (Sonnet). Single call. Returns structured plan.

---

## User Message

```
Generate a complete learning plan for this goal.

GOAL: {user.goal}
SCAFFOLDING LEVEL: {session.settings.scaffoldingLevel}
WORKSPACE STATE: {empty | existing — see EXISTING_SCAN prompt if existing}
DETECTED STACK (if existing): {detectedStack or "none"}
EXISTING FILES (if any): {file tree or "empty workspace"}

Step granularity by scaffolding level:
- Level 1: 10–12 steps. Fine-grained. Each step is small and explicit.
  First step example: "Run npx create-next-app and verify the dev server starts"
- Level 2: 7–9 steps. Moderate granularity. Framework knowledge assumed.
  First step example: "Initialize the Next.js project"
- Level 3: 5–6 steps. Broad. Language knowledge fully assumed.
  First step example: "Project setup"

Step description verbosity by scaffolding level:
- Level 1: Full description. What to do, why, and what done looks like.
- Level 2: What to do. Why is implicit.
- Level 3: One sentence or less. Title is often enough.

Guidance message by scaffolding level:
- Level 1: 3 sentences. Explains context, gives direction, ends with question.
- Level 2: 2 sentences. Gives direction, ends with question.
- Level 3: 1 sentence max, or empty string. User figures it out.

Return a JSON object with this exact structure — no prose before or after:

{
  "title": "short project title",
  "description": "2-3 sentence description of what will be built",
  "mermaidDiagram": "graph TD\\n  A[Start] --> B[...]",
  "recommendedStructure": [
    { "path": "app/page.tsx", "purpose": "Main page component" },
    ...
  ],
  "steps": [
    {
      "id": "step_1",
      "number": 1,
      "title": "Short action title",
      "description": "What the user needs to accomplish in this step",
      "guidance": "What the tutor says when the user enters this step. Max 3 sentences. No code. Ends with a question.",
      "expectedFiles": ["relative/path/to/file.ts"],
      "expectedCommands": ["npm install", "npx create-next-app"],
      "completionCriteria": "Plain English description of what done looks like"
    }
  ],
  "milestones": [
    {
      "id": "milestone_1",
      "title": "Foundation Complete",
      "afterStep": 3,
      "celebrationMessage": "Celebratory message, max 2 sentences. Acknowledge the work."
    }
  ]
}

Rules for plan generation:
- 6 to 12 steps for most projects. Not too granular, not too broad.
- Each step should take 10-30 minutes for an intermediate developer.
- Steps must be sequential — each builds on the previous.
- expectedFiles should be realistic relative paths, not placeholders.
- expectedCommands should be actual CLI commands the user would run.
- guidance must be Socratic — end with a question that gets them thinking.
- Mermaid diagram should show the architecture, not the steps. Use graph TD.
- recommendedStructure: include all significant files/dirs, not config noise.
- For Next.js: use App Router structure (app/ dir) unless goal says otherwise.
- For existing projects: only include steps for what remains to be built.
```

---

## Plan Revision Prompt (Suggestion Loop)

When user submits a suggestion before committing:

```
The user has a suggestion for the plan.

CURRENT PLAN STEPS:
{steps as numbered list, titles only}

USER SUGGESTION: {user.suggestion}

Revise only the steps affected by this suggestion. Return the same JSON structure
as the original plan, with only changed steps updated. Keep all other steps identical.
Explain the change in a "revisionNote" field at the top level:
{
  "revisionNote": "One sentence explaining what changed and why",
  ...rest of plan...
}
```

---

## Output Handling

Parse the JSON response. If parsing fails (model added prose), strip everything
before the first `{` and after the last `}` before retrying the parse.

Validate required fields:
- `steps` array has at least 3 items
- Each step has `id`, `number`, `title`, `guidance`, `expectedFiles`
- `mermaidDiagram` is a non-empty string starting with `graph`

If validation fails, show error in chat panel: "Plan generation had an issue —
trying again." Retry once with a note: "Your previous response had a JSON parsing
error. Return only valid JSON, no other text."
