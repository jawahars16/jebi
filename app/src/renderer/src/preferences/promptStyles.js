// Prompt style presets — control shape/edges/separator of the Prompt component.
// Colors always come from the active theme; these presets only affect geometry.
//
// Preset shape:
//   group.radius     — 0 | number | 'dynamic' | 'pill'
//     'dynamic' = rowHeight/3 (Wave), 'pill' = 9999px
//   group.connected  — true: single joined strip; false: independent segments with gap
//   group.rightCap   — 'round' | 'triangle' | 'slant' | 'square' | 'none'
//   separator        — 'wave' | 'triangle' | 'slash' | 'dot' | 'none'

export const PROMPT_STYLES = [
  {
    id: 'wave',
    name: 'Wave',
    group: { radius: 'dynamic', connected: true, rightCap: 'round' },
    separator: 'wave',
  },
  {
    id: 'powerline',
    name: 'Powerline',
    group: { radius: 0, connected: true, rightCap: 'triangle' },
    separator: 'triangle',
  },
  {
    id: 'pill',
    name: 'Pill',
    group: { radius: 'pill', connected: false, rightCap: 'round' },
    separator: 'none',
  },
  {
    id: 'slant',
    name: 'Slant',
    group: { radius: 0, connected: true, rightCap: 'slant' },
    separator: 'slash',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    group: { radius: 0, connected: false, rightCap: 'none' },
    separator: 'dot',
  },
]

export function getPromptStyle(id) {
  return PROMPT_STYLES.find(s => s.id === id) ?? PROMPT_STYLES[0]
}

// Module-level reactive store for the active prompt style.
// Needed because Prompt is rendered not only inside React's PreferencesProvider
// tree (InputBar) but also in xterm decorations that mount their own React
// roots via createRoot — those roots have no access to React context.
//
// Consumers:
//   - usePreferences.setPromptStyle → writes through here
//   - Prompt component → reads via usePromptStyleId (useSyncExternalStore)
let currentId = PROMPT_STYLES[0].id
const listeners = new Set()

export function getPromptStyleId() {
  return currentId
}

export function setPromptStyleId(id) {
  if (id === currentId) return
  currentId = id
  listeners.forEach(fn => fn())
}

export function subscribePromptStyle(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
