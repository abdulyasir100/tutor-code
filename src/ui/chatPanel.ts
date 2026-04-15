import * as vscode from 'vscode'
import { getWebviewHtml } from './webviewHtml'
import { HostMessage, WebviewMessage } from './messages'
import { Plan } from '../state/types'

export class ChatPanel {
  private panel: vscode.WebviewPanel | null = null
  private disposables: vscode.Disposable[] = []

  private readonly _onChatSend = new vscode.EventEmitter<string>()
  public readonly onChatSend = this._onChatSend.event

  private readonly _onPlanSuggestion = new vscode.EventEmitter<string>()
  public readonly onPlanSuggestion = this._onPlanSuggestion.event

  private readonly _onPlanCommit = new vscode.EventEmitter<void>()
  public readonly onPlanCommit = this._onPlanCommit.event

  private readonly _onToggle = new vscode.EventEmitter<void>()
  public readonly onToggle = this._onToggle.event

  private readonly _onReady = new vscode.EventEmitter<void>()
  public readonly onReady = this._onReady.event

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two)
      return
    }

    this.panel = vscode.window.createWebviewPanel(
      'tutorcode.chat',
      'TutorCode \u2014 Chat',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ],
      }
    )

    this.panel.webview.html = getWebviewHtml(
      this.panel.webview,
      this.context.extensionUri,
      'chat'
    )

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => {
        switch (msg.type) {
          case 'chat_send':
            this._onChatSend.fire(msg.text)
            break
          case 'plan_suggestion':
            this._onPlanSuggestion.fire(msg.text)
            break
          case 'plan_commit':
            this._onPlanCommit.fire()
            break
          case 'toggle_mode':
            this._onToggle.fire()
            break
          case 'webview_ready':
            this._onReady.fire()
            break
        }
      },
      undefined,
      this.disposables
    )

    this.panel.onDidDispose(
      () => {
        this.panel = null
        this.disposeListeners()
      },
      undefined,
      this.disposables
    )
  }

  hide(): void {
    if (this.panel) {
      this.panel.dispose()
      this.panel = null
    }
  }

  isVisible(): boolean {
    return this.panel !== null && this.panel.visible
  }

  sendMessage(msg: HostMessage): void {
    if (this.panel) {
      this.panel.webview.postMessage(msg)
    }
  }

  sendChatChunk(text: string, done: boolean): void {
    this.sendMessage({ type: 'chat_chunk', text, done })
  }

  displayPlan(plan: Plan): void {
    this.sendMessage({ type: 'plan_display', plan })
  }

  private disposeListeners(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }

  dispose(): void {
    this.hide()
    this._onChatSend.dispose()
    this._onPlanSuggestion.dispose()
    this._onPlanCommit.dispose()
    this._onToggle.dispose()
    this._onReady.dispose()
  }
}
