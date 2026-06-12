import { describe, it, expect } from 'vitest'
import { Scheduler } from '@core/scheduler'
import type { Store } from '@core/persistence'
import type { Routine, Run, Settings } from '@shared/types'

/** Minimal in-memory stand-in for Store covering the methods Scheduler uses. */
function fakeStore(routines: Routine[], runs: Run[] = [], settings?: Partial<Settings>) {
  const state = {
    routines,
    runs,
    settings: { daemonEnabled: false, pausedAll: false, ...settings }
  }
  return {
    getSettings: () => state.settings,
    listRoutines: () => state.routines,
    listRuns: (id?: string) => (id ? state.runs.filter((r) => r.routineId === id) : state.runs),
    getRoutine: (id: string) => state.routines.find((r) => r.id === id),
    addRun: (run: Run) => {
      state.runs = [run, ...state.runs]
      return run
    },
    updateRun: (id: string, patch: Partial<Run>) => {
      const i = state.runs.findIndex((r) => r.id === id)
      if (i === -1) return undefined
      state.runs[i] = { ...state.runs[i], ...patch }
      return state.runs[i]
    },
    _state: state
  }
}

function dailyRoutine(time: string, over: Partial<Routine> = {}): Routine {
  return {
    id: 'rt-1',
    name: 'R',
    prompt: 'p',
    dir: '~',
    model: 'sonnet',
    enabled: true,
    schedule: { freq: 'daily', time, days: [], everyHours: 0 },
    ...over
  }
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('Scheduler.tick firing', () => {
  it('fires a daily routine whose time just passed', async () => {
    const now = new Date()
    const justPassed = new Date(now.getTime() - 60_000) // 1 min ago
    const store = fakeStore([dailyRoutine(hhmm(justPassed))])
    const fired: string[] = []
    const sched = new Scheduler(store as unknown as Store, {
      execute: async (r) => {
        fired.push(r.id)
      }
    })
    await sched.tick(now)
    expect(fired).toEqual(['rt-1'])
    expect(store._state.runs.length).toBe(1)
    expect(store._state.runs[0].scheduledFor).toBeTruthy()
  })

  it('does NOT fire twice for the same occurrence', async () => {
    const now = new Date()
    const justPassed = new Date(now.getTime() - 60_000)
    const store = fakeStore([dailyRoutine(hhmm(justPassed))])
    let count = 0
    const sched = new Scheduler(store as unknown as Store, {
      execute: async () => {
        count++
      }
    })
    await sched.tick(now)
    await sched.tick(now)
    expect(count).toBe(1)
  })

  it('is NOT blocked by a STALE "running" run (>2h old, from a crashed process)', async () => {
    const now = new Date()
    const justPassed = new Date(now.getTime() - 60_000)
    const stuck: Run = {
      id: 'old',
      routineId: 'rt-1',
      start: new Date(now.getTime() - 3 * 3600_000).toISOString(), // 3h ago → stale
      durationSec: null,
      status: 'running',
      costUsd: null,
      tokens: null,
      summary: 'stuck',
      changes: [],
      transcript: []
    }
    const store = fakeStore([dailyRoutine(hhmm(justPassed))], [stuck])
    let count = 0
    const sched = new Scheduler(store as unknown as Store, {
      execute: async () => {
        count++
      }
    })
    await sched.tick(now)
    expect(count).toBe(1) // stale running run must not wedge the routine
  })

  it('IS blocked by a genuinely recent "running" run (avoid piling on)', async () => {
    const now = new Date()
    const justPassed = new Date(now.getTime() - 60_000)
    const active: Run = {
      id: 'active',
      routineId: 'rt-1',
      start: new Date(now.getTime() - 30_000).toISOString(), // 30s ago → still running
      durationSec: null,
      status: 'running',
      costUsd: null,
      tokens: null,
      summary: 'in progress',
      changes: [],
      transcript: []
    }
    const store = fakeStore([dailyRoutine(hhmm(justPassed))], [active])
    let count = 0
    const sched = new Scheduler(store as unknown as Store, {
      execute: async () => {
        count++
      }
    })
    await sched.tick(now)
    expect(count).toBe(0)
  })
})
