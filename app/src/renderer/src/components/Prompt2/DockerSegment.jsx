import { useState } from 'react'
import { FaDocker } from 'react-icons/fa'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function DockerSegment({ kind, onClick, rowHeight, iconSize }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-docker-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint) } : base
  const label = kind === 'compose' ? 'compose' : 'docker'

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            title={kind === 'compose' ? 'Docker Compose project' : 'Dockerfile present'} style={style}>
      <FaDocker size={(iconSize ?? 12) + 2} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '10ch' }}>{label}</span>
    </button>
  )
}
