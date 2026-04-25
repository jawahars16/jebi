export default function ExplanationPanel({ text, onDismiss }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 12px',
        background: 'color-mix(in srgb, var(--error) 8%, var(--bg-elevated))',
        borderTop: '1px solid color-mix(in srgb, var(--error) 20%, transparent)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'calc(var(--font-size-mono) * 0.88)',
        color: 'var(--text-primary)',
        lineHeight: 1.5,
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      <button
        onClick={onDismiss}
        onMouseDown={(e) => e.preventDefault()}
        style={{
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: '0.85em',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  )
}
