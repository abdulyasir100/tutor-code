import * as vscode from 'vscode'

export class TutorStatusBar {
  private item: vscode.StatusBarItem

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    )
    this.item.command = 'tutorcode.toggle'
    this.showIdle()
    this.item.show()
  }

  showIdle(): void {
    this.item.text = '\u25B6 TutorCode'
    this.item.tooltip = 'Click to start TutorCode'
    this.item.backgroundColor = undefined
  }

  showStep(current: number, total: number, title: string): void {
    this.item.text = `TutorCode: Step ${current}/${total} \u2014 ${title}`
    this.item.tooltip = `Step ${current} of ${total}: ${title}`
    this.item.backgroundColor = undefined
  }

  showPaused(): void {
    this.item.text = `TutorCode: \u23F8 Paused`
    this.item.tooltip = 'TutorCode is paused'
    this.item.backgroundColor = undefined
  }

  showComplete(): void {
    this.item.text = `TutorCode: \u2713 Done! Great work.`
    this.item.tooltip = 'Session complete'
    this.item.backgroundColor = undefined
  }

  showError(msg: string): void {
    this.item.text = `TutorCode: \u26A0 ${msg}`
    this.item.tooltip = msg
    this.item.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.errorBackground'
    )
  }

  dispose(): void {
    this.item.dispose()
  }
}
