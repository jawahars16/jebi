import { useState } from 'react'
import { VscSourceControl } from 'react-icons/vsc'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function GitSegment({ branch, dirty, ahead, behind, onClick, rowHeight, iconSize }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-git-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint) } : base

  const title = `Branch: ${branch}${dirty ? ' (dirty)' : ''}${ahead ? ` ↑${ahead}` : ''}${behind ? ` ↓${behind}` : ''}`

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={style}
    >
      <VscSourceControl size={iconSize ?? 12} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '20ch' }}>
        {branch}
      </span>
      {dirty && <span style={{ color: '#f1c40f', flexShrink: 0, fontSize: '0.75em' }}>✦</span>}
      {ahead > 0 && <span style={{ color: '#e74c3c', flexShrink: 0, fontSize: '0.85em' }}>↑{ahead}</span>}
      {behind > 0 && <span style={{ color: '#2ecc71', flexShrink: 0, fontSize: '0.85em' }}>↓{behind}</span>}
    </button>
  )
}
