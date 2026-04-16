export default function ThemeSwatch({ theme, isActive, onSelect }) {
  const { colors, name } = theme
  return (
    <button
      onClick={onSelect}
      style={{
        background: 'none',
        border: `2px solid ${isActive ? colors.accent : 'transparent'}`,
        borderRadius: '8px',
        padding: '3px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '4px',
        outline: 'none',
      }}
    >
      {/* Mini terminal preview */}
      <div style={{
        borderRadius: '5px',
        overflow: 'hidden',
        border: `1px solid ${colors.border}`,
      }}>
        <div style={{ background: colors.bgBase, padding: '8px 8px 4px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: colors.error }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: colors.textMuted }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: colors.accent }} />
          </div>
          <div style={{ background: colors.bgSurface, borderRadius: '3px', padding: '5px 6px' }}>
            <div style={{ height: 4, width: '70%', borderRadius: 2, background: colors.accent, marginBottom: 3 }} />
            <div style={{ height: 3, width: '90%', borderRadius: 2, background: colors.textPrimary, marginBottom: 2, opacity: 0.7 }} />
            <div style={{ height: 3, width: '55%', borderRadius: 2, background: colors.textMuted }} />
          </div>
        </div>
      </div>
      {/* Label */}
      <span style={{
        fontSize: '11px',
        color: isActive ? colors.accent : 'var(--text-secondary)',
        textAlign: 'center',
        fontWeight: isActive ? 600 : 400,
        fontFamily: 'var(--font-ui)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {name}
      </span>
    </button>
  )
}
