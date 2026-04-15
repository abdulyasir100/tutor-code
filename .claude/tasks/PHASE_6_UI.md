# Phase 6 — UI

## Goal
Both webview panels functional with correct toggle behavior.
Status bar showing session state. Message protocol working bidirectionally.

## Read First
`docs/UI.md` — all layout specs, security requirements, mode behavior.

## Files to Create / Complete
- `src/ui/guidePanel.ts`
- `src/ui/chatPanel.ts`
- `src/ui/statusBar.ts`
- `src/ui/messages.ts` (defined in Phase 1, fully implement now)
- `src/ui/webview/guide/index.tsx` (fully implement)
- `src/ui/webview/chat/index.tsx` (fully implement)
- `src/ui/webview/shared/styles.css` (shared styles)
- `src/ui/webviewHtml.ts` — generates HTML wrapper with nonce + CSP

## webviewHtml.ts

```typescript
function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bundle: 'guide' | 'chat'
): string {
  const nonce = generateNonce()  // random 32-char hex
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${bundle}.js`)
  )
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
```

## guidePanel.ts

Create panel at `ViewColumn.Three`. Width is set by user column resizing — no way
to programmatically enforce 300px, but document the intended width in README.

Key methods:
```typescript
class GuidePanel {
  static createOrShow(context: vscode.ExtensionContext): GuidePanel
  sendStep(step: Step, totalSteps: number): void
  sendCharacterMessage(message: string, mood: 'neutral' | 'warn' | 'praise'): void
  onGotIt: vscode.EventEmitter<void>
  onNeedHint: vscode.EventEmitter<void>
  onPause: vscode.EventEmitter<number>     // minutes
  onToggle: vscode.EventEmitter<void>
  dispose(): void
}
```

Use `retainContextWhenHidden: true` so React state persists when switching editors.

## chatPanel.ts

```typescript
class ChatPanel {
  static createOrShow(context: vscode.ExtensionContext): ChatPanel
  sendChatChunk(text: string, done: boolean): void  // streaming
  displayPlan(plan: Plan): void
  onChatSend: vscode.EventEmitter<string>
  onPlanSuggestion: vscode.EventEmitter<string>
  onPlanCommit: vscode.EventEmitter<void>
  onToggle: vscode.EventEmitter<void>
  dispose(): void
}
```

## Guide Webview React Component

State:
```typescript
interface GuideState {
  step: Step | null
  totalSteps: number
  message: string
  mood: 'neutral' | 'warn' | 'praise'
  isPaused: boolean
  pauseMenuOpen: boolean
}
```

Render the layout from `docs/UI.md`. Use inline styles or CSS-in-JS (no
Tailwind in webviews — it's not available). Use VSCode CSS variables for
theming: `var(--vscode-editor-background)`, `var(--vscode-foreground)`, etc.
This makes the panel respect the user's VSCode theme automatically.

Character avatar: a simple SVG face (neutral expression). Static, no animation
except a 0.5s border-pulse on `mood === 'warn'` or `mood === 'praise'`.

## Chat Webview React Component

State:
```typescript
interface ChatState {
  messages: ChatMessage[]
  plan: Plan | null
  planExpanded: boolean
  inputValue: string
  isStreaming: boolean
  mode: 'planning' | 'chat'   // planning = show suggestion input + commit button
}

interface ChatMessage {
  role: 'tutor' | 'user'
  text: string
  timestamp: number
}
```

Render the layout from `docs/UI.md`. Streaming: append chunks to the last
assistant message as they arrive. Auto-scroll to bottom on new content.

## statusBar.ts

```typescript
class TutorStatusBar {
  constructor() {
    // vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  }
  showIdle(): void                           // "▶ TutorCode"
  showStep(n: number, total: number, title: string): void
  showPaused(): void                         // "TutorCode: ⏸ Paused"
  showComplete(): void                       // "TutorCode: ✓ Done!"
  showError(msg: string): void               // "TutorCode: ⚠ Error"
  dispose(): void
}
```

## Verification
- Run extension in debug mode (`F5` in VSCode)
- Run `TutorCode: Start Session` command
- Guide panel opens at right side
- Clicking [Chat ↗] switches to chat panel
- Clicking [Guide ↙] switches back
- Status bar shows session state
- Ctrl+Shift+T toggles between modes
