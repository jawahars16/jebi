import { useEffect, useRef, useCallback } from 'react'
import * as wire from '../wire'

export function useTerminal(paneId, callbacksRef) {
  const ws = useRef(null)
  const terminalSizeRef = useRef(null)

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:7070')
    ws.current.onopen = () => console.log(`[terminal:${paneId}] connected`)
    ws.current.onerror = (e) => console.error(`[terminal:${paneId}] error`, e)
    ws.current.onclose = () => console.log(`[terminal:${paneId}] disconnected`)

    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case wire.TypeOutput:
          callbacksRef.current.onOutput?.(msg.data)
          break
        case wire.TypeCwd:
          callbacksRef.current.onCwd?.(msg.data)
          break
        case wire.TypeExitCode:
          callbacksRef.current.onExitCode?.(msg.data)
          break
      }
    }

    return () => ws.current?.close()
  }, [paneId])

  const sendInput = useCallback((text) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    if (terminalSizeRef.current) {
      ws.current.send(JSON.stringify({ type: wire.TypeResize, data: terminalSizeRef.current }))
    }
    // Render the React Prompt decoration above the command's output.
    // Wrapped in try-catch so addon errors never block the command send.
    try { callbacksRef.current.onCommandStart?.(text) } catch (e) { console.error(e) }
    ws.current.send(JSON.stringify({ type: wire.TypeInput, data: text + '\n' }))
  }, [paneId])

  const sendRaw = useCallback((data) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeInput, data }))
  }, [paneId])

  const sendResize = useCallback((cols, rows) => {
    if (rows > 2) terminalSizeRef.current = { cols, rows }
    if (ws.current?.readyState !== WebSocket.OPEN) return
    if (rows <= 2) return
    ws.current.send(JSON.stringify({ type: wire.TypeResize, data: { cols, rows } }))
  }, [paneId])

  return { sendInput, sendRaw, sendResize }
}
