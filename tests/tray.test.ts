import { describe, it, expect } from 'vitest'
import { buildMenuModel, type MenuModelItem } from '../src/main/tray'
import type { Routine, Run, Settings } from '@shared/types'

const NOW = new Date('2026-06-12T09:00:00')

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    name: 'Morning standup',
    prompt: 'do it',
    dir: '~/work',
    model: 'sonnet',
    enabled: true,
    schedule: { freq: 'daily', time: '10:00', days: [], everyHours: 0 },
    ...over
  }
}

function run(over: Partial<Run> = {}): Run {
  return {
    id: 'run1',
    routineId: 'r1',
    start: '2026-06-12T08:30:00',
    durationSec: 30,
    status: 'success',
    costUsd: 0.1,
    tokens: 1000,
    summary: '',
    changes: [],
    transcript: [],
    ...over
  }
}

const settings = (over: Partial<Settings> = {}): Settings => ({
  daemonEnabled: false,
  pausedAll: false,
  defaultPermissionMode: 'bypass',
  defaultMissedRunGraceMinutes: 720,
  runTimeoutMinutes: 60,
  ...over
})

const labels = (m: MenuModelItem[]): string[] =>
  m.filter((i): i is Extract<MenuModelItem, { label: string }> => 'label' in i).map((i) => i.label)

describe('buildMenuModel', () => {
  it('always has a Loop header, a Pause all checkbox, Open Loop and Quit', () => {
    const m = buildMenuModel([], [], settings(), NOW)
    expect(m[0]).toEqual({ type: 'header', label: 'Loop' })
    const pause = m.find((i) => i.type === 'checkbox')
    expect(pause).toMatchObject({ type: 'checkbox', id: 'pauseAll', checked: false })
    expect(m.some((i) => i.type === 'action' && i.id === 'openLoop')).toBe(true)
    expect(m.some((i) => i.type === 'quit')).toBe(true)
  })

  it('shows running runs with a bullet and relative start time', () => {
    const m = buildMenuModel(
      [routine()],
      [run({ id: 'x', status: 'running', start: '2026-06-12T08:30:00' })],
      settings(),
      NOW
    )
    expect(labels(m)).toContain('Running now')
    expect(labels(m).some((l) => l.startsWith('• Morning standup — started'))).toBe(true)
  })

  it('lists at most 2 next-up enabled routines sorted by next run', () => {
    const routines = [
      routine({
        id: 'a',
        name: 'A',
        schedule: { freq: 'daily', time: '12:00', days: [], everyHours: 0 }
      }),
      routine({
        id: 'b',
        name: 'B',
        schedule: { freq: 'daily', time: '10:00', days: [], everyHours: 0 }
      }),
      routine({
        id: 'c',
        name: 'C',
        schedule: { freq: 'daily', time: '11:00', days: [], everyHours: 0 }
      }),
      routine({ id: 'd', name: 'D', enabled: false })
    ]
    const m = buildMenuModel(routines, [], settings(), NOW)
    const nextLabels = labels(m).filter((l) => /^[ABC] —/.test(l))
    expect(nextLabels).toHaveLength(2)
    // B (10:00) before C (11:00); disabled D excluded.
    expect(nextLabels[0].startsWith('B —')).toBe(true)
    expect(nextLabels[1].startsWith('C —')).toBe(true)
  })

  it('hides next-up and marks paused when pausedAll', () => {
    const m = buildMenuModel([routine()], [], settings({ pausedAll: true }), NOW)
    expect(labels(m)).toContain('all routines paused')
    expect(m.find((i) => i.type === 'checkbox')).toMatchObject({ checked: true })
  })

  it('shows at most 3 recent non-running runs and skips running ones', () => {
    const runs = [
      run({ id: '1', status: 'running' }),
      run({ id: '2', status: 'success' }),
      run({ id: '3', status: 'failed' }),
      run({ id: '4', status: 'success' }),
      run({ id: '5', status: 'success' })
    ]
    const m = buildMenuModel([routine()], runs, settings(), NOW)
    const recentIdx = labels(m).indexOf('Recent')
    expect(recentIdx).toBeGreaterThan(-1)
    const recentRows = labels(m)
      .slice(recentIdx + 1)
      .filter((l) => l.startsWith('Morning standup —'))
    expect(recentRows).toHaveLength(3)
  })

  it('falls back to "Deleted routine" for unknown routine ids', () => {
    const m = buildMenuModel([], [run({ routineId: 'gone', status: 'success' })], settings(), NOW)
    expect(labels(m).some((l) => l.startsWith('Deleted routine —'))).toBe(true)
  })
})
