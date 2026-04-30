import { useState } from 'react'
import { SiNodedotjs } from 'react-icons/si'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function NodeSegment({ version, packageManager, onClick, rowHeight, iconSize, minimal }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-node-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick, minimal })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint, minimal) } : base

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            title={`Node ${version} · ${packageManager}`} style={style}>
      <SiNodedotjs size={(iconSize ?? 12) + 1} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '8ch' }}>{version}</span>
    </button>
  )
}
