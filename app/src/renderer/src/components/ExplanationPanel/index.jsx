function renderWithCode(text) {
  const re = /`+([^`]+)`+/g
  if (!re.test(text)) return text
  re.lastIndex = 0
  const nodes = []
  let key = 0
  const raw = text
  let last = 0
  let m
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) nodes.push(raw.slice(last, m.index))
    nodes.push(
      <code key={key++} style={{
        background: 'color-mix(in srgb, var(--tab-accent) 30%, transparent)',
        color: '#ffffff',
        fontWeight: 600,
        borderRadius: 3,
        padding: '1px 5px',
        fontFamily: 'var(--font-mono)',
      }}>{m[1]}</code>
    )
    last = m.index + m[0].length
  }
  if (last < raw.length) nodes.push(raw.slice(last))
  return nodes
}

export default function ExplanationPanel({ text, onDismiss }) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 12px',
        background: 'color-mix(in srgb, var(--tab-accent) 6%, color-mix(in srgb, var(--error) 6%, var(--bg-elevated)))',
        borderTop: '1px solid color-mix(in srgb, var(--tab-accent) 25%, color-mix(in srgb, var(--error) 15%, transparent))',
        fontFamily: 'var(--font-mono)',
        fontSize: 'calc(var(--font-size-mono) * 0.88)',
        color: '#ffffff',
        lineHeight: 1.5,
      }}
    >
      <span style={{ flex: 1 }}>{renderWithCode(text)}</span>
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
