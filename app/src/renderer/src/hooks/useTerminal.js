import { useEffect, useRef, useCallback } from 'react'
import * as wire from '../wire'
import { notifyAIStatus } from './useAIStatus'

export function useTerminal(paneId, callbacksRef, initialCwd) {
  const ws = useRef(null)
  const terminalSizeRef = useRef(null)
  const sessionIdRef = useRef(null) // persists session ID across reconnects

  useEffect(() => {
    let destroyed = false
    let retryTimer = null

    async function connect() {
      const port = await window.electron.getCorePort()
      const params = new URLSearchParams()
      if (initialCwd) params.set('cwd', initialCwd)
      if (sessionIdRef.current) params.set('sessionId', sessionIdRef.current)
      const url = `ws://localhost:${port}/?${params}`
      const socket = new WebSocket(url)
      ws.current = socket
      socket.onopen = () => {
        callbacksRef.current.triggerFit?.()
      }
      socket.onerror = (e) => console.error(`[terminal:${paneId}] error`, e)
      socket.onclose = () => {
        if (!destroyed) retryTimer = setTimeout(connect, 1000)
      }
      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case wire.TypeSessionID:
            sessionIdRef.current = msg.data
            break
          case wire.TypeOutput:
            callbacksRef.current.onOutput?.(msg.data)
            break
          case wire.TypeCwd:
            callbacksRef.current.onCwd?.(msg.data)
            break
          case wire.TypeExitCode:
            callbacksRef.current.onExitCode?.(msg.data)
            break
          case wire.TypeGit: {
            const [branch, dirty, ahead, behind, staged, modified, untracked] = msg.data.split('|')
            callbacksRef.current.onGit?.({
              branch,
              dirty: dirty === '1',
              ahead: parseInt(ahead, 10) || 0,
              behind: parseInt(behind, 10) || 0,
              staged: parseInt(staged, 10) || 0,
              modified: parseInt(modified, 10) || 0,
              untracked: parseInt(untracked, 10) || 0,
            })
            break
          }
          case wire.TypeNode: {
            const [version, packageManager] = msg.data.split('|')
            callbacksRef.current.onNode?.({ version, packageManager })
            break
          }
          case wire.TypeGo: {
            callbacksRef.current.onGo?.({ version: msg.data })
            break
          }
          case wire.TypePython: {
            const [version, venv] = msg.data.split('|')
            callbacksRef.current.onPython?.({ version, venv })
            break
          }
          case wire.TypeDocker: {
            callbacksRef.current.onDocker?.({ kind: msg.data })
            break
          }
          case wire.TypeK8s: {
            const [context, namespace] = msg.data.split('|')
            callbacksRef.current.onK8s?.({ context, namespace })
            break
          }
          case wire.TypeRust:
            callbacksRef.current.onRust?.({ version: msg.data })
            break
          case wire.TypePhp:
            callbacksRef.current.onPhp?.({ version: msg.data })
            break
          case wire.TypeJava:
            callbacksRef.current.onJava?.({ version: msg.data })
            break
          case wire.TypeKotlin:
            callbacksRef.current.onKotlin?.({ version: msg.data })
            break
          case wire.TypeHaskell:
            callbacksRef.current.onHaskell?.({ version: msg.data })
            break
          case wire.TypeC:
            callbacksRef.current.onC?.({ version: msg.data })
            break
          case wire.TypeConda:
            callbacksRef.current.onConda?.({ env: msg.data })
            break
          case wire.TypeAISuggestion: {
            const cmds = Array.isArray(msg.data) ? msg.data : [msg.data]
            callbacksRef.current.onAISuggestion?.(cmds)
            break
          }
          case wire.TypeAISuggestError:
            callbacksRef.current.onAISuggestError?.()
            break
          case wire.TypeAIExplanation:
            callbacksRef.current.onAIBannerStart?.('error')
            callbacksRef.current.onAIBannerToken?.(msg.data)
            break
          case wire.TypeAIBannerStart:
            callbacksRef.current.onAIBannerStart?.(msg.data?.type ?? 'error')
            break
          case wire.TypeAIBannerToken:
            callbacksRef.current.onAIBannerToken?.(msg.data)
            break
          case wire.TypeAIBannerCancel:
            callbacksRef.current.onAIBannerCancel?.()
            break
          case wire.TypeAIStatus:
            notifyAIStatus(msg.data)
            break
          case wire.TypeAskChunk:
            callbacksRef.current.onAskChunk?.(msg.data)
            break
          case wire.TypeAskDone:
            callbacksRef.current.onAskDone?.()
            break
          case wire.TypeAskError:
            callbacksRef.current.onAskError?.(msg.data)
            break
          case wire.TypeAIAnalysis:
            callbacksRef.current.onAIAnalysis?.(msg.data)
            break
          case wire.TypeNLResult:
            callbacksRef.current.onNLResult?.(msg.data?.command ?? '')
            break
          case wire.TypeNLError:
            callbacksRef.current.onNLError?.(msg.data)
            break
          case wire.TypeGhostResult:
            callbacksRef.current.onGhostResult?.(msg.data?.suggestion ?? '')
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
  }, [paneId])

  const sendInput = useCallback((text) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    if (terminalSizeRef.current) {
      ws.current.send(JSON.stringify({ type: wire.TypeResize, data: terminalSizeRef.current }))
    }
    const displayText = text.split('\n').map(line => line.trim()).filter(Boolean).join(' ⏎ ')
    try { callbacksRef.current.onCommandStart?.(displayText || text) } catch (e) { console.error(e) }
    ws.current.send(JSON.stringify({ type: wire.TypeInput, data: text + '\n' }))
  }, [paneId])

  const sendRaw = useCallback((data) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeRawInput, data }))
  }, [paneId])

  const sendResize = useCallback((cols, rows) => {
    if (rows > 2) terminalSizeRef.current = { cols, rows }
    if (ws.current?.readyState !== WebSocket.OPEN) return
    if (rows <= 2) return
    ws.current.send(JSON.stringify({ type: wire.TypeResize, data: { cols, rows } }))
  }, [paneId])

  const sendAIAppend = useCallback((entry) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeAIAppend, data: entry }))
  }, [paneId])

  const sendSummarize = useCallback(() => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeSummarize }))
  }, [paneId])

  const sendAIAnalyze = useCallback((entry) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeAIAnalyze, data: entry }))
  }, [paneId])

  const sendAsk = useCallback((history, query) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeAsk, data: { history, query } }))
  }, [paneId])

  const sendNLQuery = useCallback((query, cwd) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeNLQuery, data: { query, cwd } }))
  }, [paneId])

  const sendGhostQuery = useCallback((prefix, history) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    ws.current.send(JSON.stringify({ type: wire.TypeGhostQuery, data: { prefix, history } }))
  }, [paneId])

  return { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendSummarize, sendAsk, sendNLQuery, sendGhostQuery }
}
