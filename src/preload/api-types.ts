// preload/api-types.ts — the typed `window.api` surface exposed by the preload bridge.
import type { Routine, Run, Tweaks, Settings, AppData } from '@shared/types'
import type { RoutineCreateInput, DaemonStatus } from '@shared/ipc'

export interface LoopApi {
  routines: {
    list: () => Promise<Routine[]>
    get: (id: string) => Promise<Routine | undefined>
    create: (input: RoutineCreateInput) => Promise<Routine>
    update: (routine: Routine) => Promise<Routine>
    delete: (id: string) => Promise<void>
    toggle: (id: string) => Promise<Routine | undefined>
    runNow: (id: string) => Promise<Run | undefined>
  }
  runs: {
    list: (routineId?: string) => Promise<Run[]>
    get: (id: string) => Promise<Run | undefined>
  }
  tweaks: {
    get: () => Promise<Tweaks>
    set: (patch: Partial<Tweaks>) => Promise<Tweaks>
  }
  settings: {
    get: () => Promise<Settings>
    set: (patch: Partial<Settings>) => Promise<Settings>
  }
  daemon: {
    status: () => Promise<DaemonStatus>
    install: () => Promise<DaemonStatus>
    uninstall: () => Promise<DaemonStatus>
  }
  app: {
    /** Bring the main window to the front (used by the tray). */
    openWindow: () => Promise<void>
  }
  dialog: {
    /** Open a native folder picker; resolves to the chosen absolute path, or null if cancelled. */
    selectDirectory: () => Promise<string | null>
  }
  /** Subscribe to "data changed on disk / by another process" pushes. Returns an unsubscribe fn. */
  onDataChanged: (cb: (data: AppData) => void) => () => void
}

declare global {
  interface Window {
    api: LoopApi
  }
}
