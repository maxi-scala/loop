// renderer/src/components.tsx — shared UI primitives, ported from project/app/components.jsx.
import React from 'react'
import type { RunStatus, Change, TranscriptEntry, Run, ModelId } from '@shared/types'
import { MODELS } from '@shared/schedule'
import { fmtDur, fmtCost, fmtTokens } from '@shared/format'
import { Icon, type IconName } from './lib/icons'
import { Markdown } from './Markdown'

export { Icon }
export type { IconName }

// ── status ───────────────────────────────────────────────────
export const STATUS_META: Record<string, { color: string; label: string }> = {
  success: { color: 'var(--green)', label: 'success' },
  failed: { color: 'var(--red)', label: 'failed' },
  running: { color: 'var(--accent)', label: 'running' },
  skipped: { color: 'var(--text-3)', label: 'skipped' },
  paused: { color: 'var(--text-3)', label: 'paused' },
  scheduled: { color: 'var(--text-3)', label: 'scheduled' }
}

export function StatusDot({
  status,
  size = 7
}: {
  status: string
  size?: number
}): React.JSX.Element {
  const m = STATUS_META[status] || STATUS_META.scheduled
  return (
    <span
      className={`dot${status === 'running' ? ' dot-pulse' : ''}`}
      style={{ width: size, height: size, background: m.color }}
    />
  )
}

export function StatusBadge({ status }: { status: RunStatus }): React.JSX.Element {
  const m = STATUS_META[status] || STATUS_META.scheduled
  return (
    <span className="badge mono" style={{ color: m.color }}>
      <StatusDot status={status} size={6} />
      {m.label}
    </span>
  )
}

// ── controls ─────────────────────────────────────────────────
export function Toggle({
  value,
  onChange,
  small
}: {
  value: boolean
  onChange: (v: boolean) => void
  small?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`toggle${value ? ' on' : ''}${small ? ' sm' : ''}`}
      role="switch"
      aria-checked={value}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!value)
      }}
    >
      <span className="knob" />
    </button>
  )
}

export type SegOption = string | { value: string; label: string; icon?: IconName }

export function Seg({
  options,
  value,
  onChange
}: {
  options: SegOption[]
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <div className="seg">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        const icon = typeof o === 'object' ? o.icon : undefined
        return (
          <button
            key={v}
            type="button"
            className={`seg-btn${v === value ? ' active' : ''}`}
            onClick={() => onChange(v)}
          >
            {icon ? <Icon name={icon} size={14} /> : null}
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Btn({
  children,
  icon,
  primary,
  danger,
  ghost,
  small,
  onClick,
  disabled,
  title
}: {
  children?: React.ReactNode
  icon?: IconName
  primary?: boolean
  danger?: boolean
  ghost?: boolean
  small?: boolean
  onClick?: (e: React.MouseEvent) => void
  disabled?: boolean
  title?: string
}): React.JSX.Element {
  let cls = 'btn'
  if (primary) {
    cls += ' btn-primary'
  }
  if (danger) {
    cls += ' btn-danger'
  }
  if (ghost) {
    cls += ' btn-ghost'
  }
  if (small) {
    cls += ' btn-sm'
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  )
}

export function ModelChip({ model }: { model: ModelId }): React.JSX.Element {
  return <span className="chip mono">{MODELS.find((m) => m.id === model)?.label || model}</span>
}

export function ScreenHead({
  title,
  sub,
  children
}: {
  title: string
  sub?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="screen-head">
      <div className="screen-head-text">
        <h1>{title}</h1>
        {sub ? <p className="screen-sub">{sub}</p> : null}
      </div>
      <div className="screen-head-actions">{children}</div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  children
}: {
  icon: IconName
  title: string
  body: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
      {children}
    </div>
  )
}

// ── change list (files / commits / PRs) ──────────────────────
export function ChangeItem({ change }: { change: Change }): React.JSX.Element {
  const icons: Record<string, IconName> = {
    edit: 'file',
    commit: 'commit',
    pr: 'pr',
    label: 'label'
  }
  return (
    <span className="change mono">
      <Icon name={icons[change.t] || 'file'} size={13} />
      {change.x}
    </span>
  )
}

// ── transcript ───────────────────────────────────────────────
export function Transcript({ entries }: { entries: TranscriptEntry[] }): React.JSX.Element {
  return (
    <div className="transcript">
      {entries.map((e, i) => {
        if (e.role === 'user') {
          return (
            <div key={i} className="tr-line tr-user">
              <span className="tr-mark mono">❯</span>
              <span className="tr-text">{e.text}</span>
            </div>
          )
        }
        if (e.role === 'assistant') {
          return (
            <div key={i} className="tr-line tr-assistant">
              <span className="tr-mark" style={{ color: 'var(--accent)' }}>
                ⏺
              </span>
              <div className="tr-text">
                <Markdown text={e.text || ''} />
              </div>
            </div>
          )
        }
        if (e.role === 'tool') {
          return (
            <div key={i} className="tr-line tr-tool">
              <span className="tr-mark" style={{ color: 'var(--green)' }}>
                ⏺
              </span>
              <span className="tr-text mono">
                <strong>{e.name}</strong>({e.arg})
              </span>
            </div>
          )
        }
        return (
          <div key={i} className={`tr-line tr-result${e.err ? ' tr-err' : ''}`}>
            <span className="tr-mark mono">⎿</span>
            <span className="tr-text mono">{e.text}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── run stats strip ──────────────────────────────────────────
export function RunStats({ run }: { run: Run }): React.JSX.Element {
  return (
    <div className="run-stats mono">
      <span title="Duration">
        <Icon name="clock" size={13} /> {fmtDur(run.durationSec)}
      </span>
      <span title="Cost">{fmtCost(run.costUsd)}</span>
      <span title="Tokens">{fmtTokens(run.tokens)} tok</span>
    </div>
  )
}
