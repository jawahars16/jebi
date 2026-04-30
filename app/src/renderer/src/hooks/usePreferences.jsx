import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { THEMES } from '../preferences/themes'
import { DEFAULT_PREFS } from '../preferences/defaults'
import { applyThemeToCSSVars } from '../preferences/cssVars'
import { setPromptStyleId } from '../preferences/promptStyles'
import { setAllSegmentPrefs, SEGMENT_MAP } from '../preferences/segments'

const STORAGE_KEY = 'term-prefs'

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_PREFS
}

const PreferencesContext = createContext(null)

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(() => {
    const loaded = loadPrefs()
    // Apply immediately so there's no flash of default colors on first paint.
    const colors = loaded.themeId === 'custom'
      ? loaded.customColors
      : THEMES[loaded.themeId]?.colors ?? THEMES['default'].colors
    applyThemeToCSSVars(colors, loaded.fontSize, loaded.fontFamily)
    // Seed module-level stores so xterm-decoration React roots
    // (outside this provider) pick up the user's choices on first paint.
    setPromptStyleId(loaded.promptStyleId)
    if (loaded.promptSegments) setAllSegmentPrefs(loaded.promptSegments)
    return loaded
  })

  // Whenever prefs change: apply CSS vars + persist + mirror prompt style
  // to the module store for out-of-tree consumers.
  useEffect(() => {
    const colors = prefs.themeId === 'custom'
      ? prefs.customColors
      : THEMES[prefs.themeId]?.colors ?? THEMES['default'].colors
    applyThemeToCSSVars(colors, prefs.fontSize, prefs.fontFamily)
    setPromptStyleId(prefs.promptStyleId)
    if (prefs.promptSegments) setAllSegmentPrefs(prefs.promptSegments)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch {}
  }, [prefs])

  const activeColors = useMemo(() =>
    prefs.themeId === 'custom'
      ? prefs.customColors
      : THEMES[prefs.themeId]?.colors ?? THEMES['default'].colors,
    [prefs.themeId, prefs.customColors]
  )

  function setTheme(id) {
    setPrefs(prev => {
      if (id === 'custom') {
        // Seed custom slot from current named theme so user can fork it.
        const base = THEMES[prev.themeId]?.colors ?? prev.customColors
        return { ...prev, themeId: 'custom', customColors: { ...base } }
      }
      return { ...prev, themeId: id }
    })
  }

  function setCustomColor(key, value) {
    setPrefs(prev => ({
      ...prev,
      themeId: 'custom',
      customColors: { ...prev.customColors, [key]: value },
    }))
  }

  function setFontFamily(value) {
    setPrefs(prev => ({ ...prev, fontFamily: value }))
  }

  function setFontSize(value) {
    const clamped = Math.min(22, Math.max(11, Math.round(Number(value))))
    setPrefs(prev => ({ ...prev, fontSize: clamped }))
  }

  function setPromptStyle(id) {
    setPrefs(prev => ({ ...prev, promptStyleId: id }))
  }

  function setAiExplainErrors(value) {
    setPrefs(prev => ({ ...prev, aiExplainErrors: value }))
  }

  function setAiDirectoryContext(value) {
    setPrefs(prev => ({ ...prev, aiDirectoryContext: value }))
  }

  function setSegmentEnabled(id, enabled) {
    const def = SEGMENT_MAP[id]
    if (def?.required) return
    setPrefs(prev => ({
      ...prev,
      promptSegments: { ...prev.promptSegments, [id]: enabled },
    }))
  }

  const value = { prefs, activeColors, setTheme, setCustomColor, setFontFamily, setFontSize, setPromptStyle, setAiExplainErrors, setAiDirectoryContext, setSegmentEnabled }

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider')
  return ctx
}
