// main/index.ts — Electron main-process entry: app lifecycle, IPC wiring,
// window + tray, and the in-app scheduler (active only when the daemon is not installed).
import { watch, type FSWatcher } from 'fs'
import { basename } from 'path'
import { app, BrowserWindow, powerMonitor } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { Store } from '@core/persistence'
import { Scheduler, STALE_RUN_MS } from '@core/scheduler'
import { dataDir, dataFile } from '@core/paths'
import { createMainWindow, showMainWindow } from './window'
import { registerIpcHandlers, broadcastData } from './ipc'
import { createTray } from './tray'
import { startAutoChecks } from './updater'

let store: Store
let scheduler: Scheduler | null = null
let watcher: FSWatcher | null = null
let broadcastTimer: NodeJS.Timeout | null = null

// Log otherwise-silent failures so they're diagnosable from the daemon/app logs.
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err)
})

function broadcast(): void {
  broadcastData(store)
}

/** Coalesce bursts of changes (e.g. streaming transcript updates) into one broadcast. */
function scheduleBroadcast(): void {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer)
  }
  broadcastTimer = setTimeout(() => broadcast(), 60)
}

/**
 * Keep the renderer in sync from two sources:
 *  1. The Store's own change events — covers every mutation made in THIS process
 *     (manual runs, the in-app scheduler's streaming/completion updates, settings…).
 *  2. A watch on the data DIRECTORY — covers writes by the standalone daemon. We watch
 *     the directory, not the file: `fs.watch(file)` goes deaf after the first atomic
 *     rename (the inode it was watching is replaced), so file-level watching silently
 *     stops delivering daemon updates after one write.
 */
function startSync(): void {
  store.onChange(() => scheduleBroadcast())
  const file = basename(dataFile())
  const attach = (): void => {
    watcher = watch(dataDir(), (_event, name) => {
      if (!name || name === file) {
        scheduleBroadcast()
      }
    })
  }
  try {
    attach()
  } catch {
    // The data dir may not exist on the very first launch; Store creates it — retry once.
    setTimeout(() => {
      try {
        attach()
      } catch {
        /* give up; in-process changes still broadcast via store.onChange */
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
  if (!store) {
    return
  }
  if (scheduler) {
    return
  }
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
    startSync()
    reconcileScheduler()
    // Notify the user when a newer release is published (assisted update — see updater.ts).
    startAutoChecks()

    // The 60s tick is paused while the machine sleeps; on wake, evaluate immediately so
    // a routine missed during sleep fires (within its grace window) without a 60s lag.
    powerMonitor.on('resume', () => {
      void scheduler?.tick()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      } else {
        showMainWindow()
      }
    })
  })

  // Keep running in the tray when all windows are closed (macOS tray app behavior).
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    scheduler?.stop()
    watcher?.close()
  })
}
