import { usePreferences } from '../../hooks/usePreferences'

const MIN = 11
const MAX = 22

export default function FontSizeControl() {
  const { prefs, setFontSize } = usePreferences()

  function handleNumberChange(e) {
    const v = parseInt(e.target.value, 10)
    if (!isNaN(v)) setFontSize(v)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={prefs.fontSize}
        onChange={e => setFontSize(e.target.value)}
        style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <input
        type="number"
        min={MIN}
        max={MAX}
        value={prefs.fontSize}
        onChange={handleNumberChange}
        style={{
          width: '52px',
          padding: '4px 8px',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          fontFamily: 'var(--font-ui)',
          textAlign: 'center',
          outline: 'none',
        }}
      />
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', flexShrink: 0 }}>
        px
      </span>
    </div>
  )
}
