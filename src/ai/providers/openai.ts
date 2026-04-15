import OpenAI from 'openai'
import { Credentials } from '../../auth/types'
import { AIProvider, Message, CompleteOptions, CacheableBlock } from './types'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI | null = null
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const baseURL = this.getBaseURL()
      this.client = new OpenAI({
        apiKey: this.credentials.token,
        baseURL,
      })
    }
    return this.client
  }

  private getBaseURL(): string | undefined {
    switch (this.credentials.provider) {
      case 'grok': return 'https://api.x.ai/v1'
      case 'openrouter': return 'https://openrouter.ai/api/v1'
      default: return undefined
    }
  }

  async complete(messages: Message[], options: CompleteOptions): Promise<string> {
    const client = this.getClient()
    const model = options.model || this.credentials.guidanceModel

    const response = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.7,
      messages: this.buildMessages(messages, options.system),
    })

    return response.choices[0]?.message?.content ?? ''
  }

  async *stream(messages: Message[], options: CompleteOptions): AsyncIterable<string> {
    const client = this.getClient()
    const model = options.model || this.credentials.guidanceModel

    const stream = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.7,
      messages: this.buildMessages(messages, options.system),
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        yield delta
      }
    }
  }

  async completeJSON<T>(messages: Message[], options: CompleteOptions): Promise<T> {
    const raw = await this.complete(messages, options)
    return this.parseJSON<T>(raw)
  }

  async monitor(messages: Message[], options: CompleteOptions): Promise<string> {
    // Use monitor model, same as guidance if not separately configured
    const monitorOptions: CompleteOptions = {
      ...options,
      model: this.credentials.monitorModel,
      temperature: options.temperature ?? 0.3,
    }
    return this.complete(messages, monitorOptions)
  }

  // ── Private helpers ──────────────────────────────────────────────

  private buildMessages(
    messages: Message[],
    system?: CacheableBlock[],
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []

    // System blocks → single system message
    if (system && system.length > 0) {
      const systemText = system.map(b => b.text).join('\n\n')
      result.push({ role: 'system', content: systemText })
    }

    // Convert messages — CacheableBlock.cache is ignored for OpenAI
    for (const m of messages) {
      const content = typeof m.content === 'string'
        ? m.content
        : m.content.map(b => b.text).join('\n\n')
      result.push({ role: m.role, content })
    }

    return result
  }

  private parseJSON<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T
    } catch {
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const trimmed = raw.substring(firstBrace, lastBrace + 1)
        return JSON.parse(trimmed) as T
      }
      throw new Error('Failed to parse JSON from AI response')
    }
  }
}
