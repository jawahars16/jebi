import { THEMES, THEME_IDS } from '../../preferences/themes'
import { usePreferences } from '../../hooks/usePreferences'
import ThemeSwatch from './ThemeSwatch'

const CUSTOM_PREVIEW = {
  id: 'custom',
  name: 'Custom',
}

export default function ThemeGrid() {
  const { prefs, activeColors, setTheme } = usePreferences()

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '10px',
    }}>
      {THEME_IDS.map(id => (
        <ThemeSwatch
          key={id}
          theme={THEMES[id]}
          isActive={prefs.themeId === id}
          onSelect={() => setTheme(id)}
        />
      ))}

      {/* Custom pseudo-swatch */}
      <button
        onClick={() => setTheme('custom')}
        style={{
          background: 'none',
          border: `2px solid ${prefs.themeId === 'custom' ? activeColors.accent : 'transparent'}`,
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
        <div style={{
          borderRadius: '5px',
          overflow: 'hidden',
          border: `1px solid var(--border)`,
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '58px',
        }}>
          <span style={{ fontSize: '18px', opacity: 0.5 }}>✎</span>
        </div>
        <span style={{
          fontSize: '11px',
          color: prefs.themeId === 'custom' ? activeColors.accent : 'var(--text-secondary)',
          textAlign: 'center',
          fontWeight: prefs.themeId === 'custom' ? 600 : 400,
          fontFamily: 'var(--font-ui)',
        }}>
          Custom
        </span>
      </button>
    </div>
  )
}
