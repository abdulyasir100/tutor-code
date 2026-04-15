export type MonitoringEventType =
  | 'file_save'
  | 'file_create'
  | 'file_delete'
  | 'terminal_cmd'
  | 'diagnostics'

export interface FileSaveEvent {
  type: 'file_save'
  uri: string            // vscode.Uri.toString() — serializable
  relativePath: string
  contentPreview: string // first 2000 chars
  timestamp: number
}

export interface FileCreateEvent {
  type: 'file_create'
  uri: string
  relativePath: string
  timestamp: number
}

export interface FileDeleteEvent {
  type: 'file_delete'
  uri: string
  relativePath: string
  timestamp: number
}

export interface TerminalCmdEvent {
  type: 'terminal_cmd'
  raw: string
  command: string        // parsed command string
  exitCode: number | null
  timestamp: number
}

export interface DiagnosticsEvent {
  type: 'diagnostics'
  uri: string
  relativePath: string
  errorCount: number
  warningCount: number
  timestamp: number
}

export type MonitoringEvent =
  | FileSaveEvent
  | FileCreateEvent
  | FileDeleteEvent
  | TerminalCmdEvent
  | DiagnosticsEvent
