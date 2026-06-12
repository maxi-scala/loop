// daemon/index.ts — standalone background scheduler launched by launchd.
//
// Runs outside Electron (plain Node). It reuses the same core Store + Scheduler as the
// app so scheduled routines fire even when the app is fully quit. Worker unit 8 owns the
// launchd plist + install flow; this entry is the long-running process that plist invokes.
import { appendFileSync } from 'fs'
import { Store } from '@core/persistence'
import { Scheduler, STALE_RUN_MS } from '@core/scheduler'
import { logFile } from '@core/paths'

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    appendFileSync(logFile(), line)
  } catch {
    /* ignore log failures */
  }
  // Also stdout so launchd StandardOutPath captures it.
  process.stdout.write(line)
}

function main(): void {
  log('loop daemon starting')
  const store = new Store()
  const cleaned = store.reconcileStaleRuns(STALE_RUN_MS)
  if (cleaned) log(`reconciled ${cleaned} stale running run(s)`)
  const scheduler = new Scheduler(store, { log })
  scheduler.start()

  const shutdown = (signal: string): void => {
    log(`received ${signal}, shutting down`)
    scheduler.stop()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // Keep the event loop alive.
  setInterval(() => {}, 1 << 30)
}

main()
