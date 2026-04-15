export interface Credentials {
  provider: 'anthropic' | 'openai' | 'grok' | 'openrouter'
  authType: 'bearer' | 'apikey'
  token: string
  guidanceModel: string
  monitorModel: string
  resolvedVia: 'file' | 'cli' | 'env' | 'secret'
}

export class AuthError extends Error {
  constructor(
    public readonly reason: 'no_credentials' | 'invalid_token' | 'provider_error',
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
