import { useRef, forwardRef, useImperativeHandle } from 'react'
import Prompt from '../Prompt'
import { useShellEditor } from './useShellEditor'

const InputBar = forwardRef(function InputBar(
  {
    onSubmit, onNavigateHistory, getHistory, isNavigatingHistory, commandContext,
    cwd, exitCode,
    gitData, onGitClick,
    nodeData, onNodeClick,
    goData, onGoClick,
    pythonData, onPythonClick,
    dockerData, onDockerClick,
    k8sData, onK8sClick,
  },
  ref,
) {
  // callbacksRef keeps latest prop values accessible inside the CodeMirror
  // keybinding closures without rebuilding the EditorView when props change.
  const callbacksRef = useRef({})
  callbacksRef.current.onSubmit = onSubmit
  callbacksRef.current.onNavigateHistory = onNavigateHistory
  callbacksRef.current.getHistory = getHistory
  callbacksRef.current.isNavigatingHistory = isNavigatingHistory
  callbacksRef.current.commandContext = commandContext

  const { editorContainerRef, viewRef } = useShellEditor(callbacksRef)

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setValue: (text) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      view.focus()
    },
  }))

  return (
    <div className="shrink-0 flex flex-col bg-[var(--bg-surface)] mt-1 pt-2 pb-2">
      <div>
        <Prompt
          cwd={cwd}
          exitCode={exitCode}
          gitData={gitData}
          onGitClick={onGitClick}
          nodeData={nodeData}
          onNodeClick={onNodeClick}
          goData={goData}
          onGoClick={onGoClick}
          pythonData={pythonData}
          onPythonClick={onPythonClick}
          dockerData={dockerData}
          onDockerClick={onDockerClick}
          k8sData={k8sData}
          onK8sClick={onK8sClick}
        />
      </div>
      <div ref={editorContainerRef} />
    </div>
  )
})

export default InputBar
