import { useRef, useState, useCallback } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useSharedHistory } from '../../hooks/useSharedHistory'
import OutputArea from '../OutputArea'
import InputBar from '../InputBar'

export default function TerminalPane({
  paneId,
  isActive,
  isVisible,
  onFocus,
  onTitleChange,
  onSplitRight,
  onSplitDown,
  onClose,
}) {
  const callbacksRef = useRef({})
  const { sendInput, sendRaw, sendResize } = useTerminal(paneId, callbacksRef)
  const { push: pushHistory, navigate: navigateHistory, getAll: getHistory } = useSharedHistory()
  const [running, setRunning] = useState(false)
  const [cwd, setCwd] = useState('')
  const [exitCode, setExitCode] = useState(0)
  const inputBarRef = useRef(null)
  // Kept in a ref so the OutputArea key-intercept callback always sees the live value.
  const runningRef = useRef(false)
  const pendingCommandRef = useRef(null)

  runningRef.current = running

  // Expose to OutputArea so its key-intercept handler can redirect focus here.
  callbacksRef.current.isRunning = () => runningRef.current
  callbacksRef.current.focusInput = () => inputBarRef.current?.focus()

  callbacksRef.current.onCwd = (value) => {
    setCwd(value)
    callbacksRef.current.currentCwd = value
    callbacksRef.current.onCwdDecoration?.(value)
  }

  // exit_code arrives before every prompt — signals command done and captures exit status.
  callbacksRef.current.onExitCode = (value) => {
    const code = Number(value)
    setExitCode(code)
    callbacksRef.current.currentExitCode = code
    callbacksRef.current.onExitCodeDecoration?.(code)
    if (code === 0 && pendingCommandRef.current) pushHistory(pendingCommandRef.current)
    pendingCommandRef.current = null
    setRunning(false)
    setTimeout(() => inputBarRef.current?.focus(), 0)
  }

  const handleSubmit = useCallback((command) => {
    pendingCommandRef.current = command.trim()
    sendInput(command)
    setRunning(true)
    callbacksRef.current.focusTerm?.()
  }, [sendInput])

  function handleMouseDown() {
    // When a command isn't running the InputBar owns keyboard input.
    // setTimeout lets xterm's own mousedown handler fire first, then we
    // steal focus back so the user's keystrokes land in the InputBar.
    if (!runningRef.current) setTimeout(() => inputBarRef.current?.focus(), 0)
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      onClick={onFocus}
      onMouseDown={handleMouseDown}>
      <OutputArea
        callbacksRef={callbacksRef}
        sendRaw={sendRaw}
        sendResize={sendResize}
        isActive={isActive}
        isVisible={isVisible}
      />

      {!running && <InputBar ref={inputBarRef} onSubmit={handleSubmit} onNavigateHistory={navigateHistory} getHistory={getHistory} cwd={cwd} exitCode={exitCode} />}
    </div>
  )
}
