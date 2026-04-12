import { createContext, useContext, useState, useCallback } from 'react'

// Default shape for a new session entry.
function defaultSession() {
  return {
    tuiMode: false,
    isRunning: false,
    segmentData: {},
    config: null,
  }
}

const SessionStoreContext = createContext(null)

// SessionStoreProvider wraps the entire app (in main.jsx).
// Session data is keyed by paneId and survives component remounts — only
// an explicit deleteSession call removes an entry.
export function SessionStoreProvider({ children }) {
  const [sessions, setSessions] = useState({})

  const getSession = useCallback((paneId) => {
    return sessions[paneId] ?? defaultSession()
  }, [sessions])

  const updateSession = useCallback((paneId, updater) => {
    setSessions(prev => ({
      ...prev,
      [paneId]: updater(prev[paneId] ?? defaultSession()),
    }))
  }, [])

  const deleteSession = useCallback((paneId) => {
    setSessions(prev => {
      const next = { ...prev }
      delete next[paneId]
      return next
    })
  }, [])

  return (
    <SessionStoreContext.Provider value={{ getSession, updateSession, deleteSession }}>
      {children}
    </SessionStoreContext.Provider>
  )
}

export function useSessionStore() {
  const ctx = useContext(SessionStoreContext)
  if (!ctx) throw new Error('useSessionStore must be used inside SessionStoreProvider')
  return ctx
}
