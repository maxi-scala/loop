// main/index.ts — Electron main-process entry: app lifecycle, IPC wiring,
// window + tray, and the in-app scheduler (active only when the daemon is not installed).
import { watch, type FSWatcher } from 'fs'
import { app, BrowserWindow } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { Store } from '@core/persistence'
import { Scheduler, STALE_RUN_MS } from '@core/scheduler'
import { dataFile } from '@core/paths'
import { createMainWindow, showMainWindow } from './window'
import { registerIpcHandlers, broadcastData } from './ipc'
import { createTray } from './tray'

let store: Store
let scheduler: Scheduler | null = null
let watcher: FSWatcher | null = null

function broadcast(): void {
  broadcastData(store)
}

/** Watch the data file so changes written by the daemon reach the renderer live. */
function startDataFileWatch(): void {
  try {
    let debounce: NodeJS.Timeout | null = null
    watcher = watch(dataFile(), () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => broadcast(), 200)
    })
  } catch {
    // The file may not exist yet on very first launch; Store creates it, retry once.
    setTimeout(() => {
      try {
        watcher = watch(dataFile(), () => broadcast())
      } catch {
        /* give up; renderer still gets local-mutation broadcasts */
      }
    }, 1000)
  }
}

/**
 * Ensure the in-app scheduler is running. We run it whenever the app is open —
 * even if the background daemon is also installed — so scheduled routines reliably
 * fire while Loop is in front. Cross-process duplicate runs are prevented by the
 * scheduledFor de-dup in the shared data file. The daemon only matters when the app
 * is fully quit. Safe to call repeatedly (startup + after daemon toggles).
 */
function reconcileScheduler(): void {
  if (!store) return
  if (scheduler) return
  scheduler = new Scheduler(store, {
    onFire: () => broadcast(),
    log: (m) => console.log('[scheduler]', m)
  })
  scheduler.start()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.loop.routines')

    store = new Store()
    // A run still marked "running" at startup belonged to a previous process that
    // exited mid-run; fail it so it doesn't wedge the scheduler.
    store.reconcileStaleRuns(STALE_RUN_MS)
    registerIpcHandlers({ store, broadcast, reconcileScheduler })
    createMainWindow()
    createTray({ store, showWindow: showMainWindow })
    startDataFileWatch()
    reconcileScheduler()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else showMainWindow()
    })
  })

  // Keep running in the tray when all windows are closed (macOS tray app behavior).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    scheduler?.stop()
    watcher?.close()
  })
}
