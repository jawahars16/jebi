import { useRef } from 'react'

const HISTORY_KEY = 'term-history'
const MAX_HISTORY = 1000

// Module-level array — shared across all pane instances in the same JS context.
// Initialized once from localStorage on module load.
let sharedHistory = (() => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
})()

// BroadcastChannel syncs pushes across separate windows/tabs.
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('term-history')
  : null

if (channel) {
  channel.onmessage = (e) => {
    if (e.data?.type === 'push') sharedHistory = e.data.history
  }
}

function persistAndBroadcast(next) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  channel?.postMessage({ type: 'push', history: next })
}

// Shared push — all panes call this, history stays in sync automatically.
function push(command) {
  const trimmed = command.trim()
  if (!trimmed) return
  if (sharedHistory.length > 0 && sharedHistory[sharedHistory.length - 1] === trimmed) return
  const next = [...sharedHistory, trimmed].slice(-MAX_HISTORY)
  sharedHistory = next
  persistAndBroadcast(next)
}

function getAll() {
  return sharedHistory
}

// Per-pane hook — only navigation state (index, draft) is per-pane.
export function useSharedHistory() {
  const indexRef = useRef(-1)
  const draftRef = useRef('')

  function resetNavigation() {
    indexRef.current = -1
    draftRef.current = ''
  }

  // True while the user is mid-history-navigation. Used by the editor's
  // Up/Down keymap to keep stepping through history instead of falling back
  // to ghost-text cycling once the doc becomes non-empty after the first Up.
  function isNavigating() {
    return indexRef.current !== -1
  }

  function navigate(direction, currentValue) {
    const history = sharedHistory
    const index = indexRef.current

    if (direction === 'up') {
      if (history.length === 0) return null
      if (index === -1) {
        draftRef.current = currentValue
        indexRef.current = history.length - 1
      } else if (index > 0) {
        indexRef.current = index - 1
      }
      return history[indexRef.current]
    }

    if (direction === 'down') {
      if (index === -1) return null
      if (index < history.length - 1) {
        indexRef.current = index + 1
        return history[indexRef.current]
      }
      indexRef.current = -1
      return draftRef.current
    }

    return null
  }

  return { push, navigate, getAll, isNavigating, resetNavigation }
}
