import { usePreferences } from '../../hooks/usePreferences'

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
  fontFamily: 'var(--font-ui)',
}

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? 'var(--accent)' : 'var(--border)',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export default function AISection() {
  const { prefs, setAiExplainErrors, setAiDirectoryContext } = usePreferences()

  return (
    <div>
      <div style={{ ...sectionLabel, marginBottom: 4 }}>Suggestions</div>
      <ToggleRow
        label="Explain command errors"
        description="Show an AI explanation banner when a command exits with an error."
        checked={prefs.aiExplainErrors}
        onChange={setAiExplainErrors}
      />
      <ToggleRow
        label="Directory context"
        description="Show an AI summary when switching into a new directory."
        checked={prefs.aiDirectoryContext}
        onChange={setAiDirectoryContext}
      />
    </div>
  )
}
