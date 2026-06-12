// renderer/src/screens/History.tsx — run history grouped by day with status/routine filters.
// Ported from project/app/screens-history.jsx (HistoryScreen).
import React from 'react'
import { useStore } from '../store'
import { ScreenHead, Seg, StatusDot, RunStats, EmptyState, Icon } from '../components'
import { fmtTime, fmtDate, fmtCost } from '@shared/format'
import type { ScreenProps } from '../views'

export function HistoryScreen({ nav }: ScreenProps): React.JSX.Element {
  const runs = useStore((s) => s.runs)
  const routines = useStore((s) => s.routines)
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [routineFilter, setRoutineFilter] = React.useState('all')

  const routineName = (id: string): string =>
    routines.find((r) => r.id === id)?.name ?? 'Deleted routine'

  const filtered = runs.filter(
    (r) =>
      (statusFilter === 'all' || r.status === statusFilter) &&
      (routineFilter === 'all' || r.routineId === routineFilter)
  )

  // group by day
  const groups = React.useMemo(() => {
    const m = new Map<string, { date: Date; runs: typeof filtered }>()
    for (const r of filtered) {
      const d = new Date(r.start)
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!m.has(k)) {
        m.set(k, { date: d, runs: [] })
      }
      m.get(k)!.runs.push(r)
    }
    return [...m.values()]
  }, [filtered])

  const totalCost = filtered.reduce((a, r) => a + (r.costUsd || 0), 0)

  return (
    <div className="screen" data-screen-label="History">
      <ScreenHead title="History" sub={`${filtered.length} runs · ${fmtCost(totalCost)} total`}>
        <select
          className="select"
          value={routineFilter}
          onChange={(e) => setRoutineFilter(e.target.value)}
        >
          <option value="all">All routines</option>
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Seg
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'success', label: 'Success' },
            { value: 'failed', label: 'Failed' },
            { value: 'skipped', label: 'Skipped' }
          ]}
        />
      </ScreenHead>

      {groups.length === 0 ? (
        <EmptyState
          icon="history"
          title="No runs match"
          body="Adjust the filters, or wait for the next scheduled run."
        />
      ) : (
        <div className="hist-groups">
          {groups.slice(0, 21).map((g) => (
            <div key={g.date.toISOString()} className="hist-group">
              <div className="hist-date mono">{fmtDate(g.date)}</div>
              <div className="run-list">
                {g.runs.map((run) => (
                  <div
                    key={run.id}
                    className="run-row"
                    onClick={() =>
                      nav({ screen: 'run', runId: run.id, from: { screen: 'history' } })
                    }
                  >
                    <StatusDot status={run.status} />
                    <span className="mono run-row-time">{fmtTime(run.start)}</span>
                    <span className="run-row-name">{routineName(run.routineId)}</span>
                    <span className="run-row-summary">{run.summary}</span>
                    <RunStats run={run} />
                    <Icon name="chevR" size={13} style={{ color: 'var(--text-3)' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
