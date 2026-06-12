// core/claude-runner.ts — execute a routine by spawning the real `claude` CLI headless.
//
// Mirrors orca's approach of driving the Claude CLI as a child process, but uses the
// non-interactive `--print --output-format stream-json` mode so we can parse a clean
// NDJSON event stream into a transcript plus usage (cost / tokens / duration).
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Change, ModelId, Run, TranscriptEntry } from '@shared/types'
import { expandHome } from './paths'

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

function summarizeToolArg(name: string, input: unknown): string {
  if (input == null) {
    return ''
  }
  const obj = input as Record<string, unknown>
  if (typeof obj.command === 'string') {
    return obj.command
  }
  if (typeof obj.file_path === 'string') {
    return obj.file_path
  }
  if (typeof obj.path === 'string') {
    return obj.path
  }
  if (typeof obj.pattern === 'string') {
    return obj.pattern
  }
  if (typeof obj.url === 'string') {
    return obj.url
  }
  try {
    const s = JSON.stringify(obj)
    return s.length > 120 ? `${s.slice(0, 117)}…` : s
  } catch {
    return String(name)
  }
}

/** Heuristically derive "changes" (files edited, commits, PRs) from tool usage. */
function deriveChange(name: string, arg: string): Change | null {
  const lower = name.toLowerCase()
  if (lower === 'edit' || lower === 'write' || lower === 'multiedit' || lower === 'notebookedit') {
    return { t: 'edit', x: arg }
  }
  if (lower === 'bash') {
    if (/gh\s+pr\s+create/.test(arg)) {
      return { t: 'pr', x: 'PR opened' }
    }
    if (/git\s+commit/.test(arg)) {
      return { t: 'commit', x: arg.replace(/^.*git\s+commit\s*/, 'commit ') }
    }
    if (/gh\s+issue\s+create/.test(arg)) {
      return { t: 'pr', x: 'Issue opened' }
    }
    if (/gh\s+issue\s+edit/.test(arg)) {
      return { t: 'label', x: arg }
    }
  }
  return null
}

type StreamEvent = {
  type?: string
  subtype?: string
  message?: { content?: Record<string, unknown>[] }
  result?: string
  total_cost_usd?: number
  duration_ms?: number
  is_error?: boolean
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

function sumTokens(usage: StreamEvent['usage']): number | null {
  if (!usage) {
    return null
  }
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  )
}

const MODEL_FLAG: Record<ModelId, string> = {
  sonnet: 'sonnet',
  opus: 'opus',
  haiku: 'haiku'
}

/**
 * Run a routine's prompt through the Claude CLI. Resolves when the process exits.
 * Streams transcript entries via callbacks as they arrive.
 */
export function runClaude(
  opts: { prompt: string; dir: string; model: ModelId },
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
      MODEL_FLAG[opts.model] || 'sonnet'
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
      if (buffer.trim()) {
        processLine(buffer)
      }
      const durationSec = Math.round((Date.now() - startedAt) / 1000)
      const failed = isError || (code !== 0 && code !== null)
      // Preserve the result's Markdown structure (newlines, lists) for the run-detail
      // view, which renders it as Markdown; only cap runs of blank lines. List previews
      // collapse it to one line via CSS (white-space: nowrap).
      let summary = finalSummary.replace(/\n{3,}/g, '\n\n').trim()
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
