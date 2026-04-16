const COLOR_TO_VAR = {
  bgBase:        '--bg-base',
  bgSurface:     '--bg-surface',
  bgElevated:    '--bg-elevated',
  border:        '--border',
  textPrimary:   '--text-primary',
  textSecondary: '--text-secondary',
  textMuted:     '--text-muted',
  accent:        '--accent',
  onAccent:      '--on-accent',
  error:         '--error',
}

// Converts a 6-digit hex color to rgba(r, g, b, alpha).
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Applies a full preferences state to CSS custom properties on :root.
// Inline setProperty overrides the stylesheet-defined :root values with no
// specificity hacks required.
export function applyThemeToCSSVars(colors, fontSize, fontFamily) {
  const el = document.documentElement
  for (const [key, varName] of Object.entries(COLOR_TO_VAR)) {
    if (colors[key]) el.style.setProperty(varName, colors[key])
  }
  // --accent-glow is always derived from accent — never stored as an independent value.
  if (colors.accent) {
    el.style.setProperty('--accent-glow', hexToRgba(colors.accent, 0.15))
  }
  if (fontSize) {
    el.style.setProperty('--font-size-mono', `${fontSize}px`)
  }
  if (fontFamily) {
    el.style.setProperty('--font-mono', fontFamily)
  }
}
