import { useRef, useState, useCallback } from "react";
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
}) {
  const callbacksRef = useRef({});
  const { sendInput, sendRaw, sendResize } = useTerminal(paneId, callbacksRef);
  const {
    push: pushHistory,
    navigate: navigateHistory,
    getAll: getHistory,
  } = useSharedHistory();
  const [running, setRunning] = useState(false);
  const [cwd, setCwd] = useState("");
  const [exitCode, setExitCode] = useState(0);
  const [gitData, setGitData] = useState(null);
  const [nodeData, setNodeData] = useState(null);
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
      setGitData(null); // Reset on directory change; onGit re-populates if new dir is a git repo
      setNodeData(null); // Reset on directory change; onNode re-populates if new dir has package.json
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
          onGitClick={() => handleSubmit("git status")}
          nodeData={nodeData}
          onNodeClick={() =>
            handleSubmit(`${nodeData?.packageManager ?? "npm"} run`)
          }
        />
      )}
    </div>
  );
}
