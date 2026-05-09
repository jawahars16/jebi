import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import { useSharedHistory } from "../../hooks/useSharedHistory";
import { setPaneInfo } from "../../hooks/usePaneInfo";
import { usePreferences } from "../../hooks/usePreferences";
import { registerCopy, unregisterCopy } from "../../hooks/paneCopyRegistry";
import { registerFocus, unregisterFocus } from "../../hooks/paneFocusRegistry";
import OutputArea from "../OutputArea";
import InputBar from "../InputBar";
import ExplanationPanel from "../ExplanationPanel";

export default function TerminalPane({
  paneId,
  isActive,
  isVisible,
  tabAccent,
  onFocus,
  onSplitRight,
  onSplitDown,
  onClose,
  onNewTab,
  onToggleTabPosition,
}) {
  // callbacksRef holds all event handlers as a stable ref object instead of
  // passing them as props or state. xterm.js and CodeMirror both live outside
  // the React render cycle — they hold long-lived references to these handlers.
  // If we passed fresh closures each render, they would capture stale state.
  // By writing to callbacksRef.current on every render, handlers always see
  // the latest values without causing extra renders or requiring re-registration.
  const callbacksRef = useRef({});
  const { prefs } = usePreferences();
  const { sendInput, sendRaw, sendResize, sendAIAppend } = useTerminal(paneId, callbacksRef);
  const {
    push: pushHistory,
    navigate: navigateHistory,
    getAll: getHistory,
    isNavigating: isNavigatingHistory,
    resetNavigation,
  } = useSharedHistory();
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState(null); // { text: string, type: 'error'|'info'|'warning'|'suggestion' }
  const [cwd, setCwd] = useState("");
  const [exitCode, setExitCode] = useState(0);
  const [gitData, setGitData] = useState(null);
  const [nodeData, setNodeData] = useState(null);
  const [goData, setGoData] = useState(null);
  const [pythonData, setPythonData] = useState(null);
  const [dockerData, setDockerData] = useState(null);
  const [k8sData, setK8sData] = useState(null);
  const [rustData, setRustData] = useState(null);
  const [phpData, setPhpData] = useState(null);
  const [javaData, setJavaData] = useState(null);
  const [kotlinData, setKotlinData] = useState(null);
  const [haskellData, setHaskellData] = useState(null);
  const [cData, setCData] = useState(null);
  const [condaData, setCondaData] = useState(null);
  const inputBarRef = useRef(null);
  const runningRef = useRef(false);

  useEffect(() => {
    registerCopy(paneId, () => callbacksRef.current.copySelection?.())
    return () => unregisterCopy(paneId)
  }, [paneId])

  useEffect(() => {
    registerFocus(paneId, () => inputBarRef.current?.focus())
    return () => unregisterFocus(paneId)
  }, [paneId])
  // pendingCommandRef holds the command that was just submitted but whose exit
  // code hasn't arrived yet. The OSC 9001 exit-code signal fires asynchronously
  // after the prompt re-appears, so we can't rely on React state to correlate
  // which command finished. On exit_code=0 we push this to history; on any
  // code we clear it so we never add stale commands on the next success.
  const pendingCommandRef = useRef(null);

  runningRef.current = running;

  callbacksRef.current.isRunning = () => runningRef.current;
  callbacksRef.current.focusInput = () => inputBarRef.current?.focus();

  callbacksRef.current.onCwd = (value) => {
    // The shell hook fires cwd before every prompt — not just after `cd`.
    // Only treat it as a directory change when the value actually differs
    // from the previous cwd; otherwise we'd wipe lastCommand on every prompt
    // and the tab icon/title would revert to the folder after every command.
    const changed = callbacksRef.current.currentCwd !== value;
    setCwd(value);
    if (changed) {
      // Reset all context-aware segments on directory change; detectors re-populate for the new dir.
      setGitData(null);
      setNodeData(null);
      setGoData(null);
      setPythonData(null);
      setDockerData(null);
      setK8sData(null);
      setRustData(null);
      setPhpData(null);
      setJavaData(null);
      setKotlinData(null);
      setHaskellData(null);
      setCData(null);
    }
    callbacksRef.current.currentCwd = value;
    callbacksRef.current.onCwdDecoration?.(value);
    // Clear lastCommand only when cwd actually changes, so `cd foo` lands on
    // a folder-named tab but `docker ps` keeps the docker icon after it exits.
    setPaneInfo(paneId, changed ? { cwd: value, lastCommand: null } : { cwd: value });
  };

  // exit_code arrives before every prompt — signals command done and captures exit status.
  callbacksRef.current.onExitCode = (value) => {
    const code = Number(value);
    setExitCode(code);
    callbacksRef.current.currentExitCode = code;
    callbacksRef.current.onExitCodeDecoration?.(code);
    if (code === 0 && pendingCommandRef.current)
      pushHistory(pendingCommandRef.current);
    if (code === 0) setBanner(null);
    pendingCommandRef.current = null;
    setRunning(false);
    setPaneInfo(paneId, { runningCommand: null });
    setTimeout(() => {
      inputBarRef.current?.focus();
      // Send the just-completed command + output to the backend for AI suggestion.
      const entry = callbacksRef.current.getLastEntry?.();
      if (entry) sendAIAppend(entry);
    }, 0);
  };

  callbacksRef.current.onAISuggestion = (cmd) => {
    inputBarRef.current?.setSuggestion(cmd);
  };
  callbacksRef.current.onAISuggestError = () => {};
  callbacksRef.current.onAIBannerStart = (type) => {
    if (type === 'error' && !prefs.aiExplainErrors) return;
    if (type === 'info'  && !prefs.aiDirectoryContext) return;
    setBanner({ text: '', type });
  };
  callbacksRef.current.onAIBannerToken = (token) => setBanner(prev => prev ? { ...prev, text: prev.text + token } : null);
  callbacksRef.current.onAIBannerCancel = () => setBanner(null);
  callbacksRef.current.onDismissExplanation = () => setBanner(null);

  callbacksRef.current.onGit = (data) => {
    setGitData(data);
    callbacksRef.current.onGitDecoration?.(data);
  };

  callbacksRef.current.onNode = (data) => {
    setNodeData(data);
    callbacksRef.current.onNodeDecoration?.(data);
  };

  callbacksRef.current.onGo = (data) => {
    setGoData(data);
    callbacksRef.current.onGoDecoration?.(data);
  };

  callbacksRef.current.onPython = (data) => {
    setPythonData(data);
    callbacksRef.current.onPythonDecoration?.(data);
  };

  callbacksRef.current.onDocker = (data) => {
    setDockerData(data);
    callbacksRef.current.onDockerDecoration?.(data);
  };

  callbacksRef.current.onK8s = (data) => {
    setK8sData(data);
    callbacksRef.current.onK8sDecoration?.(data);
  };

  callbacksRef.current.onRust    = (data) => { setRustData(data);    callbacksRef.current.onRustDecoration?.(data); };
  callbacksRef.current.onPhp     = (data) => { setPhpData(data);     callbacksRef.current.onPhpDecoration?.(data); };
  callbacksRef.current.onJava    = (data) => { setJavaData(data);    callbacksRef.current.onJavaDecoration?.(data); };
  callbacksRef.current.onKotlin  = (data) => { setKotlinData(data);  callbacksRef.current.onKotlinDecoration?.(data); };
  callbacksRef.current.onHaskell = (data) => { setHaskellData(data); callbacksRef.current.onHaskellDecoration?.(data); };
  callbacksRef.current.onC       = (data) => { setCData(data);       callbacksRef.current.onCDecoration?.(data); };
  callbacksRef.current.onConda   = (data) => { setCondaData(data);   callbacksRef.current.onCondaDecoration?.(data); };

  const handleSubmit = useCallback(
    (command) => {
      setBanner(null);
      const trimmed = command.trim();
      pendingCommandRef.current = trimmed;
      sendInput(command);
      setRunning(true);
      // Navigation commands (cd/pushd/popd) shouldn't become the tab title —
      // onCwd will clear lastCommand and the folder fallback takes over.
      const firstTok = trimmed.split(/\s+/)[0];
      const isNav = firstTok === "cd" || firstTok === "pushd" || firstTok === "popd";
      setPaneInfo(
        paneId,
        isNav
          ? { runningCommand: trimmed }
          : { runningCommand: trimmed, lastCommand: trimmed },
      );
      callbacksRef.current.focusTerm?.();
    },
    [sendInput, paneId],
  );

  function handleMouseDown() {
    if (!runningRef.current) setTimeout(() => inputBarRef.current?.focus(), 0);
  }

  // Per-pane slash command context. Each method is a thin adapter over
  // existing pane / app callbacks. Terminal-level methods (clearScrollback,
  // copyLastOutput) are resolved from callbacksRef at call time because
  // OutputArea attaches them after xterm boots.
  const commandContext = useMemo(
    () => ({
      paneId,
      splitPane: (direction) =>
        direction === "vertical" ? onSplitDown?.() : onSplitRight?.(),
      closePane: () => onClose?.(),
      newTab: () => onNewTab?.(),
      toggleTabPosition: () => onToggleTabPosition?.(),
      clearScrollback: () => callbacksRef.current.clearScrollback?.(),
      copyLastOutput: () => callbacksRef.current.copyLastOutput?.(),
    }),
    [paneId, onSplitRight, onSplitDown, onClose, onNewTab, onToggleTabPosition],
  );

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      onClick={onFocus}
      onMouseDown={handleMouseDown}
    >
      <OutputArea
        callbacksRef={callbacksRef}
        sendRaw={sendRaw}
        sendResize={sendResize}
        onReplay={handleSubmit}
        isActive={isActive}
        isVisible={isVisible}
        tabAccent={tabAccent}
      />

      {banner?.text && (
        <ExplanationPanel
          text={banner.text}
          type={banner.type}
          onDismiss={() => setBanner(null)}
        />
      )}
      {!running && (
        <InputBar
          ref={inputBarRef}
          onSubmit={handleSubmit}
          onNavigateHistory={navigateHistory}
          resetNavigation={resetNavigation}
          getHistory={getHistory}
          isNavigatingHistory={isNavigatingHistory}
          commandContext={commandContext}
          onDismissExplanation={() => setBanner(null)}
          cwd={cwd}
          exitCode={exitCode}
          gitData={gitData}
          onGitClick={() => handleSubmit("git status")}
          nodeData={nodeData}
          onNodeClick={() =>
            handleSubmit(`${nodeData?.packageManager ?? "npm"} run`)
          }
          goData={goData}
          onGoClick={() => handleSubmit("go version")}
          pythonData={pythonData}
          onPythonClick={() => handleSubmit("python3 --version")}
          dockerData={dockerData}
          onDockerClick={() =>
            handleSubmit(dockerData?.kind === "compose" ? "docker compose ps" : "docker ps")
          }
          k8sData={k8sData}
          onK8sClick={() => handleSubmit("kubectl get pods")}
          rustData={rustData}
          onRustClick={() => handleSubmit("cargo --version")}
          phpData={phpData}
          onPhpClick={() => handleSubmit("php --version")}
          javaData={javaData}
          onJavaClick={() => handleSubmit("java --version")}
          kotlinData={kotlinData}
          onKotlinClick={() => handleSubmit("kotlinc -version")}
          haskellData={haskellData}
          onHaskellClick={() => handleSubmit("ghc --version")}
          cData={cData}
          onCClick={() => handleSubmit("gcc --version")}
          condaData={condaData}
          onCondaClick={() => handleSubmit("conda info")}
        />
      )}
    </div>
  );
}
