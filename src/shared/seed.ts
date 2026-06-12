// shared/seed.ts — first-run seed data. Routines ported from project/app/data.js.
// Runs are intentionally empty: real runs are produced by executing Claude Code.
import type { AppData, Routine, Tweaks, Settings } from './types'

export const seedRoutines: Routine[] = [
  {
    id: 'rt-triage',
    name: 'Morning issue triage',
    model: 'sonnet',
    enabled: false,
    dir: '~',
    schedule: { freq: 'weekdays', time: '09:00', days: [], everyHours: 0 },
    prompt:
      'Review all GitHub issues opened in the last 24 hours. Label each one (bug, feature, question), flag anything that looks like a regression in the latest release, and write a one-line summary per issue in triage-notes.md.'
  },
  {
    id: 'rt-deps',
    name: 'Nightly dependency audit',
    model: 'sonnet',
    enabled: false,
    dir: '~',
    schedule: { freq: 'daily', time: '02:00', days: [], everyHours: 0 },
    prompt:
      'Run npm audit and check for outdated dependencies. For patch and minor updates with passing tests, open a single PR with the bumps. Flag any major updates or advisories that need a human decision.'
  },
  {
    id: 'rt-changelog',
    name: 'Changelog draft',
    model: 'opus',
    enabled: false,
    dir: '~',
    schedule: { freq: 'weekly', time: '16:00', days: [5], everyHours: 0 },
    prompt:
      'Read every commit merged to main since the last changelog entry. Draft a user-facing changelog grouped by Added / Changed / Fixed, written in plain language, and save it to CHANGELOG-draft.md.'
  },
  {
    id: 'rt-flaky',
    name: 'Flaky test hunter',
    model: 'haiku',
    enabled: false,
    dir: '~',
    schedule: { freq: 'hourly', everyHours: 6, time: '00:00', days: [] },
    prompt:
      'Pull the latest CI results. Identify tests that failed and then passed on retry. Keep a running tally in flaky-tests.json and open an issue for any test that flaked 3+ times this week.'
  },
  {
    id: 'rt-docs',
    name: 'Docs link checker',
    model: 'haiku',
    enabled: false,
    dir: '~',
    schedule: { freq: 'weekly', time: '07:00', days: [1], everyHours: 0 },
    prompt:
      'Crawl all markdown files in /docs and verify every external link resolves. Replace moved pages with their new URLs where redirects make the target obvious; list dead links in a report.'
  }
]

export const defaultTweaks: Tweaks = {
  accent: '#E8703F',
  layout: 'rows',
  density: 'comfortable'
}

export const defaultSettings: Settings = {
  daemonEnabled: false,
  pausedAll: false,
  defaultPermissionMode: 'bypass',
  defaultMissedRunGraceMinutes: 720,
  runTimeoutMinutes: 60
}

export const APP_DATA_VERSION = 1

export function defaultAppData(): AppData {
  return {
    version: APP_DATA_VERSION,
    routines: seedRoutines.map((r) => ({ ...r })),
    runs: [],
    tweaks: { ...defaultTweaks },
    settings: { ...defaultSettings }
  }
}
