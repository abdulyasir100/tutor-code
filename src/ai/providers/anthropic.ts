import Anthropic from '@anthropic-ai/sdk'
import { Credentials } from '../../auth/types'
import { AIProvider, Message, CompleteOptions, CacheableBlock } from './types'

type AnthropicTextBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic | null = null
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.credentials.token,
      })
    }
    return this.client
  }

  async complete(messages: Message[], options: CompleteOptions): Promise<string> {
    const client = this.getClient()
    const model = options.model || this.credentials.guidanceModel

    try {
      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.7,
        system: this.buildSystemBlocks(options.system),
        messages: this.buildMessages(messages),
      })

      return this.extractText(response)
    } catch (err: unknown) {
      this.handleError(err)
      throw err
    }
  }

  async *stream(messages: Message[], options: CompleteOptions): AsyncIterable<string> {
    const client = this.getClient()
    const model = options.model || this.credentials.guidanceModel

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.7,
        system: this.buildSystemBlocks(options.system),
        messages: this.buildMessages(messages),
      })

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text
        }
      }
    } catch (err: unknown) {
      this.handleError(err)
      throw err
    }
  }

  async completeJSON<T>(messages: Message[], options: CompleteOptions): Promise<T> {
    const raw = await this.complete(messages, options)
    return this.parseJSON<T>(raw)
  }

  async monitor(messages: Message[], options: CompleteOptions): Promise<string> {
    const client = this.getClient()
    // ALWAYS use monitor model for Tier 2, ignoring options.model
    const model = this.credentials.monitorModel

    try {
      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.3,
        system: this.buildSystemBlocks(options.system),
        messages: this.buildMessages(messages),
      })

      return this.extractText(response)
    } catch (err: unknown) {
      this.handleError(err)
      throw err
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  private buildSystemBlocks(blocks?: CacheableBlock[]): AnthropicTextBlock[] {
    if (!blocks || blocks.length === 0) { return [] }
    return blocks.map(b => {
      const block: AnthropicTextBlock = { type: 'text', text: b.text }
      if (b.cache) {
        block.cache_control = { type: 'ephemeral' }
      }
      return block
    })
  }

  private buildMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content }
      }
      // CacheableBlock[] → Anthropic content blocks
      const content: AnthropicTextBlock[] = m.content.map(b => {
        const block: AnthropicTextBlock = { type: 'text', text: b.text }
        if (b.cache) {
          block.cache_control = { type: 'ephemeral' }
        }
        return block
      })
      return { role: m.role, content }
    })
  }

  private extractText(response: Anthropic.Message): string {
    const parts: string[] = []
    for (const block of response.content) {
      if (block.type === 'text') {
        parts.push(block.text)
      }
    }
    return parts.join('')
  }

  private parseJSON<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T
    } catch {
      // Strip prose before first { and after last }
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const trimmed = raw.substring(firstBrace, lastBrace + 1)
        return JSON.parse(trimmed) as T
      }
      throw new Error('Failed to parse JSON from AI response')
    }
  }

  private handleError(err: unknown): void {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401 || err.status === 403) {
        const authErr = new Error('Authentication failed — check your API key or token')
        ;(authErr as unknown as Record<string, unknown>).code = 'auth_error'
        throw authErr
      }
    }
  }
}
