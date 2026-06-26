import { useRef, useState, forwardRef, useImperativeHandle, useEffect } from "react";
import Prompt from "../Prompt";
import KeyBadge from "../KeyBadge";
import { useShellEditor, ghostSuggestionsEffect } from "./useShellEditor";


const InputBar = forwardRef(function InputBar(
  {
    onSubmit,
    onNavigateHistory,
    resetNavigation,
    getHistory,
    isNavigatingHistory,
    commandContext,
    onDismissExplanation,
    onSlashChange,
    aiSuggestions = [],
    onSuggestionPick,
    cwd,
    exitCode,
    gitData,
    onGitClick,
    nodeData,
    onNodeClick,
    goData,
    onGoClick,
    pythonData,
    onPythonClick,
    dockerData,
    onDockerClick,
    k8sData,
    onK8sClick,
    rustData,
    onRustClick,
    phpData,
    onPhpClick,
    javaData,
    onJavaClick,
    kotlinData,
    onKotlinClick,
    haskellData,
    onHaskellClick,
    cData,
    onCClick,
    condaData,
    onCondaClick,
    nlMode = false,
    nlSuccessCount = 0,
    onNLModeChange,
    onNLSubmit,
  },
  ref,
) {
  const [showAIHint, setShowAIHint] = useState(false);
  const [hintText, setHintText] = useState('');
  const hintTimerRef = useRef(null);
  const hintIndexRef = useRef(0);

  // callbacksRef keeps latest prop values accessible inside the CodeMirror
  // keybinding closures without rebuilding the EditorView when props change.
  const callbacksRef = useRef({});
  callbacksRef.current.onValueChange = (value) => {
    onSlashChange?.(value.startsWith('/') ? value.slice(1) : null);
    // Show hint when user types a multi-word phrase — feels like they're searching.
    // Stop once they've successfully used NL mode 3 times (they know the feature).
    const canHint = !callbacksRef.current.nlMode && !value.startsWith('/') && value.trim().includes(' ') && callbacksRef.current.nlSuccessCount < 3;
    if (canHint) {
      if (!hintTimerRef.current && !showAIHint) {
        hintTimerRef.current = setTimeout(() => {
          const hints = [
            "Not sure of the exact command?",
            "Thinking in plain English?",
            "Can't remember the flags?",
            "Just describe what you want.",
            "Forgot the syntax? Just describe it.",
            "Let AI figure out the syntax.",
          ];
          setHintText(hints[hintIndexRef.current % hints.length]);
          hintIndexRef.current += 1;
          setShowAIHint(true);
          hintTimerRef.current = null;
        }, 1200);
      }
    } else {
      if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = null; }
      if (!value.trim().includes(' ') || callbacksRef.current.nlMode) setShowAIHint(false);
    }
  };
  callbacksRef.current.onSubmit = (...args) => { setShowAIHint(false); onSubmit?.(...args); };
  callbacksRef.current.onNavigateHistory = onNavigateHistory;
  callbacksRef.current.resetNavigation = resetNavigation;
  callbacksRef.current.getHistory = getHistory;
  callbacksRef.current.isNavigatingHistory = isNavigatingHistory;
  callbacksRef.current.commandContext = commandContext;
  callbacksRef.current.aiSuggestions = aiSuggestions;
  callbacksRef.current.onSuggestionPick = onSuggestionPick;
  callbacksRef.current.cwd = cwd;
  callbacksRef.current.onDismissExplanation = onDismissExplanation;
  callbacksRef.current.onNLSubmit = onNLSubmit;
  callbacksRef.current.onNLModeChange = onNLModeChange;
  callbacksRef.current.nlMode = nlMode;
  callbacksRef.current.nlSuccessCount = nlSuccessCount;

  const { editorContainerRef, viewRef, setNlPlaceholder } = useShellEditor(callbacksRef)

  useEffect(() => {
    viewRef.current?.dispatch({ effects: ghostSuggestionsEffect.of(aiSuggestions) })
  }, [aiSuggestions]);

  useEffect(() => {
    setNlPlaceholder(nlMode);
  }, [nlMode]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setValue: (text) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0, head: text.length },
      });
      view.focus();
    },
  }));

  return (
    <div
      style={{
        marginTop: "2px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        background: 'color-mix(in srgb, #000 20%, var(--bg-surface))',
        borderLeft: nlMode ? '3px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 60%, transparent)' : '3px solid transparent',
        transition: 'border-left-color 0.15s ease',
      }}
    >
      {/* Prompt row — pills + right-aligned suggestion chips */}
      <div>
        <Prompt
          cwd={cwd}
          aiSuggestions={aiSuggestions}
          onSuggestionPick={onSuggestionPick}
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
          rustData={rustData}
          onRustClick={onRustClick}
          phpData={phpData}
          onPhpClick={onPhpClick}
          javaData={javaData}
          onJavaClick={onJavaClick}
          kotlinData={kotlinData}
          onKotlinClick={onKotlinClick}
          haskellData={haskellData}
          onHaskellClick={onHaskellClick}
          cData={cData}
          onCClick={onCClick}
          condaData={condaData}
          onCondaClick={onCondaClick}
        />
      </div>

      {/* Editor row — AI badge in NL mode, ❯ otherwise */}
      <div style={{ display: "flex", alignItems: "flex-start", padding: "3px 14px 8px" }}>
        {nlMode ? (
          <>
            <style>{`
              @keyframes aiBadgeIn {
                from { opacity: 0; transform: translateX(-6px) scale(0.9); }
                to   { opacity: 1; transform: translateX(0) scale(1); }
              }
            `}</style>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'color-mix(in srgb, var(--tab-accent) 18%, transparent)',
              border: '1px solid color-mix(in srgb, var(--tab-accent) 45%, transparent)',
              borderRadius: 4,
              padding: '4px 10px',
              marginRight: 2,
              marginTop: 2,
              flexShrink: 0,
              userSelect: 'none',
              animation: 'aiBadgeIn 0.18s ease-out',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--tab-accent)',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}>AI</span>
            </span>
          </>
        ) : (
          <span style={{
            color: 'var(--tab-accent)',
            opacity: 0.85,
            paddingTop: '2px',
            flexShrink: 0,
            userSelect: 'none',
            lineHeight: 1.5,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-mono)',
          }}>❯</span>
        )}
        <div ref={editorContainerRef} style={{ flex: 1, minWidth: 0 }} />
        {!nlMode && showAIHint && (
          <>
            <style>{`
              @keyframes aiHintIn {
                from { opacity: 0; transform: translateY(4px); }
                to   { opacity: 1; transform: none; }
              }
              @keyframes aiHintOut {
                from { opacity: 1; }
                to   { opacity: 0; }
              }
            `}</style>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              marginTop: -10,
              color: 'var(--text-secondary)',
              opacity: 0.75,
              userSelect: 'none',
              flexShrink: 0,
              alignSelf: 'center',
              animation: 'aiHintIn 0.2s ease-out',
              whiteSpace: 'nowrap',
            }}>
              {hintText} Try AI mode
              <KeyBadge keys={['cmd', 'shift', '.']} style={{
                background: 'color-mix(in srgb, var(--tab-accent) 20%, transparent)',
                border: '1px solid color-mix(in srgb, var(--tab-accent) 55%, transparent)',
                color: 'var(--tab-accent)',
              }} />
            </span>
          </>
        )}
      </div>
    </div>
  );
});

export default InputBar;
