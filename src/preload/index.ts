// preload/index.ts — context bridge: the audited contract between renderer and main.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppData } from '@shared/types'
import type { LoopApi } from './api-types'

const api: LoopApi = {
  routines: {
    list: () => ipcRenderer.invoke(IPC.routinesList),
    get: (id) => ipcRenderer.invoke(IPC.routinesGet, id),
    create: (input) => ipcRenderer.invoke(IPC.routineCreate, input),
    update: (routine) => ipcRenderer.invoke(IPC.routineUpdate, routine),
    delete: (id) => ipcRenderer.invoke(IPC.routineDelete, id),
    toggle: (id) => ipcRenderer.invoke(IPC.routineToggle, id),
    runNow: (id) => ipcRenderer.invoke(IPC.routineRunNow, id)
  },
  runs: {
    list: (routineId) => ipcRenderer.invoke(IPC.runsList, routineId),
    get: (id) => ipcRenderer.invoke(IPC.runGet, id)
  },
  tweaks: {
    get: () => ipcRenderer.invoke(IPC.tweaksGet),
    set: (patch) => ipcRenderer.invoke(IPC.tweaksSet, patch)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  daemon: {
    status: () => ipcRenderer.invoke(IPC.daemonStatus),
    install: () => ipcRenderer.invoke(IPC.daemonInstall),
    uninstall: () => ipcRenderer.invoke(IPC.daemonUninstall)
  },
  app: {
    openWindow: () => ipcRenderer.invoke(IPC.openWindow)
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke(IPC.selectDirectory)
  },
  onDataChanged: (cb: (data: AppData) => void) => {
    const listener = (_event: unknown, data: AppData): void => cb(data)
    ipcRenderer.on(IPC.dataChanged, listener)
    return () => ipcRenderer.removeListener(IPC.dataChanged, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
