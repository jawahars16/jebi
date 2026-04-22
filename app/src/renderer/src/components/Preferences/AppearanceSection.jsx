import { usePreferences } from '../../hooks/usePreferences'
import { FONT_OPTIONS } from '../../preferences/fonts'
import ThemeGrid from './ThemeGrid'
import CustomColorPickers from './CustomColorPickers'
import FontSizeControl from './FontSizeControl'
import PromptStyleGrid from './PromptStyleGrid'

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
  fontFamily: 'var(--font-ui)',
}

const selectStyle = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
  outline: 'none',
}

export default function AppearanceSection() {
  const { prefs, setFontFamily } = usePreferences()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      <div>
        <div style={sectionLabel}>Theme</div>
        <ThemeGrid />
      </div>

      {prefs.themeId === 'custom' && (
        <div>
          <div style={sectionLabel}>Custom Colors</div>
          <CustomColorPickers />
        </div>
      )}

      <div>
        <div style={sectionLabel}>Prompt Style</div>
        <PromptStyleGrid />
      </div>

      <div>
        <div style={sectionLabel}>Font</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ width: '60px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', flexShrink: 0 }}>
              Family
            </span>
            <select
              value={prefs.fontFamily}
              onChange={e => setFontFamily(e.target.value)}
              style={selectStyle}
            >
              {FONT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ width: '60px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', flexShrink: 0 }}>
              Size
            </span>
            <div style={{ flex: 1 }}>
              <FontSizeControl />
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
