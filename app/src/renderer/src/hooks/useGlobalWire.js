import { useEffect, useRef, useState, useCallback } from 'react'
import * as wire from '../wire'

// Global WebSocket for cross-session AI features (the Ask AI drawer). One
// connection for the whole app, opened at App level — separate from each
// pane's per-session terminal socket.
export function useGlobalWire(callbacks) {
  const ws = useRef(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let destroyed = false
    let retryTimer = null

    async function connect() {
      const port = await window.electron.getCorePort()
      const socket = new WebSocket(`ws://localhost:${port}/global`)
      ws.current = socket
      socket.onopen = () => setConnected(true)
      socket.onerror = (e) => console.error('[global-wire] error', e)
      socket.onclose = () => {
        setConnected(false)
        if (!destroyed) retryTimer = setTimeout(connect, 1000)
      }
      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case wire.TypeAskChunk:
            callbacksRef.current.onChunk?.(msg.data)
            break
          case wire.TypeAskDone:
            callbacksRef.current.onDone?.()
            break
          case wire.TypeAskError:
            callbacksRef.current.onError?.(msg.data)
            break
          case wire.TypeAskSuggestResult:
            callbacksRef.current.onSuggestions?.(msg.data)
            break
          case wire.TypeHistorySearchResult:
            callbacksRef.current.onHistoryMatches?.(msg.data?.matches ?? [])
            break
        }
      }
    }

    connect()

    return () => {
      destroyed = true
      clearTimeout(retryTimer)
      ws.current?.close()
    }
  }, [])

  const sendAskGlobal = useCallback((history, query, sessions) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeAskGlobal, data: { history, query, sessions } }))
  }, [])

  const sendAskSuggest = useCallback((sessions) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeAskSuggest, data: { sessions } }))
  }, [])

  const sendHistorySearch = useCallback((query, candidates) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeHistorySearch, data: { query, candidates } }))
  }, [])

  return { sendAskGlobal, sendAskSuggest, sendHistorySearch, connected }
}
