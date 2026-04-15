import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as child_process from 'child_process'
import * as util from 'util'
import * as vscode from 'vscode'
import { Credentials, AuthError } from './types'
import { SecretStorage } from './secretStorage'

const execFile = util.promisify(child_process.execFile)

// Module-level credential cache
let cachedCredentials: Credentials | null = null

const CLAUDE_CREDENTIAL_PATHS = [
  // macOS / Linux
  path.join(os.homedir(), '.claude', '.credentials.json'),
  path.join(os.homedir(), '.claude', 'credentials.json'),
  path.join(os.homedir(), '.config', 'claude', 'credentials.json'),
  // Windows
  path.join(process.env['APPDATA'] ?? '', 'Claude', 'credentials.json'),
  path.join(process.env['APPDATA'] ?? '', '.claude', 'credentials.json'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'credentials.json'),
]

const CLAUDE_BINARY_PATHS = [
  'claude',
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/usr/local/bin/claude',
  path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
  // Windows
  path.join(process.env['APPDATA'] ?? '', 'npm', 'claude.cmd'),
]

interface ClaudeCredentialFile {
  access_token?: string
  accessToken?: string
  token?: string
  bearer_token?: string
  oauth_token?: string
  auth?: { token?: string; access_token?: string }
  session?: { token?: string }
}

function extractToken(data: ClaudeCredentialFile): string | undefined {
  return (
    data.access_token ??
    data.accessToken ??
    data.token ??
    data.bearer_token ??
    data.oauth_token ??
    data.auth?.token ??
    data.auth?.access_token ??
    data.session?.token
  )
}

async function validateAnthropicToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000),
    })
    return response.status === 200
  } catch {
    return false
  }
}

function resolveModels(): { guidanceModel: string; monitorModel: string } {
  const config = vscode.workspace.getConfiguration('tutorcode')
  const guidanceModel = (config.get<string>('guidanceModel') ?? '').trim() || 'claude-sonnet-4-5'
  const monitorModel = (config.get<string>('monitorModel') ?? '').trim() || 'claude-haiku-4-5-20251001'
  return { guidanceModel, monitorModel }
}

// Option C: Read Claude Code credentials from disk
async function tryCredentialFiles(): Promise<Credentials | null> {
  for (const credPath of CLAUDE_CREDENTIAL_PATHS) {
    try {
      const raw = await fs.promises.readFile(credPath, 'utf8')
      const data = JSON.parse(raw) as ClaudeCredentialFile
      const token = extractToken(data)
      if (!token) continue

      const valid = await validateAnthropicToken(token)
      if (!valid) continue

      const { guidanceModel, monitorModel } = resolveModels()
      return {
        provider: 'anthropic',
        authType: 'bearer',
        token,
        guidanceModel,
        monitorModel,
        resolvedVia: 'file',
      }
    } catch {
      // File doesn't exist, can't be read, or parse failed — continue
    }
  }
  return null
}

// Option B: Shell out to Claude CLI
async function tryClaudeCLI(): Promise<Credentials | null> {
  for (const binaryPath of CLAUDE_BINARY_PATHS) {
    try {
      const { stdout } = await execFile(binaryPath, ['auth', 'status', '--format', 'json'], {
        timeout: 3000,
      })
      const data = JSON.parse(stdout) as Record<string, unknown>
      const token = (data['token'] ?? data['api_key'] ?? data['access_token']) as string | undefined
      if (!token || typeof token !== 'string') continue

      const valid = await validateAnthropicToken(token)
      if (!valid) continue

      const { guidanceModel, monitorModel } = resolveModels()
      return {
        provider: 'anthropic',
        authType: 'bearer',
        token,
        guidanceModel,
        monitorModel,
        resolvedVia: 'cli',
      }
    } catch {
      // Binary not found, timed out, or output not parseable — continue
    }
  }
  return null
}

// ENV fallback
function tryEnvKey(): Credentials | null {
  const key = process.env['ANTHROPIC_API_KEY']
  if (!key || key.trim() === '') return null

  const { guidanceModel, monitorModel } = resolveModels()
  return {
    provider: 'anthropic',
    authType: 'apikey',
    token: key.trim(),
    guidanceModel,
    monitorModel,
    resolvedVia: 'env',
  }
}

// SecretStorage: check stored key, then prompt
async function trySecretStorage(secretStorage: SecretStorage): Promise<Credentials | null> {
  try {
    // Check if already stored
    const stored = await secretStorage.get('tutorcode.anthropic.apikey')
    if (stored && stored.trim() !== '') {
      const { guidanceModel, monitorModel } = resolveModels()
      return {
        provider: 'anthropic',
        authType: 'apikey',
        token: stored.trim(),
        guidanceModel,
        monitorModel,
        resolvedVia: 'secret',
      }
    }

    // Prompt user
    await vscode.window.showInformationMessage(
      'TutorCode: No Anthropic credentials found. Please enter your API key.',
    )
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Anthropic API key',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sk-ant-...',
    })
    if (!apiKey || apiKey.trim() === '') return null

    await secretStorage.set('tutorcode.anthropic.apikey', apiKey.trim())

    const { guidanceModel, monitorModel } = resolveModels()
    return {
      provider: 'anthropic',
      authType: 'apikey',
      token: apiKey.trim(),
      guidanceModel,
      monitorModel,
      resolvedVia: 'secret',
    }
  } catch {
    // SecretStorage unavailable or user dismissed — fall through
    return null
  }
}

export async function resolveCredentials(
  _context: vscode.ExtensionContext,
  secretStorage: SecretStorage,
): Promise<Credentials> {
  if (cachedCredentials) return cachedCredentials

  // Option C: disk files
  const fromFile = await tryCredentialFiles()
  if (fromFile) {
    cachedCredentials = fromFile
    return fromFile
  }

  // Option B: CLI
  const fromCLI = await tryClaudeCLI()
  if (fromCLI) {
    cachedCredentials = fromCLI
    return fromCLI
  }

  // ENV
  const fromEnv = tryEnvKey()
  if (fromEnv) {
    cachedCredentials = fromEnv
    return fromEnv
  }

  // SecretStorage (check stored, then prompt)
  const fromSecret = await trySecretStorage(secretStorage)
  if (fromSecret) {
    cachedCredentials = fromSecret
    return fromSecret
  }

  throw new AuthError('no_credentials', 'No Anthropic credentials could be found or provided.')
}

export function clearCredentialCache(): void {
  cachedCredentials = null
}
