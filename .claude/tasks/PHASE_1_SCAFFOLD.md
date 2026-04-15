# Phase 1 — Scaffold

## Goal
Produce a compilable, packageable VSCode extension skeleton with no business logic.
Every subsequent phase adds to this. Get the build pipeline right here.

---

## package.json

Required fields and values:

```json
{
  "name": "tutorcode",
  "displayName": "TutorCode",
  "description": "Live AI tutor that guides you without writing code for you",
  "version": "1.0.0",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Education", "Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "tutorcode.start",      "title": "TutorCode: Start Session" },
      { "command": "tutorcode.toggle",     "title": "TutorCode: Toggle Guide/Chat" },
      { "command": "tutorcode.pause",      "title": "TutorCode: Pause Monitoring" },
      { "command": "tutorcode.revisePlan", "title": "TutorCode: Revise Plan" },
      { "command": "tutorcode.reindex",    "title": "TutorCode: Re-scan Project" },
      { "command": "tutorcode.abandon",    "title": "TutorCode: Abandon Session" }
    ],
    "keybindings": [
      {
        "command": "tutorcode.toggle",
        "key": "ctrl+shift+t",
        "mac": "cmd+shift+t",
        "when": "tutorcode.sessionActive"
      }
    ],
    "configuration": {
      "title": "TutorCode",
      "properties": {
        "tutorcode.aiProvider": {
          "type": "string",
          "enum": ["anthropic", "openai", "grok", "openrouter"],
          "default": "anthropic",
          "description": "AI provider to use for guidance"
        },
        "tutorcode.guidanceModel": {
          "type": "string",
          "default": "",
          "description": "Model for guidance/chat (leave blank for provider default)"
        },
        "tutorcode.monitorModel": {
          "type": "string",
          "default": "",
          "description": "Model for monitoring (leave blank for provider default)"
        },
        "tutorcode.cooldownSeconds": {
          "type": "number",
          "default": 30,
          "description": "Minimum seconds between unprompted guidance messages"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "node esbuild.config.js",
    "watch": "node esbuild.config.js --watch",
    "build:webview": "node esbuild.config.js --webview-only",
    "package": "vsce package",
    "lint": "eslint src --ext ts,tsx"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "openai": "^4.52.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@types/vscode": "^1.74.0",
    "@vscode/vsce": "^2.26.0",
    "esbuild": "^0.21.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.4.0"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/ui/webview/**"]
}
```

Webview bundles have their own tsconfig:

```json
// tsconfig.webview.json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/ui/webview/**/*", "src/ui/messages.ts"]
}
```

---

## esbuild.config.js

Three separate bundles:
1. Extension host bundle (CommonJS, Node.js target)
2. Guide webview bundle (ESM, browser target)
3. Chat webview bundle (ESM, browser target)

Mark `vscode` as external in the extension bundle (it's injected by the host).
Both webview bundles must be self-contained (no `require`, no `vscode`).

---

## src/extension.ts Skeleton

Implement:
- `activate(context)` — register all 6 commands as stubs that show "coming soon" info message
- `deactivate()` — empty for now
- Set `tutorcode.sessionActive` context key to `false` on activate
- Export `activate` and `deactivate`

---

## Webview Skeletons

`src/ui/webview/guide/index.tsx`:
- React component that renders "Guide Panel — Phase 1 Scaffold"
- Mounts to `#root`

`src/ui/webview/chat/index.tsx`:
- React component that renders "Chat Panel — Phase 1 Scaffold"
- Mounts to `#root`

---

## src/ui/messages.ts

Define the full discriminated union message types from `docs/UI.md`.
Both webview bundles and the extension host import from this file.
Extension host imports via relative path. Webview bundles import via the same.

---

## Verification

After Phase 1, you must be able to run:
```bash
npm install
npm run build
```

With zero TypeScript errors and a `dist/` directory containing:
```
dist/
  extension.js
  webview/
    guide.js
    chat.js
```

And `vsce package` should produce a `.vsix` file (even though the extension
does nothing useful yet).
