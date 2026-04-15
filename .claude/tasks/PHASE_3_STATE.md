# Phase 3 — State

## Goal
Implement session persistence and project indexing. By end of this phase,
running `tutorcode.start` creates `tutorcode.json` and `tutorcode-index.json`
in `.vscode/` with correct schemas.

## Read First
`docs/STATE.md` — all schemas defined there. Implement exactly.

## Files to Create
- `src/state/sessionManager.ts`
- `src/state/projectIndexer.ts`
- `src/state/types.ts` — re-export all interfaces from STATE.md

## sessionManager.ts

Implement all methods from the interface in `docs/STATE.md`.

Key implementation notes:
- On `load()`: return `null` if file doesn't exist (not an error — means fresh start)
- On `save()`: write atomically — write to `.vscode/tutorcode.json.tmp` then rename
- On `appendAction()`: keep only the last 20 entries, splice the oldest
- `onSessionChange` should fire after every `save()` call
- Add `.vscode/tutorcode.json` to `.gitignore` on first write

## projectIndexer.ts

`buildIndex()`:
1. Walk workspace root with `vscode.workspace.findFiles` using ignore glob
2. Build `FileTreeNode[]` — recursive structure
3. Run `detectStack()` from config file presence
4. Read key files matching `KEY_FILE_PATTERNS` from `docs/STATE.md`
5. Single Haiku call to summarize all key files in one batch:
   ```
   For each of these files, write a 1-2 sentence summary of its purpose.
   Return JSON: { "summaries": { "path": "summary", ... } }
   ```
6. Write result to `.vscode/tutorcode-index.json`
7. Store in memory as `this.currentIndex`

`refreshTree()`:
- Only rebuild the file tree structure, not summaries
- Called on `onDidCreateFiles` / `onDidDeleteFiles`

`summarizeFile(path)`:
- Single Haiku call for one file
- Called after `file_create` for key file patterns only

## .gitignore Management

```typescript
async function ensureGitignoreEntries(workspaceRoot: string): Promise<void> {
  const gitignorePath = path.join(workspaceRoot, '.gitignore')
  const entries = [
    '\n# TutorCode',
    '.vscode/tutorcode.json',
    '.vscode/tutorcode-index.json',
  ]
  // Check if entries exist, append only if missing
}
```

## Verification
After running `tutorcode.start` stub (which now calls indexer):
- `.vscode/tutorcode-index.json` exists with valid schema
- File tree accurately reflects workspace
- Stack detection identifies framework from `package.json`
- `.gitignore` has TutorCode entries
