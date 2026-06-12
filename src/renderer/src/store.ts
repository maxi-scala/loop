// renderer/src/store.ts — app state backed by the main process over IPC.
import { create } from 'zustand'
import type { Routine, Run, Tweaks, Settings, AppData, UpdateStatus } from '@shared/types'
import type { RoutineCreateInput, DaemonStatus } from '@shared/ipc'

type LoopState = {
  routines: Routine[]
  runs: Run[]
  tweaks: Tweaks
  settings: Settings
  daemon: DaemonStatus
  /** Runtime updater state — NOT part of persisted AppData, so applyData leaves it alone. */
  update: UpdateStatus
  loaded: boolean
  loadError: string | null

  load: () => Promise<void>
  applyData: (data: AppData) => void

  createRoutine: (input: RoutineCreateInput) => Promise<Routine>
  updateRoutine: (routine: Routine) => Promise<Routine>
  deleteRoutine: (id: string) => Promise<void>
  toggleRoutine: (id: string) => Promise<void>
  runNow: (id: string) => Promise<void>

  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => Promise<void>
  setPausedAll: (paused: boolean) => Promise<void>
  setDaemonEnabled: (enabled: boolean) => Promise<void>
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>

  applyUpdateStatus: (status: UpdateStatus) => void
  checkUpdate: () => Promise<void>
  startUpdate: () => Promise<void>
  openRelease: () => Promise<void>
}

export const useStore = create<LoopState>((set, get) => ({
  routines: [],
  runs: [],
  tweaks: { accent: '#E8703F', layout: 'rows', density: 'comfortable' },
  settings: {
    daemonEnabled: false,
    pausedAll: false,
    defaultPermissionMode: 'bypass',
    defaultMissedRunGraceMinutes: 720,
    runTimeoutMinutes: 60
  },
  daemon: { installed: false, loaded: false },
  update: { phase: 'idle', info: null },
  loaded: false,
  loadError: null,

  load: async () => {
    try {
      const [routines, runs, tweaks, settings, daemon] = await Promise.all([
        window.api.routines.list(),
        window.api.runs.list(),
        window.api.tweaks.get(),
        window.api.settings.get(),
        window.api.daemon.status()
      ])
      set({ routines, runs, tweaks, settings, daemon, loaded: true, loadError: null })
    } catch (e) {
      // Surface the failure instead of leaving the UI stuck on "Loading…".
      set({ loaded: true, loadError: String(e) })
    }
  },

  applyData: (data) => {
    set({
      routines: data.routines,
      runs: [...data.runs].sort(
        (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
      ),
      tweaks: data.tweaks,
      settings: data.settings
    })
  },

  createRoutine: async (input) => {
    const r = await window.api.routines.create(input)
    await get().load()
    return r
  },
  updateRoutine: async (routine) => {
    const r = await window.api.routines.update(routine)
    await get().load()
    return r
  },
  deleteRoutine: async (id) => {
    await window.api.routines.delete(id)
    await get().load()
  },
  toggleRoutine: async (id) => {
    await window.api.routines.toggle(id)
    await get().load()
  },
  runNow: async (id) => {
    await window.api.routines.runNow(id)
    await get().load()
  },

  setTweak: async (key, value) => {
    const tweaks = await window.api.tweaks.set({ [key]: value })
    set({ tweaks })
  },
  setPausedAll: async (paused) => {
    const settings = await window.api.settings.set({ pausedAll: paused })
    set({ settings })
  },
  setDaemonEnabled: async (enabled) => {
    const daemon = enabled ? await window.api.daemon.install() : await window.api.daemon.uninstall()
    const settings = await window.api.settings.set({ daemonEnabled: enabled })
    set({ daemon, settings })
  },
  setSetting: async (key, value) => {
    const settings = await window.api.settings.set({ [key]: value })
    set({ settings })
  },

  applyUpdateStatus: (update) => set({ update }),
  checkUpdate: async () => {
    set({ update: { phase: 'checking', info: get().update.info } })
    const status = await window.api.update.check()
    set({ update: status })
  },
  startUpdate: async () => {
    // Progress + final phase arrive via the update:status push (applyUpdateStatus).
    await window.api.update.start()
  },
  openRelease: async () => {
    await window.api.update.openRelease()
  }
}))

/** Wire the main-process "data changed" push into the store. Call once at startup. */
export function subscribeToDataChanges(): () => void {
  return window.api.onDataChanged((data) => {
    useStore.getState().applyData(data)
  })
}

/** Wire the updater status push into the store. Call once at startup. */
export function subscribeToUpdateStatus(): () => void {
  return window.api.update.onStatus((status) => {
    useStore.getState().applyUpdateStatus(status)
  })
}
