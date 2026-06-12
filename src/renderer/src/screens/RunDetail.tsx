// renderer/src/screens/RunDetail.tsx — run detail: meta strip (duration/cost/tokens/model/dir),
// summary + changes, transcript. Ported from project/app/screens-history.jsx (RunDetailScreen).
import React from 'react'
import { useStore } from '../store'
import { ScreenHead, StatusBadge, Transcript, Icon, ModelChip, ChangeItem } from '../components'
import { Markdown } from '../Markdown'
import { fmtDateTime, fmtDur, fmtCost, fmtTokens } from '@shared/format'
import type { ScreenProps, View } from '../views'

export function RunDetailScreen({
  runId,
  from,
  nav
}: ScreenProps & { runId: string; from?: View }): React.JSX.Element {
  const run = useStore((s) => s.runs.find((r) => r.id === runId))
  const routine = useStore((s) => s.routines.find((r) => r.id === run?.routineId))
  if (!run) {
    return <div className="screen stub-note">Run not found.</div>
  }

  const back: View = from || { screen: 'history' }
  const backLabels: Partial<Record<View['screen'], string>> = {
    history: 'History',
    calendar: 'Calendar',
    routine: routine ? routine.name : 'Routine',
    routines: 'Routines'
  }
  const backLabel = backLabels[back.screen] || 'Back'

  return (
    <div className="screen" data-screen-label="Run detail">
      <div className="crumbs">
        <button type="button" className="crumb-link" onClick={() => nav(back)}>
          <Icon name="chevL" size={13} /> {backLabel}
        </button>
      </div>

      <ScreenHead title={routine ? routine.name : 'Deleted routine'} sub={fmtDateTime(run.start)}>
        <StatusBadge status={run.status} />
      </ScreenHead>

      <div className="run-meta-strip panel">
        <div className="run-meta">
          <span className="kv-k mono">duration</span>
          <span className="mono">{fmtDur(run.durationSec)}</span>
        </div>
        <div className="run-meta">
          <span className="kv-k mono">cost</span>
          <span className="mono">{fmtCost(run.costUsd)}</span>
        </div>
        <div className="run-meta">
          <span className="kv-k mono">tokens</span>
          <span className="mono">{fmtTokens(run.tokens)}</span>
        </div>
        <div className="run-meta">
          <span className="kv-k mono">model</span>
          {routine ? <ModelChip model={routine.model} /> : <span className="mono">—</span>}
        </div>
        <div className="run-meta">
          <span className="kv-k mono">directory</span>
          <span className="mono">{routine ? routine.dir : '—'}</span>
        </div>
      </div>

      <div className="run-detail-grid">
        <div className="panel">
          <div className="panel-label mono">summary</div>
          <div className="run-summary-text">
            <Markdown text={run.summary} />
          </div>
          {run.changes && run.changes.length > 0 ? (
            <div>
              <div className="panel-label mono" style={{ marginTop: 14 }}>
                changes
              </div>
              <div className="change-list">
                {run.changes.map((c, i) => (
                  <ChangeItem key={i} change={c} />
                ))}
              </div>
            </div>
          ) : run.status === 'success' ? (
            <div className="dim mono" style={{ fontSize: 12, marginTop: 12 }}>
              no changes made
            </div>
          ) : null}
        </div>

        <div className="panel transcript-panel">
          <div className="panel-label mono">transcript</div>
          <Transcript entries={run.transcript || []} />
          {run.status === 'running' ? (
            <div className="tr-line tr-result">
              <span className="tr-mark mono blink">▊</span>
              <span className="tr-text mono dim">working…</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
