import * as vscode from 'vscode'
import * as crypto from 'crypto'

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bundle: 'guide' | 'chat'
): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${bundle}.js`)
  )
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}
