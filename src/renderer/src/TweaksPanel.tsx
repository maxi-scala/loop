// renderer/src/TweaksPanel.tsx — floating Tweaks toggle + panel (worker unit 6).
// Ported from project/app/tweaks-panel.jsx + main.jsx (TweaksPanel / TweakRadio / TweakColor).
// Controls: Layout (rows/cards/table), Density (compact/comfortable), Accent color swatches.
// All wired to store.setTweak(key, value) and reflect store.tweaks. App.tsx applies
// tweaks.accent/density as CSS vars and uses tweaks.layout — this panel only sets them.
import React from 'react'
import { useStore } from './store'
import { Icon, Seg } from './components'

const ACCENTS = ['#E8703F', '#FF5300', '#D4A0FF', '#8FBE5F']

const LAYOUT_OPTIONS = [
  { value: 'rows', label: 'Rows' },
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' }
]

const DENSITY_OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' }
]

function TweakSection({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="panel-label mono" style={{ marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

export function TweaksPanel(): React.JSX.Element {
  const tweaks = useStore((s) => s.tweaks)
  const setTweak = useStore((s) => s.setTweak)
  const [open, setOpen] = React.useState(false)

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 150 }}>
      {open ? (
        <div className="panel" style={{ width: 240, marginBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14
            }}
          >
            <span className="panel-label mono" style={{ marginBottom: 0 }}>
              tweaks
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Close tweaks"
              onClick={() => setOpen(false)}
            >
              <Icon name="x" size={13} />
            </button>
          </div>

          <TweakSection label="Layout">
            <Seg
              options={LAYOUT_OPTIONS}
              value={tweaks.layout}
              onChange={(v) => void setTweak('layout', v as typeof tweaks.layout)}
            />
          </TweakSection>

          <TweakSection label="Density">
            <Seg
              options={DENSITY_OPTIONS}
              value={tweaks.density}
              onChange={(v) => void setTweak('density', v as typeof tweaks.density)}
            />
          </TweakSection>

          <TweakSection label="Accent">
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCENTS.map((c) => {
                const on = tweaks.accent.toLowerCase() === c.toLowerCase()
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c}
                    title={c}
                    onClick={() => void setTweak('accent', c)}
                    style={{
                      flex: 1,
                      height: 28,
                      borderRadius: 7,
                      background: c,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: on
                        ? '0 0 0 2px var(--bg-sidebar), 0 0 0 4px var(--text)'
                        : '0 0 0 1px rgba(0,0,0,0.25)'
                    }}
                  />
                )
              })}
            </div>
          </TweakSection>
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((v) => !v)}
        title="Tweaks"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="spark" size={13} />
        Tweaks
      </button>
    </div>
  )
}
