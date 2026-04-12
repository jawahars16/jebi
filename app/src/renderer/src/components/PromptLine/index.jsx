import React from 'react'

function shortenPath(cwd) {
  const home = '/Users/' + (cwd.split('/')[2] || '')
  return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
}

function CwdSegment({ value }) {
  return (
    <span style={{ color: 'var(--text-muted)' }}>
      {shortenPath(value)}
    </span>
  )
}

// Map segment type → component. Add new entries here as segments are added.
const SEGMENT_COMPONENTS = {
  cwd: CwdSegment,
}

export default function PromptLine({ segments = [], exitCode = 0 }) {
  const hasError = exitCode > 0

  return (
    <div className="flex items-center gap-2 select-none font-[var(--font-mono)]"
      style={{ fontSize: 'var(--font-size-mono)' }}>
      {segments.map((seg) => {
        const Component = SEGMENT_COMPONENTS[seg.type]
        return Component && seg.value !== undefined
          ? <Component key={seg.type} value={seg.value} />
          : null
      })}
      <span style={{ color: hasError ? 'var(--error, #f85149)' : 'var(--accent)' }}>❯</span>
    </div>
  )
}
