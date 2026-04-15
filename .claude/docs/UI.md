# UI

## Two Modes

### Guide Mode
- Narrow webview panel, ~300px, `ViewColumn.Three`
- Shows character avatar (neutral icon) + speech bubble
- Displays current step title and guidance message
- Three buttons only: [Got it] [Need a hint] [Pause ▾]
- **No input box. No chat. Student mode — listen and code.**
- Pause button opens a small dropdown: [5 min] [15 min] [Until I say so]

### Chat Mode
- Full-width panel (sidebar or `ViewColumn.Two`, user-configurable)
- Full conversation history (scrollable)
- Text input box + [Send] button
- Shows plan viewer (collapsible section)
- Shows progress bar (steps completed)
- Toggle button: [↙ Back to Guide]
- When re-entering Guide Mode, AI generates a re-entry message

### Toggle
- Top-right corner button in Guide panel: [Chat ↗]
- Top-right corner button in Chat panel: [Guide ↙]
- Keyboard shortcut: `Ctrl+Shift+T` (Windows/Linux), `Cmd+Shift+T` (Mac)
- Status bar click also opens Guide panel if closed

---

## Guide Panel Layout (React)

```
┌────────────────────────────────────┐
│ 🧑  TutorCode          [Chat ↗]   │  ← header bar
├────────────────────────────────────┤
│                                    │
│  ╔══════════════════════════════╗  │
│  ║                              ║  │
│  ║  Step 3 of 8                 ║  │  ← step badge
│  ║  Create your route handler   ║  │  ← step title
│  ║                              ║  │
│  ║  What HTTP method should a   ║  │  ← guidance message
│  ║  list endpoint use? Think    ║  │    (speech bubble style)
│  ║  about what the client       ║  │
│  ║  needs to do...              ║  │
│  ║                              ║  │
│  ╚══════════════════════════════╝  │
│                                    │
│  [Got it ✓]  [Need a hint 💡]     │
│                                    │
│  [⏸ Pause ▾]                      │
│                                    │
├────────────────────────────────────┤
│  ████████████░░░░░░░░  37%        │  ← progress bar
└────────────────────────────────────┘
```

**Character:** Simple SVG icon or emoji-style avatar. Neutral, not anime.
No distracting animations. Subtle pulse on the avatar when a new message arrives.
No sound effects.

**Speech bubble mood styling:**
- `neutral` → normal border, white/dark background
- `warn` → amber border + amber tint
- `praise` → green border + green tint

---

## Chat Panel Layout (React)

```
┌──────────────────────────────────────────┐
│ TutorCode — Chat                [Guide ↙]│
├──────────────────────────────────────────┤
│ ▸ Plan Overview (click to expand)        │  ← collapsible plan section
├──────────────────────────────────────────┤
│                                          │
│  [Tutor] Welcome back! You were on       │
│  Step 3. Let's keep going once you're    │
│  ready.                                  │
│                                          │
│  [You] What's the difference between     │
│  GET and POST?                           │
│                                          │
│  [Tutor] Great question — before I       │
│  explain, what do you think the          │
│  difference might be based on the        │
│  names?                                  │
│                                          │
├──────────────────────────────────────────┤
│  Ask anything...                  [Send] │
└──────────────────────────────────────────┘
```

---

## Plan Suggestion Panel (pre-commit only)

Shown in Chat panel during the PLANNING phase, before Guide Mode activates.

```
┌──────────────────────────────────────────┐
│ Your Plan                                │
├──────────────────────────────────────────┤
│ Goal: Build a to-do app with Next.js     │
│                                          │
│ [Mermaid diagram renders here]           │
│                                          │
│ Steps:                                   │
│  1. Initialize Next.js project           │
│  2. Set up project structure             │
│  3. Create data layer (types + store)    │
│  ...                                     │
│                                          │
│ Suggest a change:                        │
│  [I want Zustand instead of Context...] │  ← input active here
│                           [Suggest]      │
│                                          │
│                     [✓ Commit Plan]      │
└──────────────────────────────────────────┘
```

Once [Commit Plan] is clicked:
- Input box disappears
- Plan section collapses and becomes read-only
- Guide panel opens
- Chat panel shows re-entry message from tutor

---

## Status Bar

```
TutorCode: Step 3/8 — Create route handler  [⏸]
```

- Left side: extension name + step info
- Right side: pause indicator (only visible during active session)
- Click: opens/focuses Guide panel
- On complete: `TutorCode: ✓ Done! Great work.`
- On idle: `▶ TutorCode` (click to start)

---

## Notification Strategy

VSCode notifications (the pop-up kind in bottom right) are **not used** for
guidance messages. All guidance goes through the Guide panel's speech bubble.

VSCode notifications are only used for:
- Auth prompts ("Enter your API key")
- One-time setup messages ("Enable shell integration for terminal monitoring")
- Hard errors ("AI call failed — check your API key")
- Session resume on workspace open ("You have an active TutorCode session — resume?")

This prevents the extension from feeling spammy. The character panel is the
only ongoing communication channel during guidance.

---

## Webview Security

Both webviews use standard VSCode security headers:
```typescript
const panel = vscode.window.createWebviewPanel(
  'tutorcode.guide',
  'TutorCode',
  vscode.ViewColumn.Three,
  {
    enableScripts: true,
    retainContextWhenHidden: true,    // preserve React state when hidden
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')
    ]
  }
)
```

CSP header in webview HTML:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           script-src 'nonce-{nonce}';
           style-src 'unsafe-inline';
           img-src data: https:;">
```

All scripts served from extension's `dist/webview/` directory.
No external script sources. Mermaid bundled locally.
