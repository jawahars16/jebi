// Minimal-style separator — a middle dot between bare, text-only segments.

export default function DotSeparator() {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'var(--text-muted)',
        padding: '0 4px',
        flexShrink: 0,
        fontWeight: 400,
      }}
    >
      ·
    </span>
  )
}
