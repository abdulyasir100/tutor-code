// @ts-check
const esbuild = require('esbuild')

const watch = process.argv.includes('--watch')
const webviewOnly = process.argv.includes('--webview-only')

/** @type {import('esbuild').BuildOptions} */
const extensionBundle = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  bundle: true,
  sourcemap: true,
  target: 'node18',
}

/** @type {import('esbuild').BuildOptions} */
const guideWebviewBundle = {
  entryPoints: ['src/ui/webview/guide/index.tsx'],
  outfile: 'dist/webview/guide.js',
  format: 'esm',
  platform: 'browser',
  bundle: true,
  sourcemap: true,
}

/** @type {import('esbuild').BuildOptions} */
const chatWebviewBundle = {
  entryPoints: ['src/ui/webview/chat/index.tsx'],
  outfile: 'dist/webview/chat.js',
  format: 'esm',
  platform: 'browser',
  bundle: true,
  sourcemap: true,
}

async function main() {
  const webviewBundles = [guideWebviewBundle, chatWebviewBundle]
  const allBundles = webviewOnly ? webviewBundles : [extensionBundle, ...webviewBundles]

  if (watch) {
    const contexts = await Promise.all(allBundles.map(opts => esbuild.context(opts)))
    await Promise.all(contexts.map(ctx => ctx.watch()))
    console.log('Watching for changes...')
  } else {
    await Promise.all(allBundles.map(opts => esbuild.build(opts)))
    console.log('Build complete.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
