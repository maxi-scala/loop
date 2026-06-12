// renderer/src/Markdown.tsx — render Claude's Markdown output (summaries, assistant messages).
import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

// react-markdown does not render raw HTML by default, so this is XSS-safe without rehype-sanitize.
const REMARK_PLUGINS = [remarkGfm, remarkBreaks]

export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{text}</ReactMarkdown>
    </div>
  )
}
