// tests/electron-stub.ts — stand-in for the `electron` module under vitest.
// Pure-logic tests (e.g. the tray menu model, plist builder) import modules that
// statically `import ... from 'electron'`; in a non-Electron test runner that module
// throws if the binary isn't installed. These no-op stubs let those imports resolve.
// Tests must not exercise real Electron behaviour — only pure helpers.
class Tray {}
const Menu = { buildFromTemplate: () => ({}) }
const nativeImage = { createEmpty: () => ({ setTemplateImage: () => {} }) }
const app = { getAppPath: () => '', getPath: () => '', on: () => {}, quit: () => {} }
class BrowserWindow {
  static getAllWindows = (): unknown[] => []
  static getFocusedWindow = (): unknown => null
}
const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }
const ipcMain = { handle: () => {} }
const ipcRenderer = { invoke: async () => undefined, on: () => {}, removeListener: () => {} }
const contextBridge = { exposeInMainWorld: () => {} }
const shell = { openExternal: async () => {} }
const nativeTheme = { themeSource: 'dark' }

export {
  Tray,
  Menu,
  nativeImage,
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  ipcRenderer,
  contextBridge,
  shell,
  nativeTheme
}
export default {
  Tray,
  Menu,
  nativeImage,
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  ipcRenderer,
  contextBridge,
  shell,
  nativeTheme
}
