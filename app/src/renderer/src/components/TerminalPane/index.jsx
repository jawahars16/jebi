import { useRef, useState, useCallback } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useCommandHistory } from '../../hooks/useCommandHistory'
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
  const { push: pushHistory, navigate: navigateHistory } = useCommandHistory()
  const [running, setRunning] = useState(false)
  const [cwd, setCwd] = useState('')
  const [exitCode, setExitCode] = useState(0)
  const inputBarRef = useRef(null)

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
    setRunning(false)
    setTimeout(() => inputBarRef.current?.focus(), 0)
  }

  const handleSubmit = useCallback((command) => {
    pushHistory(command)
    sendInput(command)
    setRunning(true)
    callbacksRef.current.focusTerm?.()
  }, [sendInput])

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      onClick={onFocus}>
      <OutputArea
        callbacksRef={callbacksRef}
        sendRaw={sendRaw}
        sendResize={sendResize}
        isActive={isActive}
        isVisible={isVisible}
      />

      {!running && <InputBar ref={inputBarRef} onSubmit={handleSubmit} onNavigateHistory={navigateHistory} cwd={cwd} exitCode={exitCode} />}
    </div>
  )
}
