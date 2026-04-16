import { useRef, forwardRef, useImperativeHandle } from 'react'
import Prompt from '../Prompt'
import { useShellEditor } from './useShellEditor'

const InputBar = forwardRef(function InputBar(
  { onSubmit, onNavigateHistory, getHistory, cwd, exitCode },
  ref,
) {
  // callbacksRef keeps latest prop values accessible inside the CodeMirror
  // keybinding closures without rebuilding the EditorView when props change.
  const callbacksRef = useRef({})
  callbacksRef.current.onSubmit = onSubmit
  callbacksRef.current.onNavigateHistory = onNavigateHistory
  callbacksRef.current.getHistory = getHistory

  const { editorContainerRef, viewRef } = useShellEditor(callbacksRef)

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
  }))

  return (
    <div className="shrink-0 flex flex-col bg-[var(--bg-surface)] mt-1 pt-2 pb-2">
      <div>
        <Prompt cwd={cwd} exitCode={exitCode} />
      </div>
      <div ref={editorContainerRef} />
    </div>
  )
})

export default InputBar