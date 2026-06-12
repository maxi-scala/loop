import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

// The store actions are async (await IPC, then set state). Let those deferred
// updates settle inside act() so React doesn't warn about updates outside act.
const flush = (): Promise<void> => act(async () => { await Promise.resolve() })
import { useStore } from '@renderer/store'
import { TweaksPanel } from '@renderer/TweaksPanel'
import { MenuBar } from '@renderer/MenuBar'
import type { Routine } from '@shared/types'

// The store talks to the main process over window.api. In jsdom there is no preload,
// so stub the two endpoints the tweaks/menubar paths exercise (tweaks.set, settings.set).
beforeEach(() => {
  ;(globalThis as any).window.api = {
    tweaks: {
      set: async (p: any) => ({ accent: '#E8703F', layout: 'rows', density: 'comfortable', ...p })
    },
    settings: {
      set: async (p: any) => ({ daemonEnabled: false, pausedAll: false, ...p })
    }
  }
})

const routine: Routine = {
  id: 'r1',
  name: 'Nightly tidy',
  prompt: 'tidy up',
  dir: '~/proj',
  model: 'sonnet',
  enabled: true,
  schedule: { freq: 'daily', time: '09:00', days: [], everyHours: 0 }
}

describe('TweaksPanel', () => {
  it('opens and lets you pick a layout without throwing', async () => {
    useStore.setState({ routines: [routine], runs: [] })
    render(<TweaksPanel />)

    // Toggle the floating button to open the panel.
    fireEvent.click(screen.getByTitle('Tweaks'))

    // Click a layout segment option.
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }))

    // Accent swatch is also clickable.
    fireEvent.click(screen.getByRole('radio', { name: '#FF5300' }))
    await flush()
  })
})

describe('MenuBar', () => {
  it('opens the dropdown and toggles pause-all without throwing', async () => {
    useStore.setState({ routines: [routine], runs: [] })
    render(<MenuBar nav={() => {}} now={new Date()} />)

    // Open the quick-status dropdown.
    fireEvent.click(screen.getByTitle('Loop quick status'))
    expect(screen.getByText('Routines')).toBeTruthy()

    // Toggle the pause-all switch.
    const pause = screen.getByText(/pause all/i).closest('label') as HTMLElement
    fireEvent.click(within(pause).getByRole('switch'))
    await flush()
  })
})
