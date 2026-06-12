<h1 align="center">
  <img src="resources/icon-source/icon.png" alt="Loop" width="64" valign="middle" /> Loop
</h1>

<p align="center">
  <a href="https://github.com/maxi-scala/loop/stargazers"><img src="https://img.shields.io/github/stars/maxi-scala/loop?label=%E2%98%85" alt="GitHub stars" /></a>
  <a href="https://github.com/maxi-scala/loop/releases"><img src="https://img.shields.io/github/downloads/maxi-scala/loop/total?label=downloads" alt="Total downloads across all releases" /></a>
  <a href="https://github.com/maxi-scala/loop/releases/latest"><img src="https://img.shields.io/github/v/release/maxi-scala/loop?label=release" alt="Latest release" /></a>
  <img src="https://img.shields.io/github/license/maxi-scala/loop" alt="License" />
  <img src="https://img.shields.io/badge/macOS-4493F8?style=flat-square&logo=apple&logoColor=white" alt="Platform: macOS" />
</p>

<p align="center">
  <strong>Scheduled routines for Claude Code.</strong><br/>
  Give Claude Code a prompt and a schedule — triage issues every morning, audit dependencies nightly, draft a changelog every Friday — and watch every run on a calendar, in history, with full transcripts.
</p>

<h3 align="center"><a href="https://github.com/maxi-scala/loop/releases/latest"><ins>Download Loop</ins></a></h3>

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### 🔁 Routines

A prompt + schedule + working directory + model. Manage them as rows, cards, or a table; enable/pause with a toggle; run any one on demand.

</td>
<td width="50%" valign="top">

### 🗓 Flexible schedules

Natural language (`every weekday at 9am`, `every 6 hours`) that parses live, with a structured fallback — daily, weekdays, weekly, or hourly.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### ⚡ Real headless runs

Every run invokes the real `claude` CLI (`claude -p`) in the routine's directory and streams the live transcript — no mocks.

</td>
<td width="50%" valign="top">

### 📅 Calendar of runs

Month and week views with status dots per day and a day-by-day panel — see at a glance where every run landed.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📜 History &amp; transcripts

Runs grouped by day with status/routine filters. Each run shows the full transcript, the files / commits / PRs it changed, and its duration, cost, and tokens.

</td>
<td width="50%" valign="top">

### 🌙 Runs in the background

An optional macOS background agent fires your routines on schedule even when Loop is fully quit.

</td>
</tr>
</table>

**Also in the box:**

- **Menu-bar status** — a tray item (and in-window pill) showing what's running now, what's next up, recent runs, and a pause-all switch.
- **Tweaks** — switch the routines list between rows / cards / table, set density, and pick an accent color.
- **Native folder picker** — browse for a routine's working directory instead of typing the path.

---

## Requirements

The [**Claude Code CLI**](https://docs.claude.com/en/docs/claude-code) must be installed and authenticated — that's what your routines run.

## Install

### macOS

**[⬇ Download the latest `.dmg`](https://github.com/maxi-scala/loop/releases/latest)** — `-arm64` for Apple Silicon, `-x64` for Intel. Open it and drag **Loop** to Applications.

Builds are ad-hoc signed but not notarized, so on first launch Gatekeeper will block the app. Either **right-click Loop.app → Open**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/Loop.app
```

---

## Developing

```bash
npm install        # see the Electron-binary note in CLAUDE.md if this fails behind a proxy
npm run dev        # launch with hot reload
npm run test       # vitest
npm run typecheck  # tsc (the CI gate)
npm run dist:mac   # build a local .dmg
```

### Architecture

An Electron app (electron-vite + React 18 + TypeScript + zustand) with four entry points:

| Layer | What it does |
| --- | --- |
| **`src/shared`** | Pure types + the schedule / natural-language / formatting logic and seed data. |
| **`src/core`** | Node-only `Store` (atomic JSON persistence), `claude-runner` (real `claude -p` execution), and `Scheduler` (the tick loop). Shared by the app and the daemon. |
| **`src/main` · `src/preload`** | Electron main process (window, tray, IPC, background-agent install) and the typed `window.api` bridge. |
| **`src/renderer`** | React UI; state mirrors the main process over IPC. |
| **`src/daemon`** | Standalone scheduler launched by a macOS LaunchAgent so routines fire when the app is quit. |

State lives in a single JSON file at `~/Library/Application Support/loop/loop-data.json`. Deeper notes — including the cross-process scheduling model and environment gotchas — are in **[CLAUDE.md](./CLAUDE.md)**; packaging and release details are in **[BUILD.md](./BUILD.md)**.

### Releasing

Pushing a `vX.Y.Z` tag triggers GitHub Actions to build the macOS DMGs and attach them to a Release:

```bash
# bump "version" in package.json and package-lock.json (root) first
git tag v0.1.2 && git push origin v0.1.2
```

## License

Loop is free and open source under the [MIT License](LICENSE).
