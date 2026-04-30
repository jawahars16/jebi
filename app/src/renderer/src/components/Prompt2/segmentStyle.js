// Prevents mouse events from bubbling out of segment buttons into xterm handlers.
export function stopSegmentEvents(e) {
  e.stopPropagation()
  e.preventDefault()
}

// Neon glass pill: translucent tinted background + left border accent.
// compact/rowHeight used only in xterm decoration mode.
export function neonGlassStyle({ tint, compact, rowHeight, onClick }) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    lineHeight: 1,
    padding: '5px 10px',
    background: `color-mix(in srgb, ${tint} 15%, transparent)`,
    color: tint,
    borderLeft: `4px solid ${tint}`,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-mono)',
    fontWeight: 500,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'background 0.15s ease, box-shadow 0.15s ease',
    userSelect: 'none',
  }
}

export function neonGlassHoverStyle(tint) {
  return {
    background: `color-mix(in srgb, ${tint} 20%, transparent)`,
    boxShadow: `-2px 0 6px color-mix(in srgb, ${tint} 25%, transparent)`,
  }
}
