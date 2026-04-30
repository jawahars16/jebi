import { useState } from 'react'
import { FaPython } from 'react-icons/fa'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function PythonSegment({ version, venv, onClick, rowHeight, iconSize, minimal }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-python-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick, minimal })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint, minimal) } : base
  const label = venv ? `${version} (${venv})` : version

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            title={`Python ${label}`} style={style}>
      <FaPython size={(iconSize ?? 12) + 1} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '12ch' }}>{label}</span>
    </button>
  )
}
