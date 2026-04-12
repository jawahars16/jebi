import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import AnsiToHtml from 'ansi-to-html'
import '@xterm/xterm/css/xterm.css'
import { PromptAddon } from '../../addons/PromptAddon'

const TUI_ENTER = '\x1b[?1049h'
const TUI_EXIT  = '\x1b[?1049l'
const OSC_EXIT_CODE = '\x1b]9001;'

const ansiConverter = new AnsiToHtml()

export default function OutputArea({
  callbacksRef,
  sendRaw,
  sendResize,
  isActive,
  isVisible
}) {
  const rootRef = useRef(null)
  const xtermContainerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const sendResizeRef = useRef(sendResize)

  const isVisibleRef = useRef(isVisible)

  // 👉 Fake terminal state
  const [lines, setLines] = useState([])
  const [isTui, setIsTui] = useState(false)

  // 👉 critical refs (avoid stale state bugs)
  const isTuiRef = useRef(false)
  const suppressNextRef = useRef(false)
  const lineBufferRef = useRef('')

  sendResizeRef.current = sendResize

  useEffect(() => {
    isVisibleRef.current = isVisible
  }, [isVisible])

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const cssVar = (name) => style.getPropertyValue(name).trim()

    const term = new Terminal({
      fontFamily: cssVar('--font-mono'),
      theme: {
        background: 'transparent',
        foreground: cssVar('--text-primary'),
        cursor: cssVar('--accent'),
      },
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      allowTransparency: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const promptAddon = new PromptAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(promptAddon)

    // 👉 Input → backend
    term.onData((data) => {
      sendRaw(data)
      term.scrollToBottom()
    })

    // 👉 Resize → backend
    term.onResize(({ cols, rows }) => {
      sendResizeRef.current?.(cols, rows)
    })

    term.open(xtermContainerRef.current)
    fitAddon.fit()

    if (term.rows <= 2) term.resize(term.cols, 24)

    termRef.current = term
    fitAddonRef.current = fitAddon

    callbacksRef.current.focusTerm = () => term.focus()

    // 👉 Core output handler
    callbacksRef.current.onOutput = (data) => {
      // ---- TUI ENTER ----
      if (data.includes(TUI_ENTER)) {
        isTuiRef.current = true
        setIsTui(true)
        promptAddon.enterTui()
      }

      // ---- TUI EXIT ----
      if (data.includes(TUI_EXIT)) {
        isTuiRef.current = false
        setIsTui(false)
        promptAddon.exitTui()

        // 🚨 suppress repaint garbage
        suppressNextRef.current = true
        return
      }

      // ---- Command done ----
      if (data.includes(OSC_EXIT_CODE)) {
        callbacksRef.current.onCommandDone?.()

        // allow rendering again
        suppressNextRef.current = false
      }

      // ---- Always write to xterm ----
      term.write(data)

      // ---- Skip fake terminal during TUI ----
      if (isTuiRef.current) return

      // ---- Skip repaint garbage ----
      if (suppressNextRef.current) return

      // ---- Line-safe buffering ----
      const combined = lineBufferRef.current + data
      const parts = combined.split('\n')

      lineBufferRef.current = parts.pop() // incomplete line

      if (parts.length === 0) return

      setLines(prev => {
        const next = [...parts, ...prev]
        return next.length > 1000 ? next.slice(0, 1000) : next
      })
    }

    callbacksRef.current.onCommandStart = (command) => {
      promptAddon.commandStart(command)
    }

    const observer = new ResizeObserver(() => {
      fitAddon.fit()
    })

    observer.observe(rootRef.current)

    return () => {
      observer.disconnect()
      callbacksRef.current = {}
      term.dispose()
    }
  }, [])

  useEffect(() => {
    if (isActive) termRef.current?.focus()
  }, [isActive])

  return (
    <div ref={rootRef} className="flex-1 min-h-0 flex flex-col relative">
      
      {/* 👉 Fake terminal (default mode) */}
      {!isTui && (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col-reverse p-2 font-mono text-sm">
          {lines.map((line, i) => (
            <div
              key={i}
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: ansiConverter.toHtml(line),
              }}
            />
          ))}
        </div>
      )}

      {/* 👉 Real xterm (TUI mode or hidden backend) */}
      <div
        ref={xtermContainerRef}
        className={
          isTui
            ? 'flex-1 min-h-0'
            : 'absolute inset-0 opacity-0 pointer-events-none'
        }
      />
    </div>
  )
}