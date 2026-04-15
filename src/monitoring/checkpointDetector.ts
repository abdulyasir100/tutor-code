import {
  MonitoringEvent,
  FileSaveEvent,
  FileCreateEvent,
  FileDeleteEvent,
  TerminalCmdEvent,
  DiagnosticsEvent,
} from './types'
import { Step, ProjectIndex, Plan, FileTreeNode } from '../state/types'
import { CheckpointResult } from '../ai/providers/types'

// ── Ignore patterns ────────────────────────────────────────────────

const IGNORED_SEGMENTS = [
  '/node_modules/',
  '/.git/',
  '/.next/',
  '/dist/',
  '/build/',
  '/.turbo/',
]

const IGNORED_EXTENSIONS = ['.log', '.lock']

const IGNORED_FILENAMES = [
  'yarn.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
]

const DEPLOY_COMMANDS = [
  'deploy',
  'publish',
  'release',
  'push',       // git push
]

/**
 * Check whether a relative path should be silently ignored.
 */
export function isIgnoredPath(relativePath: string): boolean {
  const normalized = '/' + relativePath.replace(/\\/g, '/')

  for (const seg of IGNORED_SEGMENTS) {
    if (normalized.includes(seg)) return true
  }
  if (normalized.startsWith('/node_modules/') || normalized.startsWith('/.git/')) return true

  for (const ext of IGNORED_EXTENSIONS) {
    if (normalized.endsWith(ext)) return true
  }

  const filename = normalized.split('/').pop() ?? ''
  if (IGNORED_FILENAMES.includes(filename)) return true

  // Own state files
  if (normalized.includes('/.vscode/tutorcode') && normalized.endsWith('.json')) return true

  return false
}

/**
 * Check whether a terminal command looks like a deploy/publish command.
 */
export function isDeployCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase().trim()
  const parts = lower.split(/\s+/)

  // "git push" is deploy-like, but plain "push" from other tools also counts
  if (parts[0] === 'git' && parts[1] === 'push') return true

  for (const keyword of DEPLOY_COMMANDS) {
    // Match: npm deploy, npx deploy, yarn deploy, pnpm deploy, bun deploy, etc.
    if (parts.includes(keyword)) return true
    // Match: npm run deploy, yarn run release, etc.
    if (parts.includes('run') && parts.includes(keyword)) return true
  }

  return false
}

/**
 * Check whether a relative path matches one of the step's expected files.
 */
export function pathMatchesStep(relativePath: string, step: Step): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  return step.expectedFiles.some((expected) => {
    const normalizedExpected = expected.replace(/\\/g, '/')
    return (
      normalized === normalizedExpected ||
      normalized.endsWith('/' + normalizedExpected) ||
      normalizedExpected.endsWith('/' + normalized)
    )
  })
}

/**
 * Check whether a relative path exists anywhere in the plan's recommended structure.
 */
export function pathInPlan(relativePath: string, plan: Plan): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  return plan.recommendedStructure.some((entry) => {
    const entryPath = entry.path.replace(/\\/g, '/')
    return (
      normalized === entryPath ||
      normalized.endsWith('/' + entryPath) ||
      entryPath.endsWith('/' + normalized)
    )
  })
}

/**
 * Check whether a terminal command matches one of the step's expected commands.
 */
export function commandMatchesStep(cmd: string, step: Step): boolean {
  const lowerCmd = cmd.toLowerCase().trim()
  return step.expectedCommands.some((expected) => {
    const lowerExpected = expected.toLowerCase().trim()
    return lowerCmd === lowerExpected || lowerCmd.includes(lowerExpected)
  })
}

/**
 * Recursively check whether a file path exists in the project tree.
 */
function fileExistsInTree(relativePath: string, tree: FileTreeNode[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  for (const node of tree) {
    const nodePath = node.path.replace(/\\/g, '/')
    if (nodePath === normalized) return true
    if (node.children && node.children.length > 0) {
      if (fileExistsInTree(relativePath, node.children)) return true
    }
  }
  return false
}

/**
 * Get the count of recent diagnostics errors for a given relative path.
 */
function getRecentErrorCount(relativePath: string, recentEvents: MonitoringEvent[]): number {
  // Walk backwards through recent events to find the latest diagnostics for this path
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    const evt = recentEvents[i]
    if (evt.type === 'diagnostics' && evt.relativePath === relativePath) {
      return evt.errorCount
    }
  }
  return 0
}

/**
 * Check whether all expected files for a step exist in the project tree.
 */
function allExpectedFilesExist(step: Step, index: ProjectIndex): boolean {
  if (step.expectedFiles.length === 0) return false
  return step.expectedFiles.every((expected) => {
    const normalized = expected.replace(/\\/g, '/')
    return fileExistsInTree(normalized, index.tree)
  })
}

/**
 * Check whether all expected commands for a step appear in recent terminal events.
 */
function allExpectedCommandsRan(step: Step, recentEvents: MonitoringEvent[]): boolean {
  if (step.expectedCommands.length === 0) return true
  const terminalEvents = recentEvents.filter(
    (e): e is TerminalCmdEvent => e.type === 'terminal_cmd',
  )
  return step.expectedCommands.every((expected) => {
    const lowerExpected = expected.toLowerCase().trim()
    return terminalEvents.some((te) => {
      const lowerCmd = te.command.toLowerCase().trim()
      return lowerCmd === lowerExpected || lowerCmd.includes(lowerExpected)
    })
  })
}

/**
 * Check whether the step's target files have zero errors.
 */
function stepFilesErrorFree(step: Step, recentEvents: MonitoringEvent[]): boolean {
  return step.expectedFiles.every((f) => {
    const normalized = f.replace(/\\/g, '/')
    return getRecentErrorCount(normalized, recentEvents) === 0
  })
}

// ── Main evaluator ─────────────────────────────────────────────────

/**
 * Tier 1 checkpoint detector — pure logic, no side effects, no AI calls.
 *
 * Returns a CheckpointResult indicating the user's progress status.
 * High-confidence results are handled locally. Low-confidence results
 * should be escalated to Tier 2 (Haiku).
 */
export function evaluate(
  event: MonitoringEvent,
  step: Step,
  index: ProjectIndex,
  recentEvents: MonitoringEvent[],
): CheckpointResult {
  // ── Drop signals (ignored paths) ────────────────────────────────
  if (event.type !== 'terminal_cmd') {
    const path = 'relativePath' in event ? event.relativePath : ''
    if (path && isIgnoredPath(path)) {
      return {
        status: 'on_track',
        confidence: 'high',
        reason: `Ignored path: ${path}`,
      }
    }
  }

  // ── Step completion detection ───────────────────────────────────
  if (
    allExpectedFilesExist(step, index) &&
    allExpectedCommandsRan(step, recentEvents) &&
    stepFilesErrorFree(step, recentEvents)
  ) {
    return {
      status: 'step_complete',
      confidence: 'high',
      reason: `All expected files exist, commands ran, and no errors in target files.`,
    }
  }

  // ── Event-specific evaluation ───────────────────────────────────

  switch (event.type) {
    case 'file_create':
      return evaluateFileCreate(event, step, index)

    case 'file_save':
      return evaluateFileSave(event, step)

    case 'file_delete':
      return evaluateFileDelete(event, step, recentEvents)

    case 'terminal_cmd':
      return evaluateTerminalCmd(event, step)

    case 'diagnostics':
      return evaluateDiagnostics(event, recentEvents)
  }
}

function evaluateFileCreate(
  event: FileCreateEvent,
  step: Step,
  index: ProjectIndex,
): CheckpointResult {
  const path = event.relativePath

  // On-track: file matches step's expected files
  if (pathMatchesStep(path, step)) {
    return {
      status: 'on_track',
      confidence: 'high',
      reason: `Created file "${path}" matches step expected file.`,
    }
  }

  // Check if the path is in the plan at all
  // We need the plan from a broader scope — use index to check recommended structure isn't available
  // so we check if the file is "reasonable" (config, hidden, etc.)
  const filename = path.split('/').pop() ?? ''
  const isConfigOrHidden =
    filename.startsWith('.') ||
    filename.endsWith('.config.js') ||
    filename.endsWith('.config.ts') ||
    filename.endsWith('.config.mjs') ||
    filename === 'tsconfig.json' ||
    filename === 'package.json'

  if (isConfigOrHidden) {
    return {
      status: 'on_track',
      confidence: 'high',
      reason: `Created config/hidden file "${path}" — likely benign.`,
    }
  }

  // Not in step's expected files and not a config file → minor drift
  return {
    status: 'minor_drift',
    confidence: 'low',
    reason: `Created file "${path}" not in step's expected files. May be off-plan.`,
  }
}

function evaluateFileSave(event: FileSaveEvent, step: Step): CheckpointResult {
  const path = event.relativePath

  // On-track: saving one of the step's target files
  if (pathMatchesStep(path, step)) {
    // File is expected, but content change is ambiguous — could be correct or wrong
    return {
      status: 'ambiguous',
      confidence: 'low',
      reason: `Saved step target file "${path}" — content change needs Tier 2 review.`,
    }
  }

  // Saving a file not in current step — low priority, probably fine
  return {
    status: 'on_track',
    confidence: 'low',
    reason: `Saved file "${path}" not in current step's targets — ambiguous.`,
  }
}

function evaluateFileDelete(
  event: FileDeleteEvent,
  step: Step,
  recentEvents: MonitoringEvent[],
): CheckpointResult {
  const path = event.relativePath

  // Major drift: deleting a file that was part of a completed step
  // We approximate "completed step deliverable" by checking if the file
  // was previously created in recent events
  const wasCreated = recentEvents.some(
    (e) => e.type === 'file_create' && e.relativePath === path,
  )

  if (wasCreated || pathMatchesStep(path, step)) {
    return {
      status: 'major_drift',
      confidence: 'high',
      reason: `Deleted file "${path}" that was a step deliverable or recently created.`,
    }
  }

  return {
    status: 'on_track',
    confidence: 'high',
    reason: `Deleted file "${path}" — not a step deliverable.`,
  }
}

function evaluateTerminalCmd(event: TerminalCmdEvent, step: Step): CheckpointResult {
  const cmd = event.command

  // On-track: command matches step's expected commands
  if (commandMatchesStep(cmd, step)) {
    return {
      status: 'on_track',
      confidence: 'high',
      reason: `Terminal command "${cmd}" matches step expected command.`,
    }
  }

  // Major drift: deploy/publish command when not expected
  if (isDeployCommand(cmd) && !commandMatchesStep(cmd, step)) {
    return {
      status: 'major_drift',
      confidence: 'high',
      reason: `Deploy/publish command "${cmd}" ran but not expected at this step.`,
    }
  }

  // Unclear exit code or unrecognized command → ambiguous
  if (event.exitCode === null) {
    return {
      status: 'ambiguous',
      confidence: 'low',
      reason: `Terminal command "${cmd}" completed with unknown exit code.`,
    }
  }

  // Non-zero exit code — something went wrong, but maybe expected
  if (event.exitCode !== 0) {
    return {
      status: 'ambiguous',
      confidence: 'low',
      reason: `Terminal command "${cmd}" exited with code ${event.exitCode}.`,
    }
  }

  // Successful command not in step expectations — probably fine
  return {
    status: 'on_track',
    confidence: 'low',
    reason: `Terminal command "${cmd}" succeeded but not in step expectations.`,
  }
}

function evaluateDiagnostics(
  event: DiagnosticsEvent,
  recentEvents: MonitoringEvent[],
): CheckpointResult {
  // Find previous error count for this file
  let prevCount = 0
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    const e = recentEvents[i]
    if (
      e.type === 'diagnostics' &&
      e.relativePath === event.relativePath &&
      e.timestamp < event.timestamp
    ) {
      prevCount = e.errorCount
      break
    }
  }

  const currentCount = event.errorCount

  // Error count decreased — user is fixing errors, on track
  if (currentCount < prevCount) {
    return {
      status: 'on_track',
      confidence: 'high',
      reason: `Error count for "${event.relativePath}" decreased from ${prevCount} to ${currentCount}.`,
    }
  }

  // Error count increased significantly — might need attention
  if (currentCount > 0 && currentCount > prevCount) {
    return {
      status: 'ambiguous',
      confidence: 'low',
      reason: `Error count for "${event.relativePath}" increased from ${prevCount} to ${currentCount}.`,
    }
  }

  // Errors cleared
  if (currentCount === 0) {
    return {
      status: 'on_track',
      confidence: 'high',
      reason: `No errors in "${event.relativePath}".`,
    }
  }

  return {
    status: 'ambiguous',
    confidence: 'low',
    reason: `Diagnostics changed for "${event.relativePath}" — ${currentCount} errors.`,
  }
}
