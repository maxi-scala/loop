// core/claude-runner.ts — execute a routine by spawning the real `claude` CLI headless.
//
// Mirrors orca's approach of driving the Claude CLI as a child process, but uses the
// non-interactive `--print --output-format stream-json` mode so we can parse a clean
// NDJSON event stream into a transcript plus usage (cost / tokens / duration).
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Change, ModelId, PermissionMode, Run, TranscriptEntry } from '@shared/types'
import { expandHome } from './paths'
import { type StreamEvent, summarizeToolArg, deriveChange, sumTokens } from './claude-stream'

export type RunCallbacks = {
  /** Called whenever a new transcript entry is produced. */
  onTranscript?: (entry: TranscriptEntry, all: TranscriptEntry[]) => void
}

export type RunResult = {
  status: 'success' | 'failed'
  durationSec: number
  costUsd: number | null
  tokens: number | null
  summary: string
  changes: Change[]
  transcript: TranscriptEntry[]
}

/** Resolve the `claude` executable, since GUI/daemon processes have a sparse PATH. */
export function resolveClaudeCommand(): string {
  if (process.env.LOOP_CLAUDE_BIN && existsSync(process.env.LOOP_CLAUDE_BIN)) {
    return process.env.LOOP_CLAUDE_BIN
  }
  const candidates = [
    join(homedir(), '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(homedir(), '.claude', 'local', 'claude')
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      return c
    }
  }
  // Fall back to bare name and let PATH resolution try.
  return 'claude'
}

/** Build an augmented PATH so spawned `claude` can find node, git, gh, etc. */
function buildEnv(): NodeJS.ProcessEnv {
  const extra = [
    join(homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin'
  ]
  const current = process.env.PATH ? process.env.PATH.split(':') : []
  const merged = Array.from(new Set([...current, ...extra])).join(':')
  return { ...process.env, PATH: merged }
}

const MODEL_FLAG: Record<ModelId, string> = {
  sonnet: 'sonnet',
  opus: 'opus',
  haiku: 'haiku'
}

/**
 * CLI flags for a permission mode. Routines run unattended, so the default 'bypass'
 * skips prompts entirely; otherwise a tool needing approval would be denied (or stall)
 * because there is no TTY to answer on.
 */
export function permissionArgs(mode: PermissionMode): string[] {
  switch (mode) {
    case 'bypass':
      return ['--dangerously-skip-permissions']
    case 'acceptEdits':
      return ['--permission-mode', 'acceptEdits']
    case 'default':
      return ['--permission-mode', 'default']
  }
}

/**
 * Run a routine's prompt through the Claude CLI. Resolves when the process exits.
 * Streams transcript entries via callbacks as they arrive.
 */
export function runClaude(
  opts: {
    prompt: string
    dir: string
    model: ModelId
    permissionMode?: PermissionMode
    timeoutMs?: number
  },
  cb: RunCallbacks = {}
): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const cmd = resolveClaudeCommand()
    const cwd = expandHome(opts.dir)
    const transcript: TranscriptEntry[] = []
    const changes: Change[] = []
    const startedAt = Date.now()

    const push = (entry: TranscriptEntry): void => {
      transcript.push(entry)
      cb.onTranscript?.(entry, transcript)
    }

    push({ role: 'user', text: opts.prompt })

    if (!existsSync(cwd)) {
      push({ role: 'result', text: `Working directory not found: ${cwd}`, err: true })
      resolve({
        status: 'failed',
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        costUsd: null,
        tokens: null,
        summary: `Run failed — working directory not found: ${cwd}`,
        changes: [],
        transcript
      })
      return
    }

    const args = [
      '--print',
      opts.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      MODEL_FLAG[opts.model] || 'sonnet',
      ...permissionArgs(opts.permissionMode ?? 'bypass')
    ]

    let child
    try {
      child = spawn(cmd, args, { cwd, env: buildEnv() })
    } catch (e) {
      push({ role: 'result', text: `Failed to launch claude: ${String(e)}`, err: true })
      resolve({
        status: 'failed',
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        costUsd: null,
        tokens: null,
        summary: `Run failed — could not launch the claude CLI.`,
        changes: [],
        transcript
      })
      return
    }

    let buffer = ''
    let stderr = ''
    let finalSummary = ''
    let costUsd: number | null = null
    let tokens: number | null = null
    let isError = false
    let timedOut = false

    // Nothing ever writes to the child's stdin; close it so a CLI that tries to read
    // a prompt answer gets EOF immediately instead of blocking forever.
    child.stdin?.end()

    // Hard ceiling on a single run. Without this a hung CLI (e.g. one that stalls on a
    // permission prompt in a non-bypass mode) would only be cleaned up by the 2h stale
    // sweep. SIGTERM first, then SIGKILL if it ignores us.
    let timer: NodeJS.Timeout | null = null
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        push({
          role: 'result',
          text: `Run timed out after ${Math.round(opts.timeoutMs! / 60000)}m`,
          err: true
        })
        try {
          child.kill('SIGTERM')
        } catch {
          /* already gone */
        }
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            /* already gone */
          }
        }, 5000)
      }, opts.timeoutMs)
    }

    const handleEvent = (evt: StreamEvent): void => {
      if (evt.type === 'assistant' && evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            push({ role: 'assistant', text: block.text.trim() })
          } else if (block.type === 'tool_use' && typeof block.name === 'string') {
            const arg = summarizeToolArg(block.name, block.input)
            push({ role: 'tool', name: block.name, arg })
            const change = deriveChange(block.name, arg)
            if (change) {
              changes.push(change)
            }
          }
        }
      } else if (evt.type === 'user' && evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === 'tool_result') {
            const content = block.content
            let text = ''
            if (typeof content === 'string') {
              text = content
            } else if (Array.isArray(content)) {
              text = content
                .map((c: Record<string, unknown>) => (typeof c.text === 'string' ? c.text : ''))
                .join('')
            }
            text = text.replace(/\s+/g, ' ').trim().slice(0, 200)
            if (text) {
              push({ role: 'result', text, err: block.is_error === true })
            }
          }
        }
      } else if (evt.type === 'result') {
        if (typeof evt.result === 'string') {
          finalSummary = evt.result
        }
        if (typeof evt.total_cost_usd === 'number') {
          costUsd = +evt.total_cost_usd.toFixed(4)
        }
        const t = sumTokens(evt.usage)
        if (t != null) {
          tokens = t
        }
        if (evt.is_error) {
          isError = true
        }
      }
    }

    const processLine = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }
      try {
        handleEvent(JSON.parse(trimmed) as StreamEvent)
      } catch {
        /* ignore non-JSON noise */
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8')
      let idx
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        processLine(line)
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    const finish = (code: number | null): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (buffer.trim()) {
        processLine(buffer)
      }
      const durationSec = Math.round((Date.now() - startedAt) / 1000)
      const failed = timedOut || isError || (code !== 0 && code !== null)
      let summary = finalSummary.replace(/\s+/g, ' ').trim()
      if (timedOut && !summary) {
        summary = `Timed out after ${Math.round((opts.timeoutMs ?? 0) / 60000)} minutes.`
      }
      if (failed && !summary) {
        summary = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 240) || 'Run failed.'
        push({ role: 'result', text: summary || `claude exited with code ${code}`, err: true })
      }
      if (!summary) {
        summary = 'Completed — see transcript for details.'
      }
      resolve({
        status: failed ? 'failed' : 'success',
        durationSec,
        costUsd,
        tokens,
        summary: failed ? `Run failed — ${summary}` : summary,
        changes,
        transcript
      })
    }

    child.on('error', (err) => {
      push({ role: 'result', text: `Process error: ${err.message}`, err: true })
      finish(1)
    })
    child.on('close', (code) => finish(code))
  })
}

/** Build the in-progress Run record stored while a routine is executing. */
export function createRunningRun(
  routineId: string,
  prompt: string,
  dir: string,
  trigger: Run['trigger']
): Run {
  return {
    id: `run-${routineId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    routineId,
    start: new Date().toISOString(),
    durationSec: null,
    status: 'running',
    costUsd: null,
    tokens: null,
    summary: 'Run started…',
    changes: [],
    transcript: [
      { role: 'user', text: prompt },
      { role: 'result', text: `Session started in ${dir}` }
    ],
    trigger
  }
}
