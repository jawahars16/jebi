import { useEffect, useRef } from 'react'

// Registers global keyboard shortcuts via a window keydown listener.
//
// handlers: an object mapping shortcut strings to callback functions.
// Shortcut format: modifier(s) joined by '+', then key name.
//   e.g. 'Meta+t', 'Meta+d', 'Meta+Shift+D', 'Meta+w'
//
// Modifiers recognised: Meta, Ctrl, Shift, Alt
// Key: the KeyboardEvent.key value (case-sensitive).
//
// Shortcuts fire even when xterm or a textarea has focus because
// they all require Meta (Cmd), which users never type into terminals.
//
// The listener is registered once (empty dep array). Callbacks are read from
// a ref so they are always fresh without re-registering the listener.

export function useKeyboardShortcuts(handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    function handleKeyDown(e) {
      for (const [shortcut, callback] of Object.entries(handlersRef.current)) {
        if (matchesShortcut(e, shortcut)) {
          e.preventDefault()
          callback()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

function matchesShortcut(e, shortcut) {
  const parts = shortcut.split('+')
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)

  if (e.key !== key) return false
  if (modifiers.includes('Meta') !== e.metaKey) return false
  if (modifiers.includes('Ctrl') !== e.ctrlKey) return false
  if (modifiers.includes('Shift') !== e.shiftKey) return false
  if (modifiers.includes('Alt') !== e.altKey) return false
  return true
}
