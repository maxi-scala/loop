// core/scheduler.ts — the tick loop that fires routines on schedule.
//
// Modeled on orca's AutomationService (src/main/automations/service.ts): a setInterval
// tick that, on each pass, finds routines whose latest schedule occurrence is due and
// not yet satisfied by an existing run, then dispatches them. Missed occurrences older
// than the grace window are skipped (recorded implicitly by advancing past them).
import type { Routine, Run } from '@shared/types'
import { scheduleTimesForDay } from '@shared/schedule'
import { Store } from './persistence'
import { runClaude, createRunningRun } from './claude-runner'

const DEFAULT_TICK_MS = 60_000
/** How late a scheduled occurrence may fire after its time before being skipped. */
const GRACE_MS = 30 * 60 * 1000
/**
 * A run still marked "running" but older than this is considered dead (the process
 * that owned it exited without finishing). Such runs must NOT block future scheduling,
 * otherwise a single interrupted run wedges a routine forever (manual runs bypass this
 * check, which is why "manual works but scheduled never fires" shows up).
 */
export const STALE_RUN_MS = 2 * 60 * 60 * 1000

/** Find the most recent schedule occurrence at or before `now`, scanning back 14 days. */
export function latestOccurrenceAtOrBefore(routine: Routine, now: Date): Date | null {
  for (let i = 0; i < 14; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const times = scheduleTimesForDay(routine.schedule, day)
    // Walk times latest-first within the day.
    for (const t of times.slice().reverse()) {
      const [h, m] = t.split(':').map(Number)
      const cand = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
      if (cand <= now) return cand
    }
  }
  return null
}

export interface SchedulerOptions {
  tickMs?: number
  /** Override executor (used in tests). Defaults to runClaude-backed execution. */
  execute?: (routine: Routine, run: Run, store: Store) => Promise<void>
  /** Called after each tick with the list of routine ids fired this tick. */
  onFire?: (routineIds: string[]) => void
  log?: (msg: string) => void
}

/** Execute a routine end-to-end: stream Claude output into the run record. */
export async function executeRoutine(routine: Routine, run: Run, store: Store): Promise<void> {
  const result = await runClaude(
    { prompt: routine.prompt, dir: routine.dir, model: routine.model },
    {
      onTranscript: (_entry, all) => {
        store.updateRun(run.id, { transcript: all })
      }
    }
  )
  store.updateRun(run.id, {
    status: result.status,
    durationSec: result.durationSec,
    costUsd: result.costUsd,
    tokens: result.tokens,
    summary: result.summary,
    changes: result.changes,
    transcript: result.transcript
  })
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private readonly tickMs: number
  private readonly execute: (routine: Routine, run: Run, store: Store) => Promise<void>
  private readonly onFire?: (routineIds: string[]) => void
  private readonly log: (msg: string) => void
  /** Routine ids currently executing (in this process) to avoid double-dispatch. */
  private inFlight = new Set<string>()

  constructor(
    private store: Store,
    opts: SchedulerOptions = {}
  ) {
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS
    this.execute = opts.execute ?? executeRoutine
    this.onFire = opts.onFire
    this.log = opts.log ?? (() => {})
  }

  start(): void {
    if (this.timer) return
    this.log(`scheduler start (tick ${this.tickMs}ms)`)
    // Run an immediate tick, then on the interval.
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.tickMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Evaluate all routines once. Public for tests. */
  async tick(now: Date = new Date()): Promise<string[]> {
    const settings = this.store.getSettings()
    if (settings.pausedAll) return []
    const routines = this.store.listRoutines().filter((r) => r.enabled)
    const fired: string[] = []
    for (const routine of routines) {
      if (this.shouldFire(routine, now)) {
        fired.push(routine.id)
        void this.dispatch(routine, now)
      }
    }
    if (fired.length) this.onFire?.(fired)
    return fired
  }

  private shouldFire(routine: Routine, now: Date): boolean {
    if (this.inFlight.has(routine.id)) return false
    const occ = latestOccurrenceAtOrBefore(routine, now)
    if (!occ) return false
    // Skip occurrences older than the grace window.
    if (now.getTime() - occ.getTime() > GRACE_MS) return false
    const occIso = occ.toISOString()
    const runs = this.store.listRuns(routine.id)
    // Already satisfied this occurrence?
    if (runs.some((r) => r.scheduledFor === occIso)) return false
    // Don't pile onto a run that is genuinely still in progress, but ignore stale
    // "running" rows left behind by a crashed/quit process so they can't wedge us.
    if (
      runs.some(
        (r) => r.status === 'running' && now.getTime() - new Date(r.start).getTime() < STALE_RUN_MS
      )
    )
      return false
    return true
  }

  private async dispatch(routine: Routine, now: Date): Promise<void> {
    this.inFlight.add(routine.id)
    const occ = latestOccurrenceAtOrBefore(routine, now)
    const run = createRunningRun(routine.id, routine.prompt, routine.dir, 'scheduled')
    run.scheduledFor = occ ? occ.toISOString() : undefined
    this.store.addRun(run)
    this.log(`dispatch ${routine.name} (${routine.id}) for ${run.scheduledFor}`)
    try {
      await this.execute(routine, run, this.store)
    } catch (e) {
      this.store.updateRun(run.id, {
        status: 'failed',
        durationSec: 0,
        summary: `Run failed — ${String(e)}`
      })
    } finally {
      this.inFlight.delete(routine.id)
    }
  }
}
