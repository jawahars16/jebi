import { usePreferences } from '../../hooks/usePreferences'

const COLOR_GROUPS = [
  {
    label: 'Backgrounds',
    keys: [
      { key: 'bgBase',     label: 'Base' },
      { key: 'bgSurface',  label: 'Surface' },
      { key: 'bgElevated', label: 'Elevated' },
    ],
  },
  {
    label: 'Text',
    keys: [
      { key: 'textPrimary',   label: 'Primary' },
      { key: 'textSecondary', label: 'Secondary' },
      { key: 'textMuted',     label: 'Muted' },
    ],
  },
  {
    label: 'Accent',
    keys: [
      { key: 'accent',   label: 'Accent' },
      { key: 'onAccent', label: 'On Accent' },
    ],
  },
  {
    label: 'Status',
    keys: [
      { key: 'border', label: 'Border' },
      { key: 'error',  label: 'Error' },
    ],
  },
]

export default function CustomColorPickers() {
  const { activeColors, setCustomColor } = usePreferences()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {COLOR_GROUPS.map(group => (
        <div key={group.label}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '8px',
            fontFamily: 'var(--font-ui)',
          }}>
            {group.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.keys.map(({ key, label }) => (
              <ColorRow
                key={key}
                label={label}
                value={activeColors[key]}
                onChange={v => setCustomColor(key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }}>
      <label style={{
        width: '90px',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-ui)',
        flexShrink: 0,
      }}>
        {label}
      </label>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '28px',
            height: '28px',
            padding: '2px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg-elevated)',
            cursor: 'pointer',
          }}
        />
      </div>
      <span style={{
        fontSize: '12px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        {value}
      </span>
    </div>
  )
}
