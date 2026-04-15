# State

## Files

Two state files live in `.vscode/`:

```
.vscode/
  tutorcode.json         ← session: goal, plan, progress, config
  tutorcode-index.json   ← project index: file tree, file summaries
```

Both are gitignored by default (extension adds entries on first write).
Both are human-readable JSON — users can inspect and manually edit if needed.

---

## tutorcode.json Schema

```typescript
interface TutorSession {
  version: string                    // schema version, e.g. "1.0"
  goal: string                       // user's stated goal
  createdAt: string                  // ISO 8601
  updatedAt: string                  // ISO 8601
  status: SessionStatus
  aiProvider: AIProviderConfig
  settings: SessionSettings          // scaffolding, personality, avatar
  plan: Plan
  progress: Progress
  actionHistory: ActionEntry[]       // last 20 actions only (rolling)
}

interface SessionSettings {
  scaffoldingLevel: 1 | 2 | 3                        // default: 2
  personality: 'mentor' | 'sensei' | 'peer'          // default: 'mentor'
  avatar: string                                      // default: 'default'
  // Per-session overrides — null means use level default
  cooldownSeconds: number | null
  maxHintsPerStep: number | null
  autoNudgeMinutes: number | null
}

type SessionStatus =
  | 'planning'           // plan not yet committed
  | 'active'             // guidance running
  | 'paused'             // user paused, resume pending
  | 'complete'           // all steps done
  | 'abandoned'          // user quit mid-session

interface AIProviderConfig {
  provider: 'anthropic' | 'openai' | 'grok' | 'openrouter'
  guidanceModel: string
  monitorModel: string
  resolvedVia: 'file' | 'cli' | 'env' | 'secret'
}

interface Plan {
  title: string
  description: string
  recommendedStructure: FileTreeNode[]
  steps: Step[]
  milestones: Milestone[]
  mermaidDiagram: string             // raw mermaid code block
  committedAt?: string               // set when user clicks Commit Plan
  revisionCount: number
}

interface Step {
  id: string                         // "step_1", "step_2", etc.
  number: number
  title: string
  description: string
  guidance: string                   // what the tutor says when entering this step
  expectedFiles: string[]            // relative paths expected to exist/change
  expectedCommands: string[]         // terminal commands expected for this step
  completionCriteria: string         // plain English, used by Tier 1/2 evaluator
  status: 'pending' | 'active' | 'complete' | 'skipped'
  startedAt?: string
  completedAt?: string
}

interface Milestone {
  id: string
  title: string
  afterStep: number                  // milestone reached after completing this step number
  celebrationMessage: string
}

interface Progress {
  currentStepId: string
  completedStepIds: string[]
  percentComplete: number            // 0-100, derived
  hintsUsedThisStep: number          // reset on step advance
  consecutiveHintlessSteps: number   // for adaptive level suggestion
  consecutiveMaxHintSteps: number    // for adaptive level suggestion
  lastLevelSuggestionAt?: string     // ISO 8601 — don't suggest again this session
}

interface ActionEntry {
  timestamp: string
  type: 'file_save' | 'file_create' | 'file_delete' | 'terminal_command' | 'diagnostic_change'
  description: string                // human-readable, used in AI context
  stepId: string                     // which step was active
  evaluationResult?: EvaluationStatus
}

type EvaluationStatus = 'on_track' | 'minor_drift' | 'major_drift' | 'step_complete'
```

---

## tutorcode-index.json Schema

```typescript
interface ProjectIndex {
  version: string
  indexedAt: string
  workspaceRoot: string
  tree: FileTreeNode[]
  keySummaries: Record<string, FileSummary>   // relative path → summary
  detectedStack: DetectedStack
}

interface FileTreeNode {
  name: string
  path: string                       // relative to workspace root
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  ignored: boolean                   // node_modules, .git, etc.
}

interface FileSummary {
  path: string
  purpose: string                    // 1-2 sentence AI-generated summary
  exports?: string[]                 // top-level exports detected
  imports?: string[]                 // key imports (framework signals)
  generatedAt: string
}

interface DetectedStack {
  language: string[]                 // ['typescript', 'javascript']
  framework: string[]                // ['nextjs', 'react']
  runtime: string[]                  // ['nodejs', 'bun']
  packageManager: string             // 'npm' | 'yarn' | 'pnpm' | 'bun'
  hasTypeScript: boolean
  configFiles: string[]              // detected config files (tsconfig, etc.)
}
```

---

## Key Files to Summarize (for projectIndexer)

Don't summarize every file — only files that provide structural context:

```typescript
const KEY_FILE_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'next.config.*',
  'vite.config.*',
  'app/layout.*',
  'app/page.*',
  'pages/index.*',
  'src/index.*',
  'src/main.*',
  'src/App.*',
  'src/app.*',
  'prisma/schema.prisma',
  'drizzle.config.*',
  '.env.example',
  'README.md',
]
```

Glob these patterns, read matching files (truncate at 500 tokens each),
send as a single batched Haiku call. One call per indexing run, not per file.

---

## sessionManager.ts Interface

```typescript
class SessionManager {
  // Read/write
  async load(): Promise<TutorSession | null>
  async save(session: TutorSession): Promise<void>
  async updateProgress(stepId: string, status: Step['status']): Promise<void>
  async appendAction(entry: ActionEntry): Promise<void>     // auto-trims to 20

  // Computed
  getCurrentStep(session: TutorSession): Step | null
  getNextStep(session: TutorSession): Step | null
  isComplete(session: TutorSession): boolean

  // Events
  onSessionChange: vscode.EventEmitter<TutorSession>
}
```

---

## projectIndexer.ts Interface

```typescript
class ProjectIndexer {
  async buildIndex(): Promise<ProjectIndex>           // full initial scan
  async refreshTree(): Promise<void>                  // on file create/delete
  async summarizeFile(path: string): Promise<FileSummary>
  async detectStack(): Promise<DetectedStack>
  getIndex(): ProjectIndex | null                     // sync read from memory
  onIndexChange: vscode.EventEmitter<ProjectIndex>
}
```

---

## .gitignore Entries Added on First Write

```
# TutorCode
.vscode/tutorcode.json
.vscode/tutorcode-index.json
```

Check if `.gitignore` exists first. If yes, append only if entries not already present.
If no `.gitignore`, create it with only the TutorCode entries.
