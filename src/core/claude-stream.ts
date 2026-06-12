// core/claude-stream.ts — pure helpers for parsing the `claude` NDJSON event stream.
// Split out of claude-runner.ts to keep that file under the max-lines budget; no I/O here.
import type { Change } from '@shared/types'

export type StreamEvent = {
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

export function summarizeToolArg(name: string, input: unknown): string {
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
export function deriveChange(name: string, arg: string): Change | null {
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

export function sumTokens(usage: StreamEvent['usage']): number | null {
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
