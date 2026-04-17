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
  const [gitData, setGitData] = useState(null)
  const inputBarRef = useRef(null)
  const runningRef = useRef(false)
  const pendingCommandRef = useRef(null)

  runningRef.current = running

  callbacksRef.current.isRunning = () => runningRef.current
  callbacksRef.current.focusInput = () => inputBarRef.current?.focus()

  callbacksRef.current.onCwd = (value) => {
    setCwd(value)
    setGitData(null) // Reset on directory change; onGit re-populates if new dir is a git repo
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

  callbacksRef.current.onGit = (data) => {
    setGitData(data)
    callbacksRef.current.onGitDecoration?.(data)
  }

  const handleSubmit = useCallback((command) => {
    pendingCommandRef.current = command.trim()
    sendInput(command)
    setRunning(true)
    callbacksRef.current.focusTerm?.()
  }, [sendInput])

  function handleMouseDown() {
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

      {!running && (
        <InputBar
          ref={inputBarRef}
          onSubmit={handleSubmit}
          onNavigateHistory={navigateHistory}
          getHistory={getHistory}
          cwd={cwd}
          exitCode={exitCode}
          gitData={gitData}
          onGitClick={() => handleSubmit('git status')}
        />
      )}
    </div>
  )
}
