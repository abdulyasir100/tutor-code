# Auth

## Priority Chain

Attempt each option in order. Stop at the first that yields valid credentials.

```
Option C → Option B → ENV → SecretStorage prompt
```

---

## Option C: Read Claude Code Credentials from Disk

Claude Code stores OAuth session data locally. Probe these paths in order:

```typescript
const CLAUDE_CREDENTIAL_PATHS = [
  // macOS / Linux
  path.join(os.homedir(), '.claude', '.credentials.json'),
  path.join(os.homedir(), '.claude', 'credentials.json'),
  path.join(os.homedir(), '.config', 'claude', 'credentials.json'),
  // Windows
  path.join(process.env.APPDATA ?? '', 'Claude', 'credentials.json'),
  path.join(process.env.APPDATA ?? '', '.claude', 'credentials.json'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'credentials.json'),
]
```

For each path, attempt to read and parse as JSON. Look for any of these fields
that suggest a bearer token:

```typescript
interface ClaudeCredentialFile {
  // possible field names — probe all of them
  access_token?: string
  accessToken?: string
  token?: string
  bearer_token?: string
  oauth_token?: string
  // may be nested
  auth?: { token?: string; access_token?: string }
  session?: { token?: string }
}
```

If a token is found, validate it with a lightweight probe call:
```
GET https://api.anthropic.com/v1/models
Authorization: Bearer {token}
anthropic-version: 2023-06-01
```

If 200 → credentials valid, use as Anthropic bearer token.
If 401/403 → token invalid or wrong scope, fall through to Option B.

**Important**: Read these files with `fs.promises.readFile`. Catch all errors
silently — if the file doesn't exist or can't be parsed, treat as "not found"
and continue down the chain. Never throw from the auth resolver.

---

## Option B: Shell Out to Claude CLI

If `claude` binary exists on PATH, run:

```bash
claude auth status --format json
```

Parse the JSON output for a session token or API key.
Timeout: 3000ms. If the binary doesn't exist or exits non-zero → fall through.

Also probe common install locations directly:
```typescript
const CLAUDE_BINARY_PATHS = [
  'claude',                                    // PATH lookup
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/usr/local/bin/claude',
  path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
  // Windows
  path.join(process.env.APPDATA ?? '', 'npm', 'claude.cmd'),
]
```

---

## ENV Fallback

Check `process.env.ANTHROPIC_API_KEY`. If set and non-empty, use it.
This supports CI environments and power users who set it globally.

---

## SecretStorage Prompt (Last Resort)

If all above fail:
1. Show VSCode information message:
   "TutorCode: No Anthropic credentials found. Please enter your API key."
2. Open `vscode.window.showInputBox` with prompt and password mask.
3. Store result in `context.secrets.store('tutorcode.anthropic.apikey', key)`.
4. On subsequent activations, check SecretStorage first before prompting again.

---

## Other Providers (OpenAI, Grok, OpenRouter)

Provider is selected from `settings.json`:
```json
{
  "tutorcode.aiProvider": "anthropic" | "openai" | "grok" | "openrouter",
  "tutorcode.model": "claude-sonnet-4-5"
}
```

For non-Anthropic providers, API key always comes from SecretStorage
(key: `tutorcode.{provider}.apikey`). No credential file probing.

Grok uses `https://api.x.ai/v1` as base URL with the OpenAI SDK schema.
OpenRouter uses `https://openrouter.ai/api/v1`.

---

## Credentials Type

```typescript
interface Credentials {
  provider: 'anthropic' | 'openai' | 'grok' | 'openrouter'
  authType: 'bearer' | 'apikey'
  token: string
  // for Anthropic: which model to use for guidance vs monitoring
  guidanceModel: string   // e.g. 'claude-sonnet-4-5'
  monitorModel: string    // e.g. 'claude-haiku-4-5-20251001'
  resolvedVia: 'file' | 'cli' | 'env' | 'secret'
}
```

---

## Re-validation

Cache credentials in memory for the session. Re-validate on first AI call failure
(401/403). If re-validation fails, show status bar error and re-trigger auth flow.
Do not re-probe disk on every call — that would be wasteful and noisy.
