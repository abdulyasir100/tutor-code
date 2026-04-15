# TutorCode Sprint 4 (UI) — Static Analysis Report

**Date:** 2026-04-15
**Tester role:** @tester
**Branch:** feature/base
**Scope:** Guide panel, Chat panel, message type safety, theme support, CSP security

---

## 1. Guide Panel Layout — `src/ui/webview/guide/index.tsx`

| Check | Result | Notes |
|-------|--------|-------|
| Step badge "Step N of M" | PASS | Line 211: `Step {state.step.number} of {state.totalSteps}` rendered inside a styled badge `div` when `state.step && !state.isComplete`. |
| Speech bubble with mood tinting | PASS | `moodBorder` and `moodBg` records (lines 32–43) map `neutral/warn/praise` to distinct border colors (`#444` / `#d97706` / `#16a34a`) and background tints. Applied via inline style on the bubble `div` (lines 190–193). |
| Button: Got it | PASS | Line 233–247: `Got it` button posts `{ type: 'got_it' }`. |
| Button: Need a hint | PASS | Line 248–262: `Need a hint` button posts `{ type: 'need_hint' }`. |
| Button: Pause | PASS | Line 267–285: Pause button toggles `pauseMenuOpen`. |
| Pause dropdown — 5 min | PASS | Line 301: `{ label: '5 minutes', minutes: 5 }` option present. |
| Pause dropdown — 15 min | PASS | Line 302: `{ label: '15 minutes', minutes: 15 }` option present. |
| Pause dropdown — Indefinite | PASS | Line 303: `{ label: 'Until I say so', minutes: 0 }` option present (0 = indefinite). |
| Chat toggle button | PASS | Line 169–183: Button posts `{ type: 'toggle_mode' }`, labelled "Chat". |
| Progress bar | PASS | Lines 337–369: Footer `div` contains a track bar and a filled inner `div` driven by `state.percentComplete`, with `transition: 'width 0.3s ease'`. Percentage label also displayed. |
| Sends `webview_ready` on mount | PASS | Line 74: `vscode.postMessage({ type: 'webview_ready' })` inside `useEffect([], [])`. |

**Guide Panel verdict: PASS**

---

## 2. Chat Panel Layout — `src/ui/webview/chat/index.tsx`

| Check | Result | Notes |
|-------|--------|-------|
| Collapsible plan section | PASS | Lines 202–343: Plan section renders only when `state.plan !== null`. Toggle button flips `planExpanded` (lines 206–223). Expanded content (title, description, steps, mermaid diagram) is conditionally rendered at line 227. |
| Conversation history (scrollable) | PASS | Lines 346–395: Messages area has `overflow: 'auto'` and `flex: 1`. Messages mapped with role-differentiated bubble styling. `messagesEndRef` scroll-into-view on every messages change (line 53–58). |
| Text input + Send button | PASS | Lines 398–446: `textarea` + `Send` button present. Send disabled while streaming or input empty. Enter key (without Shift) triggers send (lines 159–164). |
| Streaming support (appends chunks) | PASS | Lines 67–91: `chat_chunk` handler appends `msg.text` to the last tutor message when `isStreaming` is true; otherwise opens a new message. `isStreaming` cleared when `msg.done` is true. A blinking cursor indicator shown while streaming (lines 386–390). |
| Plan suggestion mode — Suggest button | PASS | Lines 279–319: Shown only when `state.mode === 'planning'`. Input + `Suggest` button posts `{ type: 'plan_suggestion', text }`. |
| Plan suggestion mode — Commit Plan button | PASS | Lines 323–338: `Commit Plan` button posts `{ type: 'plan_commit' }` and transitions mode to `'chat'`. |
| Guide toggle button | PASS | Lines 185–198: Button posts `{ type: 'toggle_mode' }`, labelled "Guide". |
| Sends `webview_ready` on mount | PASS | Line 61: `vscode.postMessage({ type: 'webview_ready' })` inside `useEffect([], [])`. |

**Chat Panel verdict: PASS**

---

## 3. Message Type Safety — `src/ui/messages.ts`

| HostMessage type | Guide panel handles | Chat panel handles |
|-----------------|--------------------|--------------------|
| `step_update` | PASS (line 79) | Not applicable (guide-only message) |
| `character_speak` | PASS (line 96) | Not applicable (guide-only message) |
| `chat_chunk` | Not applicable | PASS (line 66) |
| `mode_change` | Not handled | Not handled |
| `plan_display` | Not applicable | PASS (line 94) |
| `session_complete` | PASS (line 103) | PASS (line 112) |

**Finding — `mode_change` not handled in either panel:** `HostMessage` declares `{ type: 'mode_change'; mode: 'guide' | 'chat' }` in `messages.ts` (line 9), but neither `guide/index.tsx` nor `chat/index.tsx` switch on this type. Both panels only act on `toggle_mode` (a WebviewMessage sent from webview to host), not on an inbound `mode_change` from the host. If the host needs to programmatically push a mode switch into the webviews, neither panel will react.

**Message type safety verdict: PARTIAL PASS**
- All actively sent HostMessage types are handled correctly.
- `mode_change` is declared in the type union but unhandled in both webviews — a gap, not a crash, but worth noting as a functional hole.

---

## 4. Theme Support

| Check | Result | Notes |
|-------|--------|-------|
| Guide panel uses `--vscode-*` CSS variables | PASS | Uses: `--vscode-font-family`, `--vscode-font-size`, `--vscode-foreground`, `--vscode-editor-background`, `--vscode-panel-border`, `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-button-secondaryBackground`, `--vscode-button-secondaryForeground`, `--vscode-badge-background`, `--vscode-badge-foreground`, `--vscode-progressBar-background`, `--vscode-descriptionForeground`, `--vscode-dropdown-background`, `--vscode-dropdown-border`, `--vscode-dropdown-foreground`, `--vscode-list-hoverBackground`. All with sensible fallbacks. |
| Chat panel uses `--vscode-*` CSS variables | PASS | Uses: `--vscode-font-family`, `--vscode-font-size`, `--vscode-foreground`, `--vscode-editor-background`, `--vscode-panel-border`, `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-button-secondaryBackground`, `--vscode-button-secondaryForeground`, `--vscode-descriptionForeground`, `--vscode-input-background`, `--vscode-input-foreground`, `--vscode-input-border`, `--vscode-textCodeBlock-background`, `--vscode-charts-green`. All with sensible fallbacks. |

**Theme support verdict: PASS**

---

## 5. CSP Security — `src/ui/webviewHtml.ts`

| Check | Result | Notes |
|-------|--------|-------|
| `getWebviewHtml` shared by both panels | PASS | `guidePanel.ts` (line 46) and `chatPanel.ts` (line 46) both call `getWebviewHtml(webview, extensionUri, 'guide'/'chat')`. |
| Nonce generated | PASS | Line 9: `crypto.randomBytes(16).toString('hex')` — cryptographically random, generated fresh per panel creation. |
| CSP meta tag present | PASS | Lines 17–19: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: https:;">` present in the HTML template. |
| Script tag carries nonce | PASS | Line 24: `<script nonce="${nonce}" src="${scriptUri}">` — nonce is applied to the script element. |
| `default-src 'none'` | PASS | Locks down all resources by default; only explicitly whitelisted sources are allowed. |

**CSP security verdict: PASS**

---

## Summary

| Check Area | Verdict |
|------------|---------|
| Guide panel layout | PASS |
| Chat panel layout | PASS |
| Message type safety | PARTIAL PASS |
| Theme support | PASS |
| CSP security | PASS |

**Overall Sprint 4 result: PASS with one finding**

### Finding (non-blocking)

`mode_change` HostMessage type is declared in `src/ui/messages.ts` but is not handled by either `guide/index.tsx` or `chat/index.tsx`. No runtime crash occurs (unhandled switch cases are silently ignored), but any host-driven mode switching via this message type has no effect. Recommend either:
1. Adding a `mode_change` case to both panels' message handlers, or
2. Removing the type from `HostMessage` if it is intentionally unused (webviews initiate mode changes via `toggle_mode`, not the host).
