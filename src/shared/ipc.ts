// shared/ipc.ts — IPC channel name constants, shared by main and preload.
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
  // main → renderer push
  dataChanged: 'data:changed'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Input to create a routine (id/enabled assigned/defaulted by main). */
export interface RoutineCreateInput {
  name: string
  prompt: string
  dir: string
  model: import('./types').ModelId
  schedule: import('./types').Schedule
  enabled?: boolean
}

export interface DaemonStatus {
  installed: boolean
  loaded: boolean
}
