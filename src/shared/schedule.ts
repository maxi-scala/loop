// shared/schedule.ts — schedule engine + natural-language parsing.
// Ported faithfully from project/app/data.js (the design prototype).
import type { Schedule, ModelMeta, PermissionMode } from './types'

export const MODELS: ModelMeta[] = [
  { id: 'sonnet', label: 'Sonnet', desc: 'Fast, balanced — good default' },
  { id: 'opus', label: 'Opus', desc: 'Most capable, slower' },
  { id: 'haiku', label: 'Haiku', desc: 'Cheapest, light tasks' }
]

export const PERMISSION_MODES: { id: PermissionMode; label: string; desc: string }[] = [
  {
    id: 'bypass',
    label: 'Auto',
    desc: 'Skip all permission prompts (--dangerously-skip-permissions)'
  },
  {
    id: 'acceptEdits',
    label: 'Auto-edit',
    desc: 'Auto-accept file edits; prompt-gated tools are denied'
  },
  { id: 'default', label: 'Ask', desc: 'Deny anything needing approval — safest, may do nothing' }
]

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export const uid = (): string => Math.random().toString(36).slice(2, 10)

export function fmtClock(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hh} ${ap}` : `${hh}:${String(m).padStart(2, '0')} ${ap}`
}

export function describeSchedule(s: Schedule): string {
  if (s.freq === 'hourly') {
    return s.everyHours === 1 ? 'Every hour' : `Every ${s.everyHours} hours`
  }
  if (s.freq === 'daily') {
    return `Every day at ${fmtClock(s.time)}`
  }
  if (s.freq === 'weekdays') {
    return `Weekdays at ${fmtClock(s.time)}`
  }
  if (s.freq === 'weekly') {
    const days = (s.days || [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d])
      .join(', ')
    return `${days} at ${fmtClock(s.time)}`
  }
  return 'Custom'
}

export function scheduleTimesForDay(s: Schedule, date: Date): string[] {
  const dow = date.getDay()
  if (s.freq === 'hourly') {
    const out: string[] = []
    for (let h = 0; h < 24; h += s.everyHours || 6) {
      out.push(`${String(h).padStart(2, '0')}:00`)
    }
    return out
  }
  if (s.freq === 'daily') {
    return [s.time]
  }
  if (s.freq === 'weekdays') {
    return dow >= 1 && dow <= 5 ? [s.time] : []
  }
  if (s.freq === 'weekly') {
    return (s.days || []).includes(dow) ? [s.time] : []
  }
  return []
}

export function computeNextRun(s: Schedule, from?: Date): Date | null {
  const now = from || new Date()
  for (let i = 0; i < 14; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const times = scheduleTimesForDay(s, day)
    for (const t of times) {
      const [h, m] = t.split(':').map(Number)
      const cand = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
      if (cand > now) {
        return cand
      }
    }
  }
  return null
}

// ── natural language parsing ───────────────────────────────
const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6
}

export function parseNL(str: string): Schedule | null {
  const t = (str || '').toLowerCase().trim()
  if (!t) {
    return null
  }
  let time = '09:00'
  const tm = t.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (tm) {
    let h = parseInt(tm[1], 10)
    const m = tm[2] ? parseInt(tm[2], 10) : 0
    if (tm[3] === 'pm' && h < 12) {
      h += 12
    }
    if (tm[3] === 'am' && h === 12) {
      h = 0
    }
    if (h > 23 || m > 59) {
      return null
    }
    time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const hr = t.match(/every\s+(\d+)\s+hours?/)
  if (hr) {
    return {
      freq: 'hourly',
      everyHours: Math.max(1, Math.min(12, parseInt(hr[1], 10))),
      time: '00:00',
      days: []
    }
  }
  if (/every\s+hour|hourly/.test(t)) {
    return { freq: 'hourly', everyHours: 1, time: '00:00', days: [] }
  }
  const days: number[] = []
  for (const [name, idx] of Object.entries(DAY_MAP)) {
    if (new RegExp(`\\b${name}s?\\b`).test(t) && !days.includes(idx)) {
      days.push(idx)
    }
  }
  if (days.length) {
    return { freq: 'weekly', days: days.sort((a, b) => a - b), time, everyHours: 0 }
  }
  if (/weekday/.test(t)) {
    return { freq: 'weekdays', time, days: [], everyHours: 0 }
  }
  if (/every\s+day|daily|each\s+day|every\s+morning|every\s+night|every\s+evening/.test(t)) {
    let tt = time
    if (!tm && /morning/.test(t)) {
      tt = '09:00'
    }
    if (!tm && /night|evening/.test(t)) {
      tt = '21:00'
    }
    return { freq: 'daily', time: tt, days: [], everyHours: 0 }
  }
  if (tm) {
    return { freq: 'daily', time, days: [], everyHours: 0 }
  }
  return null
}

export function scheduleToNL(s: Schedule): string {
  if (s.freq === 'hourly') {
    return s.everyHours === 1 ? 'every hour' : `every ${s.everyHours} hours`
  }
  if (s.freq === 'daily') {
    return `every day at ${fmtClock(s.time).toLowerCase()}`
  }
  if (s.freq === 'weekdays') {
    return `every weekday at ${fmtClock(s.time).toLowerCase()}`
  }
  if (s.freq === 'weekly') {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    return `every ${(s.days || []).map((d) => names[d]).join(' and ')} at ${fmtClock(
      s.time
    ).toLowerCase()}`
  }
  return ''
}
