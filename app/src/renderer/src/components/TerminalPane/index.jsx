import { useRef, useState, useCallback, useMemo } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import { useSharedHistory } from "../../hooks/useSharedHistory";
import { setPaneInfo } from "../../hooks/usePaneInfo";
import OutputArea from "../OutputArea";
import InputBar from "../InputBar";

export default function TerminalPane({
  paneId,
  isActive,
  isVisible,
  onFocus,
  onSplitRight,
  onSplitDown,
  onClose,
  onNewTab,
  onToggleTabPosition,
}) {
  const callbacksRef = useRef({});
  const { sendInput, sendRaw, sendResize } = useTerminal(paneId, callbacksRef);
  const {
    push: pushHistory,
    navigate: navigateHistory,
    getAll: getHistory,
    isNavigating: isNavigatingHistory,
  } = useSharedHistory();
  const [running, setRunning] = useState(false);
  const [cwd, setCwd] = useState("");
  const [exitCode, setExitCode] = useState(0);
  const [gitData, setGitData] = useState(null);
  const [nodeData, setNodeData] = useState(null);
  const [goData, setGoData] = useState(null);
  const [pythonData, setPythonData] = useState(null);
  const [dockerData, setDockerData] = useState(null);
  const [k8sData, setK8sData] = useState(null);
  const inputBarRef = useRef(null);
  const runningRef = useRef(false);
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
      // Reset all env segments on directory change; detectors re-populate for the new dir.
      setGitData(null);
      setNodeData(null);
      setGoData(null);
      setPythonData(null);
      setDockerData(null);
      setK8sData(null);
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
    pendingCommandRef.current = null;
    setRunning(false);
    setPaneInfo(paneId, { runningCommand: null });
    setTimeout(() => inputBarRef.current?.focus(), 0);
  };

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

  const handleSubmit = useCallback(
    (command) => {
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
      />

      {!running && (
        <InputBar
          ref={inputBarRef}
          onSubmit={handleSubmit}
          onNavigateHistory={navigateHistory}
          getHistory={getHistory}
          isNavigatingHistory={isNavigatingHistory}
          commandContext={commandContext}
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
        />
      )}
    </div>
  );
}
