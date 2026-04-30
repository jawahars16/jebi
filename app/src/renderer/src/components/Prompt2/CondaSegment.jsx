import { useState } from 'react'
import { SiAnaconda } from 'react-icons/si'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function CondaSegment({ env, onClick, rowHeight, iconSize }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-conda-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint) } : base

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            title={`Conda: ${env}`} style={style}>
      <SiAnaconda size={(iconSize ?? 12) + 1} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '12ch' }}>{env}</span>
    </button>
  )
}
