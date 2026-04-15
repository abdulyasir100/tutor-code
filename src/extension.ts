import * as vscode from 'vscode'
import { resolveCredentials } from './auth/claudeAuth'
import { SecretStorage } from './auth/secretStorage'
import { Credentials } from './auth/types'

// Module-level credential cache for this session
let sessionCredentials: Credentials | null = null

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Set initial context key
  await vscode.commands.executeCommand('setContext', 'tutorcode.sessionActive', false)

  const secretStore = new SecretStorage(context.secrets)

  const startCmd = vscode.commands.registerCommand('tutorcode.start', async () => {
    try {
      const creds = await resolveCredentials(context, secretStore)
      // Cache creds in module-level variable for later phases
      sessionCredentials = creds
      vscode.window.showInformationMessage('TutorCode: coming soon')
    } catch (e) {
      vscode.window.showErrorMessage(
        `TutorCode: Auth failed — ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })

  const toggleCmd = vscode.commands.registerCommand('tutorcode.toggle', () => {
    vscode.window.showInformationMessage('TutorCode: coming soon')
  })

  const pauseCmd = vscode.commands.registerCommand('tutorcode.pause', () => {
    vscode.window.showInformationMessage('TutorCode: coming soon')
  })

  const revisePlanCmd = vscode.commands.registerCommand('tutorcode.revisePlan', () => {
    vscode.window.showInformationMessage('TutorCode: coming soon')
  })

  const reindexCmd = vscode.commands.registerCommand('tutorcode.reindex', () => {
    vscode.window.showInformationMessage('TutorCode: coming soon')
  })

  const abandonCmd = vscode.commands.registerCommand('tutorcode.abandon', () => {
    vscode.window.showInformationMessage('TutorCode: coming soon')
  })

  context.subscriptions.push(
    startCmd,
    toggleCmd,
    pauseCmd,
    revisePlanCmd,
    reindexCmd,
    abandonCmd,
  )
}

export function deactivate(): void {
  sessionCredentials = null
}
