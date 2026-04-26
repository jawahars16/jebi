import { usePreferences } from '../../hooks/usePreferences'
import { ToggleRow } from './Toggle'

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
  fontFamily: 'var(--font-ui)',
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
