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
//   1. Currently running command (full text, CSS truncates) — e.g. "docker run hello"
//   2. Last run command (persists after it finishes)
//   3. basename(cwd) — e.g. "term", "app"
//   4. fallback
export function computeTabTitle(info, fallback) {
  const cmd = (info?.runningCommand ?? info?.lastCommand)?.trim()
  if (cmd) return cmd
  if (info?.cwd) {
    const parts = info.cwd.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
    return '/'
  }
  return fallback
}

// True when the tab's title is coming from a command (vs. cwd fallback).
// Callers use this to pick between commandIcon(cmd) and a folder icon.
export function hasCommandTitle(info) {
  return !!((info?.runningCommand ?? info?.lastCommand)?.trim())
}
