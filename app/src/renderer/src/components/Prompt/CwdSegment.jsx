import { FaFolderOpen } from 'react-icons/fa'

// CwdSegment — current working directory pill.
// Also renders a compact ✕N error badge when the previous command failed.
// onClick: usually opens the directory in Finder/Nautilus.
export default function CwdSegment({ cwd, exitCode = 0, rowHeight, iconSize, onClick, segmentRadius, bare }) {
  const compact = rowHeight != null
  const paddingH = bare ? 0 : (compact ? 7 : 10)
  const paddingV = compact ? 0 : 4
  const hasError = exitCode > 0

  const bg = bare ? 'transparent' : 'var(--accent)'
  const fg = bare ? 'var(--accent)' : 'var(--on-accent)'

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    height: compact ? `${rowHeight}px` : undefined,
    minHeight: compact ? `${rowHeight}px` : undefined,
    padding: `${paddingV}px ${paddingH}px`,
    backgroundColor: bg,
    color: fg,
    lineHeight: 1,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-mono)',
    fontWeight: 500,
    border: 'none',
    borderRadius: segmentRadius != null ? `${segmentRadius}px` : 0,
    cursor: onClick ? 'pointer' : 'default',
  }

  const stopEvents = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <button
      onClick={onClick}
      onMouseDown={stopEvents}
      onPointerDown={stopEvents}
      title={cwd}
      style={style}
    >
      <FaFolderOpen size={iconSize} color={fg} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '40vw',
        }}
      >
        {shortenPath(cwd)}
      </span>
      {hasError && (
        <span
          style={{
            background: 'rgba(0,0,0,0.3)',
            color: '#fca5a5',
            fontWeight: 700,
            fontSize: '10px',
            borderRadius: '3px',
            padding: '0 3px',
          }}
        >
          ✕{exitCode}
        </span>
      )}
    </button>
  )
}

function shortenPath(p) {
  if (!p) return ''
  const parts = p.split('/')
  if (p.startsWith('/Users/') && parts.length >= 3) {
    return '~/' + parts.slice(3).join('/')
  }
  return p
}
