import * as vscode from 'vscode'
import { getWebviewHtml } from './webviewHtml'
import { HostMessage, WebviewMessage } from './messages'
import { Step } from '../state/types'

export class GuidePanel {
  private panel: vscode.WebviewPanel | null = null
  private disposables: vscode.Disposable[] = []

  private readonly _onGotIt = new vscode.EventEmitter<void>()
  public readonly onGotIt = this._onGotIt.event

  private readonly _onNeedHint = new vscode.EventEmitter<void>()
  public readonly onNeedHint = this._onNeedHint.event

  private readonly _onPause = new vscode.EventEmitter<number>()
  public readonly onPause = this._onPause.event

  private readonly _onToggle = new vscode.EventEmitter<void>()
  public readonly onToggle = this._onToggle.event

  private readonly _onReady = new vscode.EventEmitter<void>()
  public readonly onReady = this._onReady.event

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Three)
      return
    }

    this.panel = vscode.window.createWebviewPanel(
      'tutorcode.guide',
      'TutorCode',
      vscode.ViewColumn.Three,
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
      'guide'
    )

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => {
        switch (msg.type) {
          case 'got_it':
            this._onGotIt.fire()
            break
          case 'need_hint':
            this._onNeedHint.fire()
            break
          case 'pause':
            this._onPause.fire(msg.minutes)
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

  sendStep(step: Step, totalSteps: number): void {
    this.sendMessage({ type: 'step_update', step, totalSteps })
  }

  sendCharacterMessage(message: string, mood: 'neutral' | 'warn' | 'praise'): void {
    this.sendMessage({ type: 'character_speak', message, mood })
  }

  private disposeListeners(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
    this.disposables = []
  }

  dispose(): void {
    this.hide()
    this._onGotIt.dispose()
    this._onNeedHint.dispose()
    this._onPause.dispose()
    this._onToggle.dispose()
    this._onReady.dispose()
  }
}
