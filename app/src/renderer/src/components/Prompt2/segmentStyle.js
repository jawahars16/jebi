// Prevents mouse events from bubbling out of segment buttons into xterm handlers.
export function stopSegmentEvents(e) {
  e.stopPropagation()
  e.preventDefault()
}

// Neon glass pill: translucent tinted background + left border accent.
// compact/rowHeight used only in xterm decoration mode.
// minimal: strips background and border, showing only icon + colored text.
export function neonGlassStyle({ tint, compact, rowHeight, onClick, minimal }) {
  if (minimal) {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      lineHeight: 1,
      padding: '3px 6px',
      background: 'transparent',
      color: tint,
      border: 'none',
      flexShrink: 0,
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-mono)',
      fontWeight: 500,
      cursor: onClick ? 'pointer' : 'default',
      userSelect: 'none',
    }
  }
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

export function neonGlassHoverStyle(tint, minimal) {
  if (minimal) {
    return { opacity: 0.75 }
  }
  return {
    background: `color-mix(in srgb, ${tint} 20%, transparent)`,
    boxShadow: `-2px 0 6px color-mix(in srgb, ${tint} 25%, transparent)`,
  }
}
