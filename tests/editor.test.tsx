import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Editor } from '@renderer/screens/Editor'

// Minimal stub of the preload `window.api` surface used by the store.
function stubApi(): void {
  ;(globalThis as any).window.api = {
    routines: {
      list: async () => [],
      create: async (i: any) => ({ id: 'rt-x', enabled: true, ...i }),
      update: async (r: any) => r
    },
    runs: { list: async () => [] },
    tweaks: { get: async () => ({ accent: '#E8703F', layout: 'rows', density: 'comfortable' }) },
    settings: { get: async () => ({ daemonEnabled: false, pausedAll: false }) },
    daemon: { status: async () => ({ installed: false, loaded: false }) },
    onDataChanged: () => () => {}
  }
}

beforeEach(() => {
  cleanup()
  stubApi()
})

describe('Editor', () => {
  it('renders the New routine title and name input', () => {
    render(<Editor routine={null} onClose={() => {}} />)
    expect(screen.getByText('New routine')).toBeTruthy()
    expect(screen.getByPlaceholderText('Morning issue triage')).toBeTruthy()
  })

  it('accepts a name and a natural-language schedule without erroring', () => {
    render(<Editor routine={null} onClose={() => {}} />)

    const nameInput = screen.getByPlaceholderText('Morning issue triage') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Morning triage' } })
    expect(nameInput.value).toBe('Morning triage')

    const nlInput = screen.getByPlaceholderText(
      'try "every weekday at 9am" or "every 6 hours"'
    ) as HTMLInputElement
    fireEvent.change(nlInput, { target: { value: 'every weekday at 9am' } })
    expect(nlInput.value).toBe('every weekday at 9am')

    // Parsed successfully → the describe hint reflects the weekday schedule.
    expect(screen.getByText(/Weekdays at 9 AM/)).toBeTruthy()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<Editor routine={null} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Editor routine={null} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
