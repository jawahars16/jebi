import { useSyncExternalStore } from 'react'

// Module-level store — per-pane info (cwd, runningCommand, etc.) used to derive
// tab titles. Writers (TerminalPane) call setPaneInfo directly without subscribing,
// so pane components never re-render on title changes. Only TabPill subscribes.
const store = new Map()
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setPaneInfo(paneId, patch) {
  const prev = store.get(paneId) || {}
  store.set(paneId, { ...prev, ...patch })
  emit()
}

export function deletePaneInfo(paneId) {
  if (store.delete(paneId)) emit()
}

export function usePaneInfo(paneId) {
  return useSyncExternalStore(
    subscribe,
    () => store.get(paneId),
  )
}

// Derives a human-friendly tab title from pane info. Priority:
//   1. Currently running command (first word) — e.g. "npm", "vim"
//   2. basename(cwd) — e.g. "term", "app"
//   3. fallback
export function computeTabTitle(info, fallback) {
  if (info?.runningCommand) {
    const first = info.runningCommand.trim().split(/\s+/)[0]
    if (first) return first
  }
  if (info?.cwd) {
    const parts = info.cwd.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
    return '/'
  }
  return fallback
}
