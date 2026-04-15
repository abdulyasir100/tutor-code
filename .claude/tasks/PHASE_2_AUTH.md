# Phase 2 — Auth

## Goal
Implement the full auth chain. By end of this phase, calling `resolveCredentials()`
returns a valid `Credentials` object or throws a typed `AuthError`.

## Read First
`docs/AUTH.md` — full spec. Implement exactly as described.

## Files to Create
- `src/auth/claudeAuth.ts`
- `src/auth/secretStorage.ts`
- `src/auth/types.ts` — `Credentials`, `AuthError` types

## claudeAuth.ts: resolveCredentials()

Async function. Try each option in order. Catch all errors per option — never
let a failure in Option C crash Option B's attempt.

Probe all credential paths from `docs/AUTH.md`. For each JSON parse attempt,
use a `try/catch`. Validate the token with the `/v1/models` probe call before
returning — don't return a token that hasn't been verified.

Default models when resolving via Claude Code credentials:
```typescript
guidanceModel: 'claude-sonnet-4-5'
monitorModel: 'claude-haiku-4-5-20251001'
```

## secretStorage.ts

Simple class wrapping `context.secrets`:
```typescript
class SecretStorage {
  constructor(private secrets: vscode.SecretStorage) {}
  async get(key: string): Promise<string | undefined>
  async set(key: string, value: string): Promise<void>
  async delete(key: string): Promise<void>
}
```

Key naming convention: `tutorcode.{provider}.apikey`

## Integration in extension.ts

In the `tutorcode.start` command handler (still a stub, but now calls auth):
```typescript
const creds = await resolveCredentials(context)
// store in extension state, don't resolve again this session
```

## Verification
- With Claude Code installed: `resolveCredentials()` returns creds with `resolvedVia: 'file'` or `'cli'`
- Without Claude Code, with `ANTHROPIC_API_KEY` set: returns `resolvedVia: 'env'`
- Without any: shows input box prompt
