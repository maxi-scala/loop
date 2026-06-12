// renderer/src/MenuBar.tsx — in-titlebar quick-status pill + dropdown (worker unit 6).
// Renders a small status pill (spark + pulsing dot when running) docked at the right
// of the draggable titlebar; clicking it toggles the quick-status dropdown.
// Dropdown content ported from project/app/screens-menubar.jsx (running now / next up /
// recent / pause all / open). The OS menu bar and system tray are separate concerns.
import React from 'react'
import { useStore } from './store'
import { Icon, StatusDot, Toggle } from './components'
import { computeNextRun } from '@shared/schedule'
import { relTime, relUntil, fmtTime } from '@shared/format'
import type { Nav } from './views'

export function MenuBar({ nav, now }: { nav: Nav; now: Date }): React.JSX.Element {
  const routines = useStore((s) => s.routines)
  const runs = useStore((s) => s.runs)
  const pausedAll = useStore((s) => s.settings.pausedAll)
  const setPausedAll = useStore((s) => s.setPausedAll)
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)

  // Close the dropdown on outside click / Escape so it behaves like a real menu.
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const running = runs.filter((r) => r.status === 'running')
  const recent = runs.filter((r) => r.status !== 'running').slice(0, 3)
  const nextUp = routines
    .filter((r) => r.enabled && !pausedAll)
    .map((r) => ({ r, next: computeNextRun(r.schedule, now) }))
    .filter((x): x is { r: (typeof routines)[number]; next: Date } => Boolean(x.next))
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 2)

  const routineName = (id: string): string =>
    routines.find((r) => r.id === id)?.name ?? 'Deleted routine'

  return (
    <div
      ref={wrapRef}
      style={
        {
          position: 'absolute',
          right: 10,
          top: 3,
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className={'mb-status' + (open ? ' open' : '')}
        onClick={() => setOpen((v) => !v)}
        title="Loop quick status"
      >
        <Icon name="spark" size={13} />
        {running.length > 0 && !pausedAll ? <span className="mb-status-dot" /> : null}
      </button>

      {open ? (
        <div className="mb-panel" style={{ position: 'absolute', right: 0, top: 30 }}>
          <div className="mb-panel-head">
            <span className="mb-panel-title">Routines</span>
            <label className="mb-pause mono">
              pause all
              <Toggle value={pausedAll} onChange={(v) => void setPausedAll(v)} small />
            </label>
          </div>

          {pausedAll ? (
            <div className="mb-section">
              <div className="mb-paused-note mono">
                <StatusDot status="paused" /> all routines paused
              </div>
            </div>
          ) : (
            <div>
              {running.length > 0 ? (
                <div className="mb-section">
                  <div className="mb-section-label mono">running now</div>
                  {running.map((run) => (
                    <div key={run.id} className="mb-run">
                      <StatusDot status="running" />
                      <div className="mb-run-main">
                        <span className="mb-run-name">{routineName(run.routineId)}</span>
                        <span className="mono dim mb-run-sub">
                          started {relTime(run.start, now)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mb-section">
                <div className="mb-section-label mono">next up</div>
                {nextUp.length === 0 ? (
                  <div className="dim mono" style={{ fontSize: 11, padding: '4px 2px' }}>
                    nothing scheduled
                  </div>
                ) : (
                  nextUp.map(({ r, next }) => (
                    <div key={r.id} className="mb-run">
                      <Icon name="clock" size={12} style={{ color: 'var(--text-3)' }} />
                      <div className="mb-run-main">
                        <span className="mb-run-name">{r.name}</span>
                        <span className="mono dim mb-run-sub">
                          {relUntil(next, now)} · {fmtTime(next)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mb-section">
            <div className="mb-section-label mono">recent</div>
            {recent.map((run) => (
              <div key={run.id} className="mb-run">
                <StatusDot status={run.status} size={6} />
                <div className="mb-run-main">
                  <span className="mb-run-name">{routineName(run.routineId)}</span>
                  <span className="mono dim mb-run-sub">{relTime(run.start, now)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-foot">
            <button
              type="button"
              className="mb-open-btn"
              onClick={() => {
                setOpen(false)
                nav({ screen: 'routines' })
              }}
            >
              Open Routines…
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
