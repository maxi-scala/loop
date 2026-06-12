// core/persistence.ts — atomic JSON store with backup rotation.
// Modeled on orca's persistence (src/main/persistence.ts): write to a temp file,
// fsync, atomic rename, and keep a small ring of timestamped backups.
//
// Both the Electron main process and the standalone daemon use this. To stay safe
// across two writers, every mutation reloads the on-disk state first (read-modify-
// write) so the last writer doesn't clobber unrelated fields it never saw.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync } from 'fs'
import type { AppData, Routine, Run, Tweaks, Settings } from '@shared/types'
import { defaultAppData, APP_DATA_VERSION } from '@shared/seed'
import { dataDir, dataFile, backupFile } from './paths'

const MAX_BACKUPS = 5

function ensureDir(): void {
  const dir = dataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function normalize(data: Partial<AppData> | null): AppData {
  const base = defaultAppData()
  if (!data || typeof data !== 'object') return base
  return {
    version: APP_DATA_VERSION,
    routines: Array.isArray(data.routines) ? data.routines : base.routines,
    runs: Array.isArray(data.runs) ? data.runs : [],
    tweaks: { ...base.tweaks, ...(data.tweaks || {}) },
    settings: { ...base.settings, ...(data.settings || {}) }
  }
}

export class Store {
  private state: AppData
  private lastMtimeMs = 0

  constructor() {
    this.state = this.readFromDisk()
  }

  private readFromDisk(): AppData {
    const file = dataFile()
    if (!existsSync(file)) {
      const seeded = defaultAppData()
      this.writeToDisk(seeded)
      return seeded
    }
    try {
      const raw = readFileSync(file, 'utf-8')
      this.lastMtimeMs = statSync(file).mtimeMs
      return normalize(JSON.parse(raw))
    } catch {
      // Try the most recent backup before giving up to defaults.
      for (let i = 0; i < MAX_BACKUPS; i++) {
        try {
          const bak = backupFile(i)
          if (existsSync(bak)) return normalize(JSON.parse(readFileSync(bak, 'utf-8')))
        } catch {
          /* try next */
        }
      }
      return defaultAppData()
    }
  }

  /** Reload from disk if another process has written since our last read. */
  private reloadIfStale(): void {
    const file = dataFile()
    try {
      if (!existsSync(file)) return
      const mtime = statSync(file).mtimeMs
      if (mtime > this.lastMtimeMs) {
        this.state = this.readFromDisk()
      }
    } catch {
      /* keep in-memory state */
    }
  }

  private rotateBackups(): void {
    const file = dataFile()
    if (!existsSync(file)) return
    try {
      const last = backupFile(MAX_BACKUPS - 1)
      if (existsSync(last)) {
        // drop the oldest by shifting; simplest is to just overwrite ring slots
      }
      for (let i = MAX_BACKUPS - 1; i > 0; i--) {
        const src = backupFile(i - 1)
        if (existsSync(src)) renameSync(src, backupFile(i))
      }
      // copy current file content into slot 0
      writeFileSync(backupFile(0), readFileSync(file))
    } catch {
      /* backups are best-effort */
    }
  }

  private writeToDisk(data: AppData): void {
    ensureDir()
    const file = dataFile()
    this.rotateBackups()
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, file)
    try {
      this.lastMtimeMs = statSync(file).mtimeMs
    } catch {
      /* ignore */
    }
  }

  private mutate<T>(fn: (state: AppData) => T): T {
    this.reloadIfStale()
    const result = fn(this.state)
    this.writeToDisk(this.state)
    return result
  }

  // ── reads ──────────────────────────────────────────────────
  getAll(): AppData {
    this.reloadIfStale()
    return structuredClone(this.state)
  }

  listRoutines(): Routine[] {
    this.reloadIfStale()
    return structuredClone(this.state.routines)
  }

  getRoutine(id: string): Routine | undefined {
    this.reloadIfStale()
    return this.state.routines.find((r) => r.id === id)
  }

  listRuns(routineId?: string): Run[] {
    this.reloadIfStale()
    const runs = routineId
      ? this.state.runs.filter((r) => r.routineId === routineId)
      : this.state.runs
    return structuredClone(runs).sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    )
  }

  getRun(id: string): Run | undefined {
    this.reloadIfStale()
    return this.state.runs.find((r) => r.id === id)
  }

  getTweaks(): Tweaks {
    this.reloadIfStale()
    return structuredClone(this.state.tweaks)
  }

  getSettings(): Settings {
    this.reloadIfStale()
    return structuredClone(this.state.settings)
  }

  // ── routine mutations ──────────────────────────────────────
  upsertRoutine(routine: Routine): Routine {
    return this.mutate((s) => {
      const i = s.routines.findIndex((r) => r.id === routine.id)
      if (i === -1) s.routines = [routine, ...s.routines]
      else s.routines[i] = routine
      return routine
    })
  }

  deleteRoutine(id: string): void {
    this.mutate((s) => {
      s.routines = s.routines.filter((r) => r.id !== id)
    })
  }

  toggleRoutine(id: string): Routine | undefined {
    return this.mutate((s) => {
      const r = s.routines.find((x) => x.id === id)
      if (r) r.enabled = !r.enabled
      return r
    })
  }

  // ── run mutations ──────────────────────────────────────────
  addRun(run: Run): Run {
    return this.mutate((s) => {
      s.runs = [run, ...s.runs]
      return run
    })
  }

  updateRun(id: string, patch: Partial<Run>): Run | undefined {
    return this.mutate((s) => {
      const i = s.runs.findIndex((r) => r.id === id)
      if (i === -1) return undefined
      s.runs[i] = { ...s.runs[i], ...patch }
      return s.runs[i]
    })
  }

  /**
   * Fail any run still marked "running" but older than maxAgeMs. Such runs belong to a
   * process that exited without finishing; left as-is they wedge the scheduler (which
   * won't fire a routine that appears to be mid-run). Returns the number cleaned up.
   */
  reconcileStaleRuns(maxAgeMs: number): number {
    return this.mutate((s) => {
      const now = Date.now()
      let count = 0
      for (const r of s.runs) {
        if (r.status === 'running' && now - new Date(r.start).getTime() >= maxAgeMs) {
          r.status = 'failed'
          r.durationSec = r.durationSec ?? Math.round((now - new Date(r.start).getTime()) / 1000)
          r.summary = 'Run interrupted — Loop was restarted before it finished.'
          count++
        }
      }
      return count
    })
  }

  // ── settings / tweaks ──────────────────────────────────────
  setTweaks(patch: Partial<Tweaks>): Tweaks {
    return this.mutate((s) => {
      s.tweaks = { ...s.tweaks, ...patch }
      return s.tweaks
    })
  }

  setSettings(patch: Partial<Settings>): Settings {
    return this.mutate((s) => {
      s.settings = { ...s.settings, ...patch }
      return s.settings
    })
  }
}
