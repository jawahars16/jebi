import { useRef, useEffect } from 'react'

const HISTORY_KEY = 'term-history'
const MAX_HISTORY = 1000

// Tracks the most recently pushed command per session (sid key).
// Declared before sharedHistory so the load IIFE can populate it.
const lastCommandPerSession = new Map()

// Each entry: { c: command, ok: bool, sid?: string }
// sid is the paneId that produced the command; absent on legacy entries.
// Migrates legacy plain-string entries on load and seeds the dedup map.
let sharedHistory = (() => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored).map((e) =>
      typeof e === 'string' ? { c: e, ok: true } : e
    )
    // Seed dedup map so the first push after reload doesn't duplicate the
    // last stored command for each session.
    for (const e of parsed) {
      if (e.sid) lastCommandPerSession.set(e.sid, e.c)
    }
    return parsed
  } catch {
    return []
  }
})()

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

// Push every completed command regardless of exit code.
// Deduplicates back-to-back identical commands within the same session.
function push(command, exitCode, sid) {
  const trimmed = command.trim()
  if (!trimmed) return
  const ok = exitCode === 0
  const key = sid ?? ''
  if (lastCommandPerSession.get(key) === trimmed) return
  lastCommandPerSession.set(key, trimmed)
  const entry = sid ? { c: trimmed, ok, sid } : { c: trimmed, ok }
  const next = [...sharedHistory, entry].slice(-MAX_HISTORY)
  sharedHistory = next
  persistAndBroadcast(next)
}

function getAll() {
  return sharedHistory
}

export function useSharedHistory(paneId) {
  if (process.env.NODE_ENV !== 'production' && !paneId) {
    console.warn('useSharedHistory called without paneId — history entries will have no session scope')
  }

  const indexRef = useRef(-1)
  const draftRef = useRef('')
  const prefixRef = useRef('')
  // Cached session-filtered view; invalidated when sharedHistory changes.
  const sessionCacheRef = useRef({ source: null, filtered: [] })

  function sessionHistory() {
    if (sessionCacheRef.current.source === sharedHistory) {
      return sessionCacheRef.current.filtered
    }
    // Only this session's entries — legacy entries without sid are intentionally
    // excluded to avoid duplicates after reload (they remain visible in getAll).
    const filtered = sharedHistory.filter((e) => e.sid === paneId)
    sessionCacheRef.current = { source: sharedHistory, filtered }
    return filtered
  }

  useEffect(() => {
    return () => lastCommandPerSession.delete(paneId)
  }, [paneId])

  function resetNavigation() {
    indexRef.current = -1
    draftRef.current = ''
    prefixRef.current = ''
  }

  function isNavigating() {
    return indexRef.current !== -1
  }

  function navigate(direction, currentValue) {
    const history = sessionHistory()
    const index = indexRef.current

    if (direction === 'up') {
      if (history.length === 0) return null
      // If in navigation mode but user manually edited the input, start fresh.
      if (index !== -1 && currentValue !== (history[index]?.c ?? '')) {
        indexRef.current = -1
      }
      if (indexRef.current === -1) {
        draftRef.current = currentValue
        prefixRef.current = currentValue.trim()
      }
      const prefix = prefixRef.current
      const start = indexRef.current === -1 ? history.length - 1 : indexRef.current - 1
      if (prefix) {
        for (let i = start; i >= 0; i--) {
          if (history[i].c.startsWith(prefix)) {
            indexRef.current = i
            return history[i].c
          }
        }
        return null
      }
      if (indexRef.current === -1) indexRef.current = history.length - 1
      else if (indexRef.current > 0) indexRef.current = indexRef.current - 1
      return history[indexRef.current].c
    }

    if (direction === 'down') {
      if (index === -1) return null
      const prefix = prefixRef.current
      if (prefix) {
        for (let i = index + 1; i < history.length; i++) {
          if (history[i].c.startsWith(prefix)) {
            indexRef.current = i
            return history[i].c
          }
        }
        indexRef.current = -1
        return draftRef.current
      }
      if (index < history.length - 1) {
        indexRef.current = index + 1
        return history[indexRef.current].c
      }
      indexRef.current = -1
      return draftRef.current
    }

    return null
  }

  function boundPush(command, exitCode) {
    push(command, exitCode, paneId)
  }

  return { push: boundPush, navigate, getAll, getSessionHistory: sessionHistory, isNavigating, resetNavigation }
}
