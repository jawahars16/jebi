import { useState } from 'react'
import { SiKubernetes } from 'react-icons/si'
import { neonGlassStyle, neonGlassHoverStyle, stopSegmentEvents } from './segmentStyle'

export default function K8sSegment({ context, namespace, onClick, rowHeight, iconSize }) {
  const [hovered, setHovered] = useState(false)
  const compact = rowHeight != null
  const tint = 'var(--prompt-k8s-tint)'
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick })
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint) } : base
  const label = namespace && namespace !== 'default' ? `${context}:${namespace}` : context

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            title={`kubectl context: ${context} · namespace: ${namespace || 'default'}`} style={style}>
      <SiKubernetes size={(iconSize ?? 12) + 2} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '18ch' }}>{label}</span>
    </button>
  )
}
