import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CalendarScreen } from '@renderer/screens/Calendar'
import { useStore } from '@renderer/store'
import { MONTHS } from '@shared/schedule'
import type { Run, Routine } from '@shared/types'

const routine: Routine = {
  id: 'rt-1',
  name: 'Nightly audit',
  prompt: 'audit deps',
  dir: '~/work/app',
  model: 'sonnet',
  enabled: true,
  schedule: { freq: 'daily', time: '02:00', days: [], everyHours: 0 }
}

function makeRun(): Run {
  return {
    id: 'run-1',
    routineId: 'rt-1',
    start: new Date().toISOString(),
    durationSec: 90,
    status: 'success',
    costUsd: 0.5,
    tokens: 20000,
    summary: 'All good',
    changes: [],
    transcript: []
  }
}

beforeEach(() => {
  cleanup()
  useStore.setState({ routines: [routine], runs: [makeRun()] })
})

describe('CalendarScreen', () => {
  const now = new Date()

  it('renders the month title and a run dot for today', () => {
    render(<CalendarScreen nav={() => {}} now={now} openEditor={() => {}} />)
    expect(screen.getByText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`)).toBeTruthy()
    // selected day defaults to today, side panel lists the run
    expect(screen.getByText('Nightly audit')).toBeTruthy()
  })

  it('switches to week view without throwing', () => {
    render(<CalendarScreen nav={() => {}} now={now} openEditor={() => {}} />)
    fireEvent.click(screen.getByText('Week'))
    expect(screen.getByText(/Week of/)).toBeTruthy()
  })

  it('navigates to a run when a side-panel row is clicked', () => {
    let navigated: unknown = null
    render(<CalendarScreen nav={(v) => (navigated = v)} now={now} openEditor={() => {}} />)
    fireEvent.click(screen.getByText('Nightly audit'))
    expect(navigated).toMatchObject({ screen: 'run', runId: 'run-1' })
  })
})
