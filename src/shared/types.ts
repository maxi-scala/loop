// shared/types.ts — core data model for loop, shared across main, daemon, preload, renderer.
// Pure types only — no node/electron imports.

export type ModelId = 'sonnet' | 'opus' | 'haiku'

/**
 * How the headless `claude` run treats tool-permission prompts. Routines are
 * unattended, so there is no one to answer a prompt — the mode is fixed at launch.
 *  - 'bypass'      → --dangerously-skip-permissions (full auto; the default)
 *  - 'acceptEdits' → --permission-mode acceptEdits (auto-accept file edits only)
 *  - 'default'     → --permission-mode default (anything needing approval is denied;
 *                    safest, but a routine that edits/commits may do nothing)
 */
export type PermissionMode = 'bypass' | 'acceptEdits' | 'default'

export type ScheduleFreq = 'daily' | 'weekdays' | 'weekly' | 'hourly'

/** Day-of-week index, 0 = Sunday … 6 = Saturday (matches Date.getDay()). */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Schedule = {
  freq: ScheduleFreq
  /** "HH:MM" 24h. Ignored for hourly. */
  time: string
  /** Days of week for weekly freq. */
  days: number[]
  /** Interval in hours for hourly freq. */
  everyHours: number
}

export type Routine = {
  id: string
  name: string
  prompt: string
  /** Working directory; may contain a leading ~. */
  dir: string
  model: ModelId
  enabled: boolean
  schedule: Schedule
  /** Per-routine permission mode. Undefined → inherit Settings.defaultPermissionMode. */
  permissionMode?: PermissionMode
  /**
   * How late (minutes) a missed scheduled occurrence may still fire after the machine
   * comes back online. Undefined → inherit Settings.defaultMissedRunGraceMinutes.
   */
  missedRunGraceMinutes?: number
}

export type RunStatus = 'running' | 'success' | 'failed' | 'skipped'

export type ChangeType = 'edit' | 'commit' | 'pr' | 'label'

export type Change = {
  t: ChangeType
  x: string
}

export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'result'

export type TranscriptEntry = {
  role: TranscriptRole
  text?: string
  /** For tool entries: the tool name (e.g. "Bash"). */
  name?: string
  /** For tool entries: the tool argument summary. */
  arg?: string
  /** For result entries: marks an error result. */
  err?: boolean
}

export type Run = {
  id: string
  routineId: string
  /** ISO timestamp. */
  start: string
  /** null while running. */
  durationSec: number | null
  status: RunStatus
  costUsd: number | null
  tokens: number | null
  summary: string
  changes: Change[]
  transcript: TranscriptEntry[]
  /** Whether this run was triggered manually ("Run now") vs. on schedule. */
  trigger?: 'manual' | 'scheduled'
  /** For scheduled runs: ISO timestamp of the schedule occurrence this run satisfies (dedup key). */
  scheduledFor?: string
}

export type LayoutVariant = 'rows' | 'cards' | 'table'
export type Density = 'compact' | 'comfortable'

export type Tweaks = {
  accent: string
  layout: LayoutVariant
  density: Density
}

export type Settings = {
  /** Whether routines should run in the background via the launchd daemon. */
  daemonEnabled: boolean
  /** Global pause — disables all scheduling without touching per-routine enabled flags. */
  pausedAll: boolean
  /** Default permission mode for routines that don't override it. */
  defaultPermissionMode: PermissionMode
  /**
   * Default missed-run grace (minutes) for routines that don't override it. A scheduled
   * occurrence missed while the machine was offline still fires on wake if it is no more
   * than this many minutes stale; otherwise it is recorded as a skipped run.
   */
  defaultMissedRunGraceMinutes: number
  /** Kill a single run after this many minutes (0 = no timeout). Guards against a hung CLI. */
  runTimeoutMinutes: number
}

/** Lifecycle of the in-app (assisted) updater, tracked at runtime — not persisted. */
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

/** Result of a check against the GitHub Releases feed. */
export type UpdateInfo = {
  currentVersion: string
  latestVersion: string | null
  available: boolean
  /** Release page — used for the "view release notes" fallback. */
  releaseUrl: string | null
  /** Arch-matched .dmg download URL. */
  assetUrl: string | null
  assetName: string | null
  /** Release body / notes (optional, shown in Settings). */
  notes: string | null
  /** ISO timestamp of the check. */
  checkedAt: string
}

/** Current updater state pushed to the renderer over IPC. */
export type UpdateStatus = {
  phase: UpdatePhase
  info: UpdateInfo | null
  /** Download progress 0–100 while phase is 'downloading'. */
  percent?: number
  error?: string
}

/** The full persisted application state (one JSON file). */
export type AppData = {
  version: number
  routines: Routine[]
  runs: Run[]
  tweaks: Tweaks
  settings: Settings
}

export type ModelMeta = {
  id: ModelId
  label: string
  desc: string
}
