// main/ipc.ts — registers all ipcMain handlers and wires data-change broadcasts.
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { homedir } from 'os'
import { IPC } from '@shared/ipc'
import type { RoutineCreateInput } from '@shared/ipc'
import type { Routine, Tweaks, Settings } from '@shared/types'
import { uid } from '@shared/schedule'
import type { Store } from '@core/persistence'
import { executeRoutine } from '@core/scheduler'
import { createRunningRun } from '@core/claude-runner'
import { getDaemonStatus, installDaemon, uninstallDaemon } from './launchd'
import { showMainWindow } from './window'
import { refreshTray } from './tray'
import { checkForUpdate, downloadAndOpen, openReleasePage, getStatus } from './updater'

export type IpcDeps = {
  store: Store
  /** Called whenever state mutates so the renderer + tray refresh. */
  broadcast: () => void
  /** Re-sync the in-app scheduler with the daemon state after a daemon toggle. */
  reconcileScheduler: () => void
}

/** Manual "Run now": execute via the main process regardless of the daemon. */
async function runRoutineNow(store: Store, id: string, broadcast: () => void): Promise<void> {
  const routine = store.getRoutine(id)
  if (!routine) {
    return
  }
  const run = createRunningRun(routine.id, routine.prompt, routine.dir, 'manual')
  store.addRun(run)
  broadcast()
  try {
    await executeRoutine(routine, run, store)
  } catch (e) {
    store.updateRun(run.id, {
      status: 'failed',
      durationSec: 0,
      summary: `Run failed — ${String(e)}`
    })
  }
  broadcast()
}

export function registerIpcHandlers({ store, broadcast, reconcileScheduler }: IpcDeps): void {
  ipcMain.handle(IPC.routinesList, () => store.listRoutines())
  ipcMain.handle(IPC.routinesGet, (_e, id: string) => store.getRoutine(id))

  ipcMain.handle(IPC.routineCreate, (_e, input: RoutineCreateInput) => {
    const routine: Routine = {
      id: `rt-${uid()}`,
      name: input.name,
      prompt: input.prompt,
      dir: input.dir,
      model: input.model,
      schedule: input.schedule,
      enabled: input.enabled ?? true,
      permissionMode: input.permissionMode,
      missedRunGraceMinutes: input.missedRunGraceMinutes
    }
    const saved = store.upsertRoutine(routine)
    broadcast()
    return saved
  })

  ipcMain.handle(IPC.routineUpdate, (_e, routine: Routine) => {
    const saved = store.upsertRoutine(routine)
    broadcast()
    return saved
  })

  ipcMain.handle(IPC.routineDelete, (_e, id: string) => {
    store.deleteRoutine(id)
    broadcast()
  })

  ipcMain.handle(IPC.routineToggle, (_e, id: string) => {
    const r = store.toggleRoutine(id)
    broadcast()
    return r
  })

  ipcMain.handle(IPC.routineRunNow, async (_e, id: string) => {
    // Kick off asynchronously; return the running run record immediately.
    const routine = store.getRoutine(id)
    if (!routine) {
      return undefined
    }
    void runRoutineNow(store, id, broadcast)
    // The run was added synchronously inside runRoutineNow before the first await,
    // but to be safe return the latest running run for this routine.
    return store.listRuns(id).find((r) => r.status === 'running')
  })

  ipcMain.handle(IPC.runsList, (_e, routineId?: string) => store.listRuns(routineId))
  ipcMain.handle(IPC.runGet, (_e, id: string) => store.getRun(id))

  ipcMain.handle(IPC.tweaksGet, () => store.getTweaks())
  ipcMain.handle(IPC.tweaksSet, (_e, patch: Partial<Tweaks>) => {
    const t = store.setTweaks(patch)
    broadcast()
    return t
  })

  ipcMain.handle(IPC.settingsGet, () => store.getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => {
    const s = store.setSettings(patch)
    broadcast()
    return s
  })

  ipcMain.handle(IPC.daemonStatus, () => getDaemonStatus())
  ipcMain.handle(IPC.daemonInstall, async () => {
    const status = await installDaemon()
    reconcileScheduler()
    broadcast()
    return status
  })
  ipcMain.handle(IPC.daemonUninstall, async () => {
    const status = await uninstallDaemon()
    reconcileScheduler()
    broadcast()
    return status
  })

  ipcMain.handle(IPC.openWindow, () => showMainWindow())

  ipcMain.handle(IPC.updateCheck, async () => {
    await checkForUpdate()
    return getStatus()
  })
  ipcMain.handle(IPC.updateStart, () => downloadAndOpen())
  ipcMain.handle(IPC.updateOpenRelease, () => openReleasePage())

  ipcMain.handle(IPC.selectDirectory, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const properties: ('openDirectory' | 'createDirectory')[] = ['openDirectory', 'createDirectory']
    const opts = { title: 'Choose working directory', defaultPath: homedir(), properties }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}

/** Push fresh AppData to every renderer window and refresh the tray. */
export function broadcastData(store: Store): void {
  const data = store.getAll()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.dataChanged, data)
    }
  }
  refreshTray()
}
