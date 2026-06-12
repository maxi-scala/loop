// renderer/src/App.tsx — app shell: titlebar, sidebar nav, routing, editor sheet, tweaks.
import React from 'react'
import { useStore } from './store'
import { Icon } from './components'
import { computeNextRun } from '@shared/schedule'
import { relUntil } from '@shared/format'
import { MenuBar } from './MenuBar'
import { TweaksPanel } from './TweaksPanel'
import { RoutinesScreen } from './screens/Routines'
import { RoutineDetailScreen } from './screens/RoutineDetail'
import { CalendarScreen } from './screens/Calendar'
import { HistoryScreen } from './screens/History'
import { RunDetailScreen } from './screens/RunDetail'
import { SettingsScreen } from './screens/Settings'
import { Editor } from './screens/Editor'
import type { View, Nav } from './views'

const NAV_ITEMS: { id: View['screen']; label: string; icon: 'routines' | 'calendar' | 'history' | 'settings'; match: View['screen'][] }[] = [
  { id: 'routines', label: 'Routines', icon: 'routines', match: ['routines', 'routine'] },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', match: ['calendar'] },
  { id: 'history', label: 'History', icon: 'history', match: ['history', 'run'] },
  { id: 'settings', label: 'Settings', icon: 'settings', match: ['settings'] }
]

export default function App(): React.JSX.Element {
  const routines = useStore((s) => s.routines)
  const runs = useStore((s) => s.runs)
  const tweaks = useStore((s) => s.tweaks)
  const settings = useStore((s) => s.settings)

  const [view, setView] = React.useState<View>({ screen: 'routines' })
  const [editorRoutineId, setEditorRoutineId] = React.useState<string | null | undefined>(undefined)
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const nav: Nav = (v) => setView(v)
  const openEditor = (routineId?: string): void => setEditorRoutineId(routineId ?? null)
  const closeEditor = (): void => setEditorRoutineId(undefined)
  const editorOpen = editorRoutineId !== undefined

  const density =
    tweaks.density === 'compact'
      ? { '--pad-y': '7px', '--pad-card': '12px' }
      : { '--pad-y': '11px', '--pad-card': '16px' }
  const appVars = { '--accent': tweaks.accent, ...density } as React.CSSProperties

  const running = runs.filter((r) => r.status === 'running').length
  const nextAll = routines
    .filter((r) => r.enabled && !settings.pausedAll)
    .map((r) => computeNextRun(r.schedule, now))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const screenProps = { nav, now, openEditor }
  let screen: React.ReactNode
  switch (view.screen) {
    case 'routine':
      screen = <RoutineDetailScreen {...screenProps} routineId={view.routineId} />
      break
    case 'calendar':
      screen = <CalendarScreen {...screenProps} />
      break
    case 'history':
      screen = <HistoryScreen {...screenProps} />
      break
    case 'run':
      screen = <RunDetailScreen {...screenProps} runId={view.runId} from={view.from} />
      break
    case 'settings':
      screen = <SettingsScreen {...screenProps} />
      break
    default:
      screen = <RoutinesScreen {...screenProps} />
  }

  return (
    <div className="app-root" style={appVars}>
      <div className="sidebar">
        {/* Draggable strip that hosts the macOS traffic lights (top-left of window). */}
        <div className="sidebar-drag" />
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">
            <Icon name="spark" size={15} />
          </span>
          <div>
            <div className="sidebar-brand-name">Loop</div>
            <div className="sidebar-brand-sub mono">for Claude Code</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((n) => (
            <button
              key={n.id}
              type="button"
              className={'nav-item' + (n.match.includes(view.screen) ? ' active' : '')}
              onClick={() => setView({ screen: n.id } as View)}
            >
              <Icon name={n.icon} size={15} />
              {n.label}
              {n.id === 'history' && running > 0 ? (
                <span className="nav-badge mono">{running}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-foot mono">
          {settings.pausedAll ? (
            <span className="sf-line">all paused</span>
          ) : running > 0 ? (
            <span className="sf-line" style={{ color: 'var(--accent)' }}>
              {running} running
            </span>
          ) : (
            <span className="sf-line">idle</span>
          )}
          {nextAll && !settings.pausedAll ? (
            <span className="sf-line dim">next {relUntil(nextAll, now)}</span>
          ) : null}
        </div>
      </div>

      <div className="main-col">
        {/* Draggable top bar across the content area; hosts the quick-status pill. */}
        <div className="topbar">
          <MenuBar nav={nav} now={now} />
        </div>
        <div className="content">{screen}</div>
      </div>

      {editorOpen ? (
        <Editor
          routine={editorRoutineId ? routines.find((r) => r.id === editorRoutineId) ?? null : null}
          onClose={closeEditor}
        />
      ) : null}

      <TweaksPanel />
    </div>
  )
}
