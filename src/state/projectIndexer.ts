import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import {
  ProjectIndex,
  FileTreeNode,
  FileSummary,
  DetectedStack,
} from './types'

const KEY_FILE_PATTERNS = [
  'package.json',
  'tsconfig.json',
  'next.config.*',
  'vite.config.*',
  'app/layout.*',
  'app/page.*',
  'pages/index.*',
  'src/index.*',
  'src/main.*',
  'src/App.*',
  'src/app.*',
  'prisma/schema.prisma',
  'drizzle.config.*',
  '.env.example',
  'README.md',
]

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.turbo',
])

export class ProjectIndexer {
  private readonly workspaceRoot: string
  private readonly indexPath: string
  private currentIndex: ProjectIndex | null = null

  private readonly _onIndexChange = new vscode.EventEmitter<ProjectIndex>()
  public readonly onIndexChange = this._onIndexChange.event

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
    this.indexPath = path.join(workspaceRoot, '.vscode', 'tutorcode-index.json')
  }

  async buildIndex(): Promise<ProjectIndex> {
    const tree = await this.walkTree(this.workspaceRoot, '')
    const stack = await this.detectStack()
    const keyFiles = await this.findKeyFiles()
    const keySummaries: Record<string, FileSummary> = {}

    for (const filePath of keyFiles) {
      const summary = await this.summarizeFile(filePath)
      keySummaries[filePath] = summary
    }

    const index: ProjectIndex = {
      version: '1.0',
      indexedAt: new Date().toISOString(),
      workspaceRoot: this.workspaceRoot,
      tree,
      keySummaries,
      detectedStack: stack,
    }

    // Write to disk
    const dir = path.dirname(this.indexPath)
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8')

    this.currentIndex = index
    this._onIndexChange.fire(index)
    return index
  }

  async refreshTree(): Promise<void> {
    if (!this.currentIndex) { return }
    this.currentIndex.tree = await this.walkTree(this.workspaceRoot, '')
    this.currentIndex.indexedAt = new Date().toISOString()

    await fs.promises.writeFile(this.indexPath, JSON.stringify(this.currentIndex, null, 2), 'utf-8')
    this._onIndexChange.fire(this.currentIndex)
  }

  async summarizeFile(_filePath: string): Promise<FileSummary> {
    // Placeholder — actual AI summary will be wired in Phase 7
    return {
      path: _filePath,
      purpose: 'Pending AI summary',
      generatedAt: new Date().toISOString(),
    }
  }

  async detectStack(): Promise<DetectedStack> {
    const stack: DetectedStack = {
      language: [],
      framework: [],
      runtime: [],
      packageManager: 'npm',
      hasTypeScript: false,
      configFiles: [],
    }

    // Detect TypeScript
    const tsconfigPath = path.join(this.workspaceRoot, 'tsconfig.json')
    try {
      await fs.promises.access(tsconfigPath)
      stack.hasTypeScript = true
      stack.language.push('typescript')
      stack.configFiles.push('tsconfig.json')
    } catch {
      // no tsconfig
    }

    // Read package.json for deps
    const pkgPath = path.join(this.workspaceRoot, 'package.json')
    try {
      const raw = await fs.promises.readFile(pkgPath, 'utf-8')
      const pkg = JSON.parse(raw) as Record<string, unknown>
      stack.configFiles.push('package.json')

      if (!stack.language.includes('typescript')) {
        stack.language.push('javascript')
      }

      const allDeps: Record<string, string> = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      }

      // Frameworks
      if ('next' in allDeps) { stack.framework.push('nextjs') }
      if ('react' in allDeps) { stack.framework.push('react') }
      if ('vue' in allDeps) { stack.framework.push('vue') }
      if ('svelte' in allDeps) { stack.framework.push('svelte') }
      if ('express' in allDeps) { stack.framework.push('express') }
      if ('fastify' in allDeps) { stack.framework.push('fastify') }
      if ('hono' in allDeps) { stack.framework.push('hono') }

      // Runtime
      stack.runtime.push('nodejs')
    } catch {
      // no package.json
    }

    // Detect package manager via lockfile
    const lockFiles: Array<[string, string]> = [
      ['bun.lockb', 'bun'],
      ['bun.lock', 'bun'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
    ]

    for (const [file, manager] of lockFiles) {
      try {
        await fs.promises.access(path.join(this.workspaceRoot, file))
        stack.packageManager = manager
        if (manager === 'bun' && !stack.runtime.includes('bun')) {
          stack.runtime.push('bun')
        }
        break
      } catch {
        // try next
      }
    }

    // Detect additional config files
    const configGlobs = ['next.config.*', 'vite.config.*', 'drizzle.config.*', 'prisma/schema.prisma']
    for (const glob of configGlobs) {
      const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 1)
      if (uris.length > 0) {
        const rel = path.relative(this.workspaceRoot, uris[0].fsPath)
        if (!stack.configFiles.includes(rel)) {
          stack.configFiles.push(rel)
        }
      }
    }

    return stack
  }

  getIndex(): ProjectIndex | null {
    return this.currentIndex
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async walkTree(dirPath: string, relativePath: string): Promise<FileTreeNode[]> {
    const nodes: FileTreeNode[] = []

    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    } catch {
      return nodes
    }

    // Sort: directories first, then files, both alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) { return -1 }
      if (!a.isDirectory() && b.isDirectory()) { return 1 }
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const ignored = IGNORE_DIRS.has(entry.name)
        const node: FileTreeNode = {
          name: entry.name,
          path: entryRelPath,
          type: 'directory',
          ignored,
        }
        if (!ignored) {
          node.children = await this.walkTree(fullPath, entryRelPath)
        }
        nodes.push(node)
      } else {
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: 'file',
          ignored: false,
        })
      }
    }

    return nodes
  }

  private async findKeyFiles(): Promise<string[]> {
    const found: string[] = []
    for (const pattern of KEY_FILE_PATTERNS) {
      const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5)
      for (const uri of uris) {
        const rel = path.relative(this.workspaceRoot, uri.fsPath).replace(/\\/g, '/')
        if (!found.includes(rel)) {
          found.push(rel)
        }
      }
    }
    return found
  }

  dispose(): void {
    this._onIndexChange.dispose()
  }
}
