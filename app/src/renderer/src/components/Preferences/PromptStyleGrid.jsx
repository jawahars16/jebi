import { PROMPT_STYLES } from '../../preferences/promptStyles'
import { usePreferences } from '../../hooks/usePreferences'
import PromptStyleSwatch from './PromptStyleSwatch'

export default function PromptStyleGrid() {
  const { prefs, setPromptStyle } = usePreferences()

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '10px',
      }}
    >
      {PROMPT_STYLES.map(preset => (
        <PromptStyleSwatch
          key={preset.id}
          preset={preset}
          isActive={prefs.promptStyleId === preset.id}
          onSelect={() => setPromptStyle(preset.id)}
        />
      ))}
    </div>
  )
}
