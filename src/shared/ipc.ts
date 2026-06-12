// shared/ipc.ts — IPC channel name constants, shared by main and preload.
import type { ModelId, PermissionMode, Schedule } from './types'

export const IPC = {
  routinesList: 'routines:list',
  routinesGet: 'routines:get',
  routineCreate: 'routines:create',
  routineUpdate: 'routines:update',
  routineDelete: 'routines:delete',
  routineToggle: 'routines:toggle',
  routineRunNow: 'routines:runNow',
  runsList: 'runs:list',
  runGet: 'runs:get',
  tweaksGet: 'tweaks:get',
  tweaksSet: 'tweaks:set',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  daemonStatus: 'daemon:status',
  daemonInstall: 'daemon:install',
  daemonUninstall: 'daemon:uninstall',
  selectDirectory: 'dialog:selectDirectory',
  openWindow: 'app:openWindow',
  updateCheck: 'update:check',
  updateStart: 'update:start',
  updateOpenRelease: 'update:openRelease',
  // main → renderer push
  dataChanged: 'data:changed',
  updateStatus: 'update:status'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Input to create a routine (id/enabled assigned/defaulted by main). */
export type RoutineCreateInput = {
  name: string
  prompt: string
  dir: string
  model: ModelId
  schedule: Schedule
  enabled?: boolean
  permissionMode?: PermissionMode
  missedRunGraceMinutes?: number
}

export type DaemonStatus = {
  installed: boolean
  loaded: boolean
}
