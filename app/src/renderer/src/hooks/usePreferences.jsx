import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { THEMES } from '../preferences/themes'
import { DEFAULT_PREFS } from '../preferences/defaults'
import { applyThemeToCSSVars } from '../preferences/cssVars'
import { setPromptStyleId } from '../preferences/promptStyles'
import { showStatusMessage } from './useStatusMessage'

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
  const isFirstRender = useRef(true)
  const saveTimerRef = useRef(null)

  const [prefs, setPrefs] = useState(() => {
    const loaded = loadPrefs()
    // Fall back to default if saved themeId no longer exists in the palette list.
    if (!THEMES[loaded.themeId]) loaded.themeId = DEFAULT_PREFS.themeId
    // Apply immediately so there's no flash of default colors on first paint.
    const colors = THEMES[loaded.themeId]?.colors ?? THEMES['navy'].colors
    applyThemeToCSSVars(colors, loaded.fontSize, loaded.fontFamily, loaded.uiFontSize, loaded.uiFontFamily)
    // Seed module-level stores so xterm-decoration React roots
    // (outside this provider) pick up the user's choices on first paint.
    setPromptStyleId('pill')
    return loaded
  })

  // Whenever prefs change: apply CSS vars + persist + mirror prompt style
  // to the module store for out-of-tree consumers.
  useEffect(() => {
    const colors = THEMES[prefs.themeId]?.colors ?? THEMES['navy'].colors
    applyThemeToCSSVars(colors, prefs.fontSize, prefs.fontFamily, prefs.uiFontSize, prefs.uiFontFamily)
    setPromptStyleId('pill')
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch {}

    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => showStatusMessage('Preferences saved'), 400)
  }, [prefs])

  const activeColors = useMemo(() =>
    THEMES[prefs.themeId]?.colors ?? THEMES['navy'].colors,
    [prefs.themeId]
  )

  function setTheme(id) {
    setPrefs(prev => ({ ...prev, themeId: id }))
  }

  function setFontFamily(value) {
    setPrefs(prev => ({ ...prev, fontFamily: value }))
  }

  function setFontSize(value) {
    const clamped = Math.min(22, Math.max(11, Math.round(Number(value))))
    setPrefs(prev => ({ ...prev, fontSize: clamped }))
  }

  function setUiFontSize(value) {
    const clamped = Math.min(18, Math.max(11, Math.round(Number(value))))
    setPrefs(prev => ({ ...prev, uiFontSize: clamped }))
  }

  function setUiFontFamily(value) {
    setPrefs(prev => ({ ...prev, uiFontFamily: value }))
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

  function setAiCommandSuggestions(value) {
    setPrefs(prev => ({ ...prev, aiCommandSuggestions: value }))
  }

  function setAiOutputAnalysis(value) {
    setPrefs(prev => ({ ...prev, aiOutputAnalysis: value }))
  }

  function setConfirmDestructiveCommands(value) {
    setPrefs(prev => ({ ...prev, confirmDestructiveCommands: value }))
  }

  function dismissRiskPattern(id) {
    setPrefs(prev => prev.dismissedRiskPatterns?.includes(id) ? prev : { ...prev, dismissedRiskPatterns: [...(prev.dismissedRiskPatterns ?? []), id] })
  }

  function resetDismissedRiskPatterns() {
    setPrefs(prev => ({ ...prev, dismissedRiskPatterns: [] }))
  }

  function setTerminalGrain(value) {
    setPrefs(prev => ({ ...prev, terminalGrain: value }))
  }

  function setTerminalGrainIntensity(value) {
    const clamped = Math.min(20, Math.max(1, Math.round(value)))
    setPrefs(prev => ({ ...prev, terminalGrainIntensity: clamped }))
  }

  function setTabBarPosition(value) {
    setPrefs(prev => ({ ...prev, tabBarPosition: value }))
  }

  const value = { prefs, activeColors, setTheme, setFontFamily, setFontSize, setUiFontSize, setUiFontFamily, setPromptStyle, setAiExplainErrors, setAiDirectoryContext, setAiCommandSuggestions, setAiOutputAnalysis, setConfirmDestructiveCommands, dismissRiskPattern, resetDismissedRiskPatterns, setTerminalGrain, setTerminalGrainIntensity, setTabBarPosition }

  
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
