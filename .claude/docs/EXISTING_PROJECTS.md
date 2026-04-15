# Existing Projects

## Detection

On `tutorcode.start`, after goal capture, check workspace state:

```typescript
async function classifyWorkspace(root: string): Promise<'empty' | 'existing'> {
  const entries = await fs.promises.readdir(root)
  const significant = entries.filter(e =>
    !['node_modules', '.git', '.vscode', '.DS_Store', 'Thumbs.db'].includes(e)
  )
  return significant.length === 0 ? 'empty' : 'existing'
}
```

If `'existing'`, run the scan flow before generating the plan.
If `'empty'`, skip scan and go straight to plan generation.

---

## Scan Flow (Existing Projects)

### Step 1: Build File Tree (local, instant)

Walk the workspace recursively. Apply ignore patterns from `.gitignore` if it
exists, plus always-ignore list:
```
node_modules/, .git/, .next/, dist/, build/, .turbo/, coverage/
```

Build `FileTreeNode[]` structure — no AI needed for this step.

### Step 2: Detect Stack (local, instant)

Look for presence of key files to infer the stack:
```typescript
const stackSignals: Record<string, Partial<DetectedStack>> = {
  'package.json':       { runtime: ['nodejs'] },
  'next.config.*':      { framework: ['nextjs'] },
  'vite.config.*':      { framework: ['vite'] },
  'tsconfig.json':      { hasTypeScript: true },
  'requirements.txt':   { language: ['python'] },
  'pyproject.toml':     { language: ['python'] },
  'go.mod':             { language: ['go'] },
  'Cargo.toml':         { language: ['rust'] },
  'composer.json':      { language: ['php'] },
  'pom.xml':            { language: ['java'] },
}
```

### Step 3: Read Key Files (local, instant)

Read files matching `KEY_FILE_PATTERNS` from `docs/STATE.md`.
Truncate each at 2000 characters. Collect into a single batch payload.
Typical total: 3000–8000 characters depending on project size.

### Step 4: Single Sonnet Scan Call

One AI call that does everything: summarize what's built, infer what's missing,
suggest the continuation plan. See `prompts/tasks/EXISTING_SCAN.md`.

Input to the call:
```
- User's stated goal
- Detected stack
- File tree (full, as formatted string)
- Key file contents (batched, truncated)
```

Output: same Plan structure as a fresh plan, but with:
- `description` noting what's already been done
- Steps that represent what's remaining
- `recommendedStructure` showing the target end state
- First active step set to whatever is actually next

### Step 5: Show Plan for Suggestion

Same flow as new projects — display plan, accept suggestions, commit.
User should see something like:

> "I can see you've started a Next.js app. You have the basic routing set up
> but the data layer and UI components are missing. Here's my plan for what's
> left..."

---

## What Counts as "Too Large to Scan"

If the file tree has more than 500 files (excluding ignored paths), show a warning:
"This is a large project. TutorCode will scan key files only — some context may
be limited."

In this case, skip full tree summarization and only read:
- Root-level files
- `src/` or `app/` top level (1 level deep only)
- Package/config files

---

## Re-Indexing During Session

After the initial scan, `projectIndexer.ts` maintains the index:
- On `file_create`: add node to tree, if it's a key file pattern → summarize it
- On `file_delete`: remove node from tree, remove summary if exists
- On directory create/delete: rebuild subtree

Do **not** re-summarize files on every save — only on first creation.
Re-summarize only when the user explicitly runs `tutorcode.reindex`.

---

## Context Freshness for AI Calls

The project index used in AI calls should reflect the **actual current state**,
not just the initial scan. This is important for step completion detection —
if the AI's context shows the file doesn't exist but it does, false negatives happen.

Always call `projectIndexer.getIndex()` (sync, in-memory) when building the
context for a Tier 3 call. The in-memory index is always more current than
the JSON on disk (which is written async).
