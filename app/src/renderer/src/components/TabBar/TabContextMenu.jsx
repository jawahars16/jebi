// Right-click context menu for tab pills.
// Handles close variants, splits, and per-tab accent color selection.

import { useEffect, useRef } from 'react'

// Curated palette for per-tab accent colors — chosen to read well on dark themes.
export const TAB_ACCENT_PALETTE = [
  '#ec4899', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#94a3b8',
]

export function TabContextMenu({
  x,
  y,
  tabIndex,
  totalTabs,
  currentAccent,
  onClose,
  onCloseTab,
  onCloseToRight,
  onCloseOthers,
  onCloseAll,
  onSplitRight,
  onSplitDown,
  onPickAccent,
  onResetAccent,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  // Clamp position to viewport so the menu never spills off-screen.
  const MENU_WIDTH = 220
  const MENU_HEIGHT = 280
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8)
  const top  = Math.min(y, window.innerHeight - MENU_HEIGHT - 8)

  // Wraps an action to close the menu after firing.
  const fire = (fn) => () => { fn?.(); onClose() }

  const canClose       = totalTabs > 1
  const canCloseToRight = tabIndex < totalTabs - 1
  const canCloseOthers  = totalTabs > 1

  return (
    <div
      ref={ref}
      className="[-webkit-app-region:no-drag]"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        minWidth: MENU_WIDTH,
        padding: '6px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--font-size-ui)',
      }}
    >
      <MenuItem onClick={fire(onCloseTab)}    disabled={!canClose}>Close</MenuItem>
      <MenuItem onClick={fire(onCloseToRight)} disabled={!canCloseToRight}>Close to Right</MenuItem>
      <MenuItem onClick={fire(onCloseOthers)} disabled={!canCloseOthers}>Close Others</MenuItem>
      <MenuItem onClick={fire(onCloseAll)}>Close All</MenuItem>

      <MenuSeparator />

      <MenuItem onClick={fire(onSplitRight)} shortcut="⌘D">Split Right</MenuItem>
      <MenuItem onClick={fire(onSplitDown)}  shortcut="⌘⇧D">Split Down</MenuItem>

      <MenuSeparator />

      <div style={{
        padding: '4px 8px 2px',
        color: 'var(--text-muted)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Accent
      </div>
      <div className="flex items-center gap-1.5" style={{ padding: '6px 8px 4px' }}>
        {TAB_ACCENT_PALETTE.map(color => {
          const selected = currentAccent != null && currentAccent.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              title={color}
              onClick={fire(() => onPickAccent?.(color))}
              className="rounded-full"
              style={{
                width: 18,
                height: 18,
                backgroundColor: color,
                border: selected ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                boxShadow: selected ? `0 0 0 2px ${color}55` : undefined,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          )
        })}
      </div>
      <MenuItem onClick={fire(onResetAccent)}>Reset Accent</MenuItem>
    </div>
  )
}

export function MenuItem({ children, onClick, disabled, shortcut }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between rounded text-left transition-colors"
      style={{
        padding: '6px 8px',
        background: 'transparent',
        border: 'none',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--font-size-ui)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--bg-base)' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span>{children}</span>
      {shortcut && (
        <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 12 }}>{shortcut}</span>
      )}
    </button>
  )
}

export function MenuSeparator() {
  return <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />
}
