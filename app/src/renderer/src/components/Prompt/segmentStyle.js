// Shared style builder for all segment pill buttons.
// Every segment shares the same base layout — callers spread the result and
// override only what differs (e.g. CwdSegment adds boxShadow for the accent bar).
export function pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick }) {
  const paddingH = bare ? 0 : (compact ? 7 : 10)
  const paddingV = compact ? 0 : 4
  return {
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
}

// Prevents mouse events from bubbling out of segment buttons into xterm handlers.
// Used as onMouseDown and onPointerDown on every segment pill.
export function stopSegmentEvents(e) {
  e.stopPropagation()
  e.preventDefault()
}
