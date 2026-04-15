import * as vscode from 'vscode'
import { clearCredentialCache } from './auth/claudeAuth'

export type ErrorAction = 'retry' | 'fallback' | 'notify_user' | 'abort'

interface RetryState {
  attempts: number
  lastAttempt: number
}

export class ErrorHandler {
  private retryStates = new Map<string, RetryState>()
  private readonly MAX_RETRIES = 3
  private readonly BACKOFF_BASE_MS = 2000

  async handleAPIError(error: unknown, context: string): Promise<ErrorAction> {
    const err = this.normalizeError(error)

    // Auth failure (401/403)
    if (err.status === 401 || err.status === 403) {
      clearCredentialCache()
      vscode.window.showWarningMessage(
        'TutorCode: Authentication failed. Please check your API key or Claude Code credentials.'
      )
      return 'abort'
    }

    // Rate limit (429) — exponential backoff
    if (err.status === 429) {
      const state = this.getRetryState(context)
      if (state.attempts < this.MAX_RETRIES) {
        const delay = this.BACKOFF_BASE_MS * Math.pow(2, state.attempts)
        state.attempts++
        state.lastAttempt = Date.now()
        await this.sleep(delay)
        return 'retry'
      }
      this.resetRetryState(context)
      return 'fallback'
    }

    // Network / timeout errors
    if (err.isNetworkError) {
      const state = this.getRetryState(context)
      if (state.attempts < 1) {
        state.attempts++
        state.lastAttempt = Date.now()
        return 'retry'
      }
      this.resetRetryState(context)
      return 'fallback'
    }

    // JSON parse failure
    if (err.isParseError) {
      const state = this.getRetryState(context)
      if (state.attempts < 1) {
        state.attempts++
        state.lastAttempt = Date.now()
        return 'retry'
      }
      this.resetRetryState(context)
      return 'fallback'
    }

    // Plan validation failure
    if (context === 'plan_validation') {
      const state = this.getRetryState(context)
      if (state.attempts < 1) {
        state.attempts++
        return 'retry'
      }
      this.resetRetryState(context)
      return 'notify_user'
    }

    // No workspace
    if (err.message?.includes('no workspace') || err.message?.includes('no open folder')) {
      vscode.window.showInformationMessage(
        'TutorCode: Open a folder first to start a session.'
      )
      return 'abort'
    }

    // Session file corrupt
    if (err.isParseError && context === 'session_load') {
      const choice = await vscode.window.showWarningMessage(
        'TutorCode: Session file appears corrupt. Reset session?',
        'Reset',
        'Cancel'
      )
      if (choice === 'Reset') {
        return 'retry'
      }
      return 'abort'
    }

    // Generic unknown error — notify user and suggest fallback
    vscode.window.showErrorMessage(
      `TutorCode error (${context}): ${err.message || 'Unknown error'}`
    )
    return 'fallback'
  }

  private normalizeError(error: unknown): {
    status?: number
    message?: string
    isNetworkError: boolean
    isParseError: boolean
  } {
    if (error instanceof Error) {
      const anyErr = error as unknown as Record<string, unknown>
      const status =
        typeof anyErr['status'] === 'number'
          ? anyErr['status']
          : typeof anyErr['statusCode'] === 'number'
            ? anyErr['statusCode']
            : undefined

      const isNetworkError =
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('fetch failed') ||
        error.message.includes('network') ||
        error.message.includes('timeout')

      const isParseError =
        error instanceof SyntaxError ||
        error.message.includes('JSON') ||
        error.message.includes('parse')

      return { status, message: error.message, isNetworkError, isParseError }
    }

    if (typeof error === 'string') {
      return {
        message: error,
        isNetworkError: error.includes('network') || error.includes('timeout'),
        isParseError: error.includes('JSON') || error.includes('parse'),
      }
    }

    return {
      message: String(error),
      isNetworkError: false,
      isParseError: false,
    }
  }

  private getRetryState(context: string): RetryState {
    let state = this.retryStates.get(context)
    if (!state) {
      state = { attempts: 0, lastAttempt: 0 }
      this.retryStates.set(context, state)
    }
    // Reset if last attempt was more than 60s ago
    if (Date.now() - state.lastAttempt > 60_000) {
      state.attempts = 0
    }
    return state
  }

  private resetRetryState(context: string): void {
    this.retryStates.delete(context)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
