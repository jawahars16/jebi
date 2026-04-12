import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { WebglAddon } from '@xterm/addon-webgl'
import { PromptAddon } from '../../addons/PromptAddon'
import Prompt from '../Prompt'

const BUFFER_CAP = 512 * 1024 // 512 KB

// Alternate screen enter/exit — emitted by TUI apps (vim, micro, htop, etc.)
const TUI_ENTER = '\x1b[?1049h'
const TUI_EXIT  = '\x1b[?1049l'

// 'webgl'   — GPU-accelerated, best performance, no ligatures
// 'canvas'  — software renderer, supports font ligatures
// Will be driven by user preferences once that system is implemented.
const DEFAULT_RENDERER = 'canvas'

export default function OutputArea({ callbacksRef, sendRaw, sendResize, isActive, isVisible, renderer = DEFAULT_RENDERER }) {
  const rootRef = useRef(null)
  const xtermContainerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const promptAddonRef = useRef(null)
  const cellHeightRef = useRef(28)
  const sendResizeRef = useRef(sendResize)
  const pendingRef = useRef([])
  const pendingSizeRef = useRef(0)
  const isVisibleRef = useRef(isVisible)

  const [stickyCommand, setStickyCommand] = useState(null)

  sendResizeRef.current = sendResize

  // When the tab becomes visible, flush buffered output and refit.
  useEffect(() => {
    isVisibleRef.current = isVisible
    if (!isVisible) return
    const term = termRef.current
    if (!term || pendingRef.current.length === 0) return
    term.write(pendingRef.current.join(''))
    pendingRef.current = []
    pendingSizeRef.current = 0
    fitAddonRef.current?.fit()
  }, [isVisible])

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const cssVar = (name) => style.getPropertyValue(name).trim()
    const fontFamily = cssVar('--font-mono')
    const fontSize = parseInt(cssVar('--font-size-mono')) || 15
    let disposed = false
    let cleanup = () => {}

    // Wait for the font to be fully loaded before xterm measures cell dimensions.
    // Without this, xterm may initialise with a fallback font and get wrong cell sizes,
    // which breaks ligatures and prompt row alignment.
    document.fonts.load(`${fontSize}px ${fontFamily}`).then(() => {
      if (disposed) return

      const term = new Terminal({
        fontFamily,
        fontSize,
        lineHeight: 1.2,
        theme: {
          background: cssVar('--bg-surface'),
          foreground: cssVar('--text-primary'),
          cursor: cssVar('--accent'),
        },
        fontLigatures: renderer === 'canvas',
        cursorBlink: false,
        cursorInactiveStyle: 'none',
        allowProposedApi: true,
        overviewRulerWidth: 12,
        smoothScrollDuration: 100,
        scrollback: 10000,
      })

      const fitAddon = new FitAddon()
      const promptAddon = new PromptAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(promptAddon)
      promptAddonRef.current = promptAddon

      term.onData((data) => {
        sendRaw(data)
        term.scrollToBottom()
      })
      term.onResize(({ cols, rows }) => sendResizeRef.current?.(cols, rows))

      term.open(xtermContainerRef.current)

      if (renderer === 'webgl') {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => webglAddon.dispose())
        term.loadAddon(webglAddon)
      }

      fitAddon.fit()
      if (term.rows <= 2) term.resize(term.cols, 24)

      termRef.current = term
      fitAddonRef.current = fitAddon

      term.onScroll(() => {
        const viewportY = term.buffer.active.viewportY
        const sticky = promptAddon.getStickyCommand(viewportY)
        setStickyCommand(sticky)
        cellHeightRef.current =
          term._core?._renderService?.dimensions?.css?.cell?.height ??
          (term.element ? term.element.offsetHeight / term.rows : 28)
      })

      callbacksRef.current.focusTerm = () => term.focus()

      callbacksRef.current.onOutput = (data) => {
        if (data.includes(TUI_ENTER)) promptAddon.enterTui()
        else if (data.includes(TUI_EXIT)) promptAddon.exitTui()

        if (isVisibleRef.current) {
          term.write(data, () => term.scrollToBottom())
        } else {
          pendingRef.current.push(data)
          pendingSizeRef.current += data.length
          while (pendingSizeRef.current > BUFFER_CAP && pendingRef.current.length > 1) {
            pendingSizeRef.current -= pendingRef.current.shift().length
          }
        }
      }

      callbacksRef.current.onCommandStart = (command) => {
        promptAddon.commandStart(command, callbacksRef.current.currentCwd ?? '')
        setStickyCommand(null)
      }

      callbacksRef.current.onCwdDecoration = (cwd) => {
        promptAddon.updateLastCwd(cwd)
        const viewportY = term.buffer.active.viewportY
        setStickyCommand(promptAddon.getStickyCommand(viewportY))
      }

      callbacksRef.current.onExitCodeDecoration = (code) => {
        promptAddon.updateLastExitCode(code)
        // Refresh sticky if it's showing the just-updated command.
        const viewportY = term.buffer.active.viewportY
        setStickyCommand(promptAddon.getStickyCommand(viewportY))
      }

      const observer = new ResizeObserver(() => fitAddon.fit())
      observer.observe(rootRef.current)

      cleanup = () => {
        observer.disconnect()
        callbacksRef.current = {}
        term.dispose()
      }
    })

    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (isActive) termRef.current?.focus()
  }, [isActive])

  return (
    <div ref={rootRef} className="flex-1 min-h-0 flex flex-col relative">
      <div ref={xtermContainerRef} className="flex-1 min-h-0 px-3 pt-2" />
      {stickyCommand !== null && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <Prompt
            command={stickyCommand.command}
            cwd={stickyCommand.cwd}
            exitCode={stickyCommand.exitCode}
            rowHeight={cellHeightRef.current}
            onCopy={stickyCommand.onCopy}
          />
        </div>
      )}
    </div>
  )
}
