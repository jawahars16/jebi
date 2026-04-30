import { useState } from 'react'
import { SiGo } from 'react-icons/si'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function GoSegment({ version, onClick, rowHeight, iconSize }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-go-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint) } : base
  const display = version?.startsWith('go') ? version.slice(2) : version

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            title={`Go ${display}`} style={style}>
      <SiGo size={(iconSize ?? 12) + 2} style={{ flexShrink: 0, color: tint }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '10ch' }}>{display}</span>
    </button>
  )
}
