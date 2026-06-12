// renderer/src/screens/Editor.tsx — create / edit routine sheet (worker unit 3).
// Ported from project/app/screens-editor.jsx (EditorSheet).
import React from 'react'
import { useStore } from '../store'
import { Btn, Icon, Seg } from '../components'
import {
  parseNL,
  scheduleToNL,
  describeSchedule,
  computeNextRun,
  MODELS
} from '@shared/schedule'
import { fmtDateTime } from '@shared/format'
import type { Routine, Schedule, ModelId } from '@shared/types'

// Mon..Sun mapping to day indices, matching the prototype's ED_DAYS order.
const ED_DAYS: { v: number; l: string }[] = [
  { v: 1, l: 'Mon' },
  { v: 2, l: 'Tue' },
  { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' },
  { v: 5, l: 'Fri' },
  { v: 6, l: 'Sat' },
  { v: 0, l: 'Sun' }
]

type NlState = 'idle' | 'ok' | 'bad'

export function Editor({
  routine,
  onClose
}: {
  routine: Routine | null
  onClose: () => void
}): React.JSX.Element {
  const createRoutine = useStore((s) => s.createRoutine)
  const updateRoutine = useStore((s) => s.updateRoutine)
  const isNew = !routine

  const [name, setName] = React.useState(routine ? routine.name : '')
  const [prompt, setPrompt] = React.useState(routine ? routine.prompt : '')
  const [dir, setDir] = React.useState(routine ? routine.dir : '~/work/')
  const [model, setModel] = React.useState<ModelId>(routine ? routine.model : 'sonnet')
  const [schedule, setSchedule] = React.useState<Schedule>(
    routine
      ? { ...routine.schedule }
      : { freq: 'daily', time: '09:00', days: [1], everyHours: 6 }
  )
  const [nl, setNl] = React.useState(routine ? scheduleToNL(routine.schedule) : '')
  const [nlState, setNlState] = React.useState<NlState>(routine ? 'ok' : 'idle')
  const [structured, setStructured] = React.useState(false)

  // natural language → schedule
  const onNlChange = (v: string): void => {
    setNl(v)
    if (!v.trim()) {
      setNlState('idle')
      return
    }
    const parsed = parseNL(v)
    if (parsed) {
      setSchedule((s) => ({ ...s, ...parsed }))
      setNlState('ok')
    } else {
      setNlState('bad')
    }
  }

  // structured → schedule (+ regenerate NL)
  const patchSchedule = (patch: Partial<Schedule>): void => {
    const next = { ...schedule, ...patch }
    setSchedule(next)
    setNl(scheduleToNL(next))
    setNlState('ok')
  }

  const toggleDay = (d: number): void => {
    const days = schedule.days.includes(d)
      ? schedule.days.filter((x) => x !== d)
      : [...schedule.days, d].sort((a, b) => a - b)
    if (days.length === 0) return
    patchSchedule({ days })
  }

  const valid = !!name.trim() && !!prompt.trim() && (nlState !== 'bad' || structured)
  const preview = computeNextRun(schedule, new Date())

  const save = async (): Promise<void> => {
    if (!valid) return
    const edits = {
      name: name.trim(),
      prompt: prompt.trim(),
      dir: dir.trim() || '~/',
      model,
      schedule
    }
    if (routine) {
      await updateRoutine({ ...routine, ...edits })
    } else {
      await createRoutine({ ...edits, enabled: true })
    }
    onClose()
  }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modelDesc = MODELS.find((m) => m.id === model)?.desc

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet" data-screen-label="Routine editor">
        <div className="sheet-head">
          <div className="sheet-title">{isNew ? 'New routine' : 'Edit routine'}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="sheet-body">
          <label className="field">
            <span className="field-label mono">name</span>
            <input
              className="input"
              value={name}
              placeholder="Morning issue triage"
              autoFocus={isNew}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label mono">prompt</span>
            <div className="prompt-input-wrap">
              <span className="prompt-mark">❯</span>
              <textarea
                className="textarea mono"
                rows={5}
                value={prompt}
                placeholder="What should Claude Code do each time this runs?"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <span className="field-hint">
              Runs headless in the working directory with this prompt.
            </span>
          </label>

          <div className="field">
            <div className="field-label-row">
              <span className="field-label mono">schedule</span>
              <button
                type="button"
                className="link-btn mono"
                onClick={() => setStructured(!structured)}
              >
                {structured ? 'use natural language' : 'set manually'}
              </button>
            </div>

            {!structured ? (
              <div>
                <div className={'nl-wrap' + (nlState === 'bad' ? ' bad' : '')}>
                  <Icon name="clock" size={14} style={{ color: 'var(--text-3)' }} />
                  <input
                    className="input nl-input"
                    value={nl}
                    placeholder={'try "every weekday at 9am" or "every 6 hours"'}
                    onChange={(e) => onNlChange(e.target.value)}
                  />
                  {nlState === 'ok' ? (
                    <Icon name="check" size={14} style={{ color: 'var(--green)' }} />
                  ) : null}
                </div>
                {nlState === 'bad' ? (
                  <span className="field-hint" style={{ color: 'var(--red)' }}>
                    Couldn&apos;t parse that — try &quot;every day at 7pm&quot;, or set it manually.
                  </span>
                ) : (
                  <span className="field-hint">
                    {describeSchedule(schedule)}
                    {preview ? ` · next: ${fmtDateTime(preview)}` : ''}
                  </span>
                )}
              </div>
            ) : (
              <div className="sched-structured">
                <Seg
                  value={schedule.freq}
                  onChange={(v) => patchSchedule({ freq: v as Schedule['freq'] })}
                  options={[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekdays', label: 'Weekdays' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'hourly', label: 'Hourly' }
                  ]}
                />
                {schedule.freq === 'weekly' ? (
                  <div className="day-picker">
                    {ED_DAYS.map((d) => (
                      <button
                        key={d.v}
                        type="button"
                        className={'day-btn mono' + (schedule.days.includes(d.v) ? ' active' : '')}
                        onClick={() => toggleDay(d.v)}
                      >
                        {d.l}
                      </button>
                    ))}
                  </div>
                ) : null}
                {schedule.freq === 'hourly' ? (
                  <label className="inline-field">
                    <span className="mono dim">every</span>
                    <select
                      className="select mono"
                      value={schedule.everyHours}
                      onChange={(e) => patchSchedule({ everyHours: +e.target.value })}
                    >
                      {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="mono dim">hours</span>
                  </label>
                ) : (
                  <label className="inline-field">
                    <span className="mono dim">at</span>
                    <input
                      type="time"
                      className="input time-input mono"
                      value={schedule.time}
                      onChange={(e) => patchSchedule({ time: e.target.value || '09:00' })}
                    />
                  </label>
                )}
                <span className="field-hint">
                  {describeSchedule(schedule)}
                  {preview ? ` · next: ${fmtDateTime(preview)}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="field-row">
            <label className="field" style={{ flex: 1.6 }}>
              <span className="field-label mono">working directory</span>
              <div className="dir-wrap">
                <Icon name="folder" size={14} style={{ color: 'var(--text-3)' }} />
                <input
                  className="input mono dir-input"
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                />
              </div>
            </label>
            <div className="field" style={{ flex: 1 }}>
              <span className="field-label mono">model</span>
              <Seg
                value={model}
                onChange={(v) => setModel(v as ModelId)}
                options={MODELS.map((m) => ({ value: m.id, label: m.label }))}
              />
              <span className="field-hint">{modelDesc}</span>
            </div>
          </div>
        </div>

        <div className="sheet-foot">
          <Btn ghost onClick={onClose}>
            Cancel
          </Btn>
          <Btn primary disabled={!valid} onClick={() => void save()}>
            {isNew ? 'Create routine' : 'Save changes'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
