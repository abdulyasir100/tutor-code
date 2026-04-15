import * as vscode from 'vscode'
import { MonitoringEvent } from './types'
import { FileWatcher } from './fileWatcher'
import { TerminalWatcher } from './terminalWatcher'
import { DiagnosticsWatcher } from './diagnosticsWatcher'

/**
 * Coordinates all monitoring watchers, fanning their events into
 * a single onMonitoringEvent emitter. The caller (extension.ts or
 * tierEvaluator in Phase 7) subscribes to this single stream.
 */
export class MonitoringOrchestrator {
  private readonly _onMonitoringEvent = new vscode.EventEmitter<MonitoringEvent>()
  public readonly onMonitoringEvent = this._onMonitoringEvent.event

  private fileWatcher: FileWatcher
  private terminalWatcher: TerminalWatcher
  private diagnosticsWatcher: DiagnosticsWatcher

  private disposables: vscode.Disposable[] = []
  private workspaceRoot: string

  /** When set, events are queued but not emitted until cooldown expires. */
  private pausedUntil = 0
  private pauseQueue: MonitoringEvent[] = []
  private pauseTimer: ReturnType<typeof setTimeout> | undefined

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
    this.fileWatcher = new FileWatcher()
    this.terminalWatcher = new TerminalWatcher()
    this.diagnosticsWatcher = new DiagnosticsWatcher()
  }

  /**
   * Start all watchers and subscribe to their events.
   * Call when a session plan is committed.
   */
  start(): void {
    // Start individual watchers
    this.fileWatcher.start(this.workspaceRoot)
    this.terminalWatcher.start()
    this.diagnosticsWatcher.start(this.workspaceRoot)

    // Fan all watcher events into the single emitter
    this.disposables.push(
      this.fileWatcher.onEvent((event) => this.routeEvent(event)),
    )
    this.disposables.push(
      this.terminalWatcher.onEvent((event) => this.routeEvent(event)),
    )
    this.disposables.push(
      this.diagnosticsWatcher.onEvent((event) => this.routeEvent(event)),
    )
  }

  /**
   * Stop all watchers and dispose subscriptions.
   * Call on session complete, abandon, or extension deactivate.
   */
  stop(): void {
    if (this.pauseTimer !== undefined) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = undefined
    }
    this.pauseQueue = []
    this.pausedUntil = 0

    this.fileWatcher.stop()
    this.terminalWatcher.stop()
    this.diagnosticsWatcher.stop()

    this.disposables.forEach((d) => d.dispose())
    this.disposables = []
  }

  /**
   * Pause evaluation for a number of minutes. Events are still captured
   * by watchers but the orchestrator holds them until the pause expires.
   * When pause expires, queued events are flushed.
   */
  pause(minutes: number): void {
    const durationMs = minutes * 60_000
    this.pausedUntil = Date.now() + durationMs

    if (this.pauseTimer !== undefined) {
      clearTimeout(this.pauseTimer)
    }

    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = undefined
      this.pausedUntil = 0
      this.flushPauseQueue()
    }, durationMs)
  }

  /**
   * Resume from pause early, flushing any queued events.
   */
  resume(): void {
    if (this.pauseTimer !== undefined) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = undefined
    }
    this.pausedUntil = 0
    this.flushPauseQueue()
  }

  private routeEvent(event: MonitoringEvent): void {
    if (Date.now() < this.pausedUntil) {
      // Queue during pause — keep only last 50 events to bound memory
      this.pauseQueue.push(event)
      if (this.pauseQueue.length > 50) {
        this.pauseQueue.shift()
      }
      return
    }

    this._onMonitoringEvent.fire(event)
  }

  private flushPauseQueue(): void {
    const events = this.pauseQueue.splice(0)
    for (const event of events) {
      this._onMonitoringEvent.fire(event)
    }
  }

  dispose(): void {
    this.stop()
    this._onMonitoringEvent.dispose()
    this.fileWatcher.dispose()
    this.terminalWatcher.dispose()
    this.diagnosticsWatcher.dispose()
  }
}
