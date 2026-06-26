import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useTerminal } from "../../hooks/useTerminal";
import { useSharedHistory } from "../../hooks/useSharedHistory";
import { setPaneInfo } from "../../hooks/usePaneInfo";
import { usePreferences } from "../../hooks/usePreferences";
import { registerCopy, unregisterCopy } from "../../hooks/paneCopyRegistry";
import { registerFocus, unregisterFocus } from "../../hooks/paneFocusRegistry";
import OutputArea from "../OutputArea";
import InputBar from "../InputBar";
import NLCommandPanel from "../NLCommandPanel";
import SaveShortcutPopover from "../SaveShortcutPopover";
import ExplanationPanel from "../ExplanationPanel";
import AnalysisPanel from "../AnalysisPanel";
import AnalysisLoadingBar from "../AnalysisPanel/LoadingBar";
import KeyBadge from "../KeyBadge";
import Tooltip from "../Tooltip";

export default function TerminalPane({
  paneId,
  isActive,
  isVisible,
  tabAccent,
  initialCwd,
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
  const { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendSummarize, sendAsk, sendNLQuery } = useTerminal(paneId, callbacksRef, initialCwd);
  const {
    push: pushHistory,
    navigate: navigateHistory,
    getAll: getHistory,
    isNavigating: isNavigatingHistory,
    resetNavigation,
  } = useSharedHistory();
  const [running, setRunning] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const interactiveRef = useRef(false);
  const [fileListOpen, setFileListOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [portsOpen, setPortsOpen] = useState(false);
  const [customList, setCustomList] = useState(null); // { title, items } | null
  const [previewFile, setPreviewFile] = useState(null); // file path | null
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null); // { title, items, action } | null
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [bannerThinkingMsg, setBannerThinkingMsg] = useState(null);
  const [hasCommands, setHasCommands] = useState(false)
  const [askOpen, setAskOpen] = useState(false);
  const [askMessages, setAskMessages] = useState([]); // [{ role, content, streaming?, error? }]
  const [banner, setBanner] = useState(null); // { text: string, type: 'error'|'info'|'warning'|'suggestion' }
  const [saveCommand, setSaveCommand] = useState(null); // command string when popover open
  const [nlMode, setNlMode] = useState(false);
  const [nlPanel, setNlPanel] = useState(null); // null = closed; { query, command, loading, error }
  const [nlSuccessCount, setNlSuccessCount] = useState(() => {
    return parseInt(localStorage.getItem('jebi:nlSuccessCount') ?? '0', 10);
  });
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
    if (!analysisLoading) return;
    const timer = setTimeout(() => setAnalysisLoading(false), 12000);
    return () => clearTimeout(timer);
  }, [analysisLoading]);

  useEffect(() => {
    registerCopy(paneId, () => callbacksRef.current.copySelection?.())
    return () => unregisterCopy(paneId)
  }, [paneId])

  useEffect(() => {
    registerFocus(paneId, () => {
      if (interactiveRef.current) {
        callbacksRef.current.focusTerm?.()
      } else {
        inputBarRef.current?.focus()
      }
    })
    return () => unregisterFocus(paneId)
  }, [paneId])

  useEffect(() => {
    if (!isActive) return
    setTimeout(() => {
      if (interactiveRef.current) {
        callbacksRef.current.focusTerm?.()
      } else {
        inputBarRef.current?.focus()
      }
    }, 0)
  }, [isActive])
  // pendingCommandRef holds the command that was just submitted but whose exit
  // code hasn't arrived yet. The OSC 9001 exit-code signal fires asynchronously
  // after the prompt re-appears, so we can't rely on React state to correlate
  // which command finished. On exit_code=0 we push this to history; on any
  // code we clear it so we never add stale commands on the next success.
  const pendingCommandRef = useRef(null);

  runningRef.current = running;

  callbacksRef.current.isRunning = () => runningRef.current;
  callbacksRef.current.isInteractive = () => interactiveRef.current;
  callbacksRef.current.focusInput = () => inputBarRef.current?.focus();
  callbacksRef.current.onFirstOutput = () => setHasCommands(true);
  callbacksRef.current.onInteractiveEnter = () => {
    setInteractive(true);
    interactiveRef.current = true;
  };
  callbacksRef.current.onInteractiveExit = () => {
    setInteractive(false);
    interactiveRef.current = false;
  };

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
    if (pendingCommandRef.current)
      pushHistory(pendingCommandRef.current, code);
    if (code === 0) setBanner(null);
    pendingCommandRef.current = null;
    setRunning(false);
    setInteractive(false);
    interactiveRef.current = false;
    setPaneInfo(paneId, { runningCommand: null });
    setTimeout(() => {
      inputBarRef.current?.focus();
      const entry = callbacksRef.current.getLastEntry?.();
      if (entry && prefs.aiCommandSuggestions !== false) {
        setAiSuggestions([]);
        sendAIAppend(entry);
      }
      const analysisEntry = callbacksRef.current.getLastEntryForAnalysis?.();
      if (analysisEntry && prefs.aiOutputAnalysis) {
        const lineCount = analysisEntry.output.split('\n').length;
        const charCount = analysisEntry.output.length;
        if (lineCount >= 10 || charCount >= 500) {
          setAnalysisResult(null);
          sendAIAnalyze({ ...analysisEntry, cwd: callbacksRef.current.currentCwd ?? '' });
        }
      }
    }, 0);
  };

  callbacksRef.current.onAISuggestion = (cmds) => {
    const clean = (cmds || []).filter(c => c && c.replace(/`/g, '').trim().length > 1);
    setAiSuggestions(clean);
  };
  callbacksRef.current.onAISuggestError = () => { setAiSuggestions([]); };
  callbacksRef.current.onAIAnalysis = (result) => { setAnalysisLoading(false); setAnalysisResult(result); };
  callbacksRef.current.onAIBannerStart = (type) => {
    if (type === 'error' && !prefs.aiExplainErrors) return;
    if (type === 'info'  && !prefs.aiDirectoryContext) return;
    setBanner({ text: '', type });
    if (type === 'error') {
      const msgs = [
        'Reading error…', 'Checking what went wrong…', 'Investigating the failure…',
        'Diagnosing the issue…', 'Tracing the problem…', 'Examining the output…',
      ];
      setBannerThinkingMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    } else if (type === 'summary') {
      setAnalysisLoading(false);
      setBannerThinkingMsg('Summarizing session…');
    } else {
      setBannerThinkingMsg(null);
    }
  };
  callbacksRef.current.onAIBannerToken = (token) => {
    setBannerThinkingMsg(null);
    setBanner(prev => prev ? { ...prev, text: prev.text + token } : null);
  };
  callbacksRef.current.onAIBannerCancel = () => { setBanner(null); setBannerThinkingMsg(null); };
  callbacksRef.current.onDismissExplanation = () => setBanner(null);
  callbacksRef.current.onDismissSuggestions = () => setAiSuggestions([]);

  callbacksRef.current.onNLModeChange = (active) => {
    setNlMode(active);
  };

  callbacksRef.current.onNLSubmit = (query) => {
    setNlPanel({ query, command: null, loading: true, error: null });
    sendNLQuery(query, callbacksRef.current.currentCwd ?? '');
  };

  callbacksRef.current.onNLResult = (command) => {
    setNlPanel(prev => prev ? { ...prev, command, loading: false, error: null } : null);
  };

  callbacksRef.current.onNLError = () => {
    setNlPanel(prev => prev ? { ...prev, loading: false, error: 'No relevant command found for this query !' } : null);
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

  callbacksRef.current.onRust    = (data) => { setRustData(data);    callbacksRef.current.onRustDecoration?.(data); };
  callbacksRef.current.onPhp     = (data) => { setPhpData(data);     callbacksRef.current.onPhpDecoration?.(data); };
  callbacksRef.current.onJava    = (data) => { setJavaData(data);    callbacksRef.current.onJavaDecoration?.(data); };
  callbacksRef.current.onKotlin  = (data) => { setKotlinData(data);  callbacksRef.current.onKotlinDecoration?.(data); };
  callbacksRef.current.onHaskell = (data) => { setHaskellData(data); callbacksRef.current.onHaskellDecoration?.(data); };
  callbacksRef.current.onC       = (data) => { setCData(data);       callbacksRef.current.onCDecoration?.(data); };
  callbacksRef.current.onConda   = (data) => { setCondaData(data);   callbacksRef.current.onCondaDecoration?.(data); };

  const clearScreen = useCallback(() => {
    setBanner(null);
    setAiSuggestions([]);
    setHasCommands(false);
    callbacksRef.current.clearScreen?.();
    setTimeout(() => inputBarRef.current?.focus(), 0);
  }, []);

  const handleSubmit = useCallback(
    (command) => {
      setBanner(null);
      setAiSuggestions([]);
      const trimmed = command.trim();
      setHasCommands(true);
      if (trimmed === 'clear') {
        clearScreen();
        return;
      }
      pendingCommandRef.current = trimmed;
      setRunning(true);
      setAnalysisResult(null);
      setAnalysisLoading(false);
      setBannerThinkingMsg(null);
      runningRef.current = true;
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

      requestAnimationFrame(() => {
        callbacksRef.current.scrollToBottom?.();
        sendInput(command);
        callbacksRef.current.focusTerm?.();
      });
    },
    [sendInput, paneId, clearScreen],
  );

  function handleMouseDown() {
    if (!interactiveRef.current) setTimeout(() => inputBarRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        clearScreen();
      }
      if (e.metaKey && e.key === 'r') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, clearScreen]);

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
      runCommand: (cmd) => handleSubmit(cmd),
      openCustomList: (data) => setCustomList(
        data.itemsFrom ? { ...data, cwd: callbacksRef.current.currentCwd ?? '' } : data
      ),
      openFileList: () => setFileListOpen(true),
      openHistory: () => setHistoryOpen(true),
      openRun: () => setRunOpen(true),
      openPorts: () => setPortsOpen(true),
      openAsk: () => { setAskMessages([]); setAskOpen(true) },
      summarize: () => {
        if (getHistory().length === 0) {
          setBanner({ text: 'No commands to summarize yet. Run some commands first, then try /summarize.', type: 'info' });
          return;
        }
        setBanner(null); setBannerThinkingMsg(null); setAnalysisLoading(true); sendSummarize();
      },
      clearScrollback: () => callbacksRef.current.clearScrollback?.(),
      copyLastOutput: () => callbacksRef.current.copyLastOutput?.(),
      saveLastCommand: () => {
        const entry = callbacksRef.current.getLastEntry?.()
        if (entry?.command) setSaveCommand(entry.command)
      },
    }),
    [paneId, onSplitRight, onSplitDown, onClose, onNewTab, onToggleTabPosition],
  );

  callbacksRef.current.fileListOpen = fileListOpen || historyOpen || runOpen || slashOpen || portsOpen || !!customList || !!previewFile || askOpen || !!saveCommand;

  callbacksRef.current.onAskChunk = (token) => {
    setAskMessages((prev) => {
      const msgs = [...prev]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + token }
      }
      return msgs
    })
  }
  callbacksRef.current.onAskDone = () => {
    setAskMessages((prev) => {
      const msgs = [...prev]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        msgs[msgs.length - 1] = { ...last, streaming: false }
      }
      return msgs
    })
  }
  callbacksRef.current.onAskError = (err) => {
    setAskMessages((prev) => {
      const msgs = [...prev]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        msgs[msgs.length - 1] = { role: 'assistant', content: err || 'AI not available', error: true }
      } else {
        msgs.push({ role: 'assistant', content: err || 'AI not available', error: true })
      }
      return msgs
    })
  }

  const handleFileListSelect = useCallback((entry) => {
    setFileListOpen(false)
    const q = (s) => `'${s.replace(/'/g, "'\\''")}'`
    const target = entry.fullPath ?? entry.name
    handleSubmit(`cd ${q(target)}`)
  }, [handleSubmit])

  const pickSuggestion = useCallback((i) => {
    if (!isActive || aiSuggestions.length <= i) return
    const cmd = aiSuggestions[i]
    setAiSuggestions([])
    handleSubmit(cmd)
  }, [isActive, aiSuggestions, handleSubmit])

  useKeyboardShortcuts({
    'Meta+Alt+1': () => pickSuggestion(0),
    'Meta+Alt+2': () => pickSuggestion(1),
    'Meta+Alt+3': () => pickSuggestion(2),
    'Meta+Shift+Period': () => {
      if (!isActive) return;
      const current = inputBarRef.current;
      if (!current) return;
      if (nlMode) {
        setNlMode(false);
        current.setValue('');
      } else {
        setNlMode(true);
        current.setValue('');
      }
      current.focus();
    },
  })

  const handleFilePreview = useCallback((entry) => {
    setFileListOpen(false)
    setPreviewFile(entry.fullPath ?? entry.name)
  }, [])

  const handleHistorySelect = useCallback((command) => {
    setHistoryOpen(false)
    setTimeout(() => { inputBarRef.current?.setValue(command); inputBarRef.current?.focus() }, 0)
  }, [])

  const handleRunSelect = useCallback((command) => {
    setRunOpen(false)
    handleSubmit(command)
  }, [handleSubmit])

  const handleCustomListSelect = useCallback((item) => {
    setCustomList(null)
    handleSubmit(item.command)
  }, [handleSubmit])

  const handlePortsSelect = useCallback((entry) => {
    setPortsOpen(false)
    handleSubmit(`lsof -p ${entry.pid}`)
  }, [handleSubmit])

  const handlePortsKill = useCallback((entry) => {
    setPortsOpen(false)
    handleSubmit(`kill ${entry.pid}`)
  }, [handleSubmit])

  const handleSlashChange = useCallback((query) => {
    if (query === null) {
      setSlashOpen(false)
      setSlashQuery('')
    } else {
      setSlashOpen(true)
      setSlashQuery(query)
    }
  }, [])

  const handleSlashSelect = useCallback((cmd) => {
    setSlashOpen(false)
    setSlashQuery('')
    setTimeout(() => {
      inputBarRef.current?.setValue('')
      inputBarRef.current?.focus()
    }, 0)
    cmd.run(commandContext)
  }, [commandContext])

  const handleSlashClose = useCallback(() => {
    setSlashOpen(false)
    setSlashQuery('')
    setTimeout(() => {
      inputBarRef.current?.setValue('')
      inputBarRef.current?.focus()
    }, 0)
  }, [])

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      style={tabAccent ? { '--accent': tabAccent, '--prompt-cwd-tint': tabAccent } : undefined}
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
        fileListOpen={fileListOpen}
        fileListCwd={cwd}
        onFileListSelect={handleFileListSelect}
        onFileListPreview={handleFilePreview}
        onFileListClose={() => setFileListOpen(false)}
        previewFile={previewFile}
        onPreviewClose={() => setPreviewFile(null)}
        historyOpen={historyOpen}
        history={getHistory()}
        onHistorySelect={handleHistorySelect}
        onHistoryClose={() => setHistoryOpen(false)}
        runOpen={runOpen}
        runCwd={cwd}
        onRunSelect={handleRunSelect}
        onRunClose={() => setRunOpen(false)}
        slashOpen={slashOpen}
        slashQuery={slashQuery}
        onSlashSelect={handleSlashSelect}
        onSlashClose={handleSlashClose}
        portsOpen={portsOpen}
        onPortsSelect={handlePortsSelect}
        onPortsKill={handlePortsKill}
        onPortsClose={() => setPortsOpen(false)}
        customList={customList}
        onCustomListSelect={handleCustomListSelect}
        onCustomListClose={() => setCustomList(null)}
        hasCommands={hasCommands}
        onSaveShortcut={(cmd) => setSaveCommand(cmd)}
        askOpen={askOpen}
        askMessages={askMessages}
        onAskSend={(history, query) => {
          setAskMessages((prev) => [
            ...prev,
            { role: 'user', content: query },
            { role: 'assistant', content: '', streaming: true },
          ])
          sendAsk(history, query)
        }}
        onAskClose={() => { setAskOpen(false); setTimeout(() => inputBarRef.current?.focus(), 0) }}
      />

      {bannerThinkingMsg && !banner?.text && (
        <AnalysisLoadingBar message={bannerThinkingMsg} />
      )}
      {banner?.text && (
        <ExplanationPanel
          text={banner.text}
          type={banner.type}
          onDismiss={() => { setBanner(null); setBannerThinkingMsg(null); }}
        />
      )}
      {analysisLoading && !running && !analysisResult && (
        <AnalysisLoadingBar message="Summarizing…" />
      )}
      {analysisResult && !running && analysisResult.title?.trim() && (analysisResult.items || []).some(i => i.text?.trim()) && (
        <AnalysisPanel
          result={analysisResult}
          exitCode={exitCode}
          onDismiss={() => setAnalysisResult(null)}
          onAction={(cmd) => { setAnalysisResult(null); handleSubmit(cmd); }}
        />
      )}
      {aiSuggestions.length > 0 && !running && (
        <div style={{
          borderTop: '1px solid color-mix(in srgb, var(--tab-accent) 30%, transparent)',
          borderLeft: '5px solid var(--tab-accent)',
          background: 'color-mix(in srgb, var(--tab-accent) 7%, var(--bg-surface))',
          animation: 'bannerSlideIn 0.2s ease-out',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-mono)',
          userSelect: 'none',
          marginBottom: -8,
          position: 'relative',
          zIndex: 100,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px 0' }}>
            {/* <span style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              color: 'var(--tab-accent)', letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="13" height="13">
                <polygon points="78,159 181,96 434,96 331,159" fill="currentColor"/>
                <polygon points="331,159 434,96 434,354 331,417" fill="currentColor" opacity="0.6"/>
                <polygon points="78,159 331,159 331,417 78,417" fill="#060a12"/>
                <polyline points="126,247 172,288 126,330" fill="none" stroke="currentColor" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                <rect x="186" y="310" width="83" height="16" rx="4" fill="white" opacity=".85"/>
              </svg>
              What's next?
            </span> */}
          </div>
          {/* List */}
          <div style={{ padding: '0px 12px 9px 5px', lineHeight: 1.65, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0, overflow: 'visible' }}>
            {aiSuggestions.map((cmd, i) => (
              <>
                <Tooltip key={i} text={<span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span>{cmd}</span><span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>click to run</span></span>} placement="top">
                <div
                  onClick={() => { setAiSuggestions([]); handleSubmit(cmd); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    margin: '4px',
                    borderRadius: 6,
                    border: '1px solid var(--tab-accent)',
                    minWidth: 0,
                    maxWidth: 280,
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <KeyBadge
                    keys={['cmd', 'opt', String(i + 1)]}
                    style={{ color: 'var(--tab-accent)', borderColor: 'color-mix(in srgb, var(--tab-accent) 40%, transparent)', flexShrink: 0 }}
                  />
                  <span style={{
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    marginRight: 3,
                    marginTop: 2,
                    marginLeft: -5,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>{cmd}</span>
                </div>
                </Tooltip>
              </>
            ))}
          </div>
        </div>
      )}
      {nlPanel && (
        <NLCommandPanel
          query={nlPanel.query}
          command={nlPanel.command}
          loading={nlPanel.loading}
          error={nlPanel.error}
          onAccept={(cmd) => {
            setNlPanel(null);
            setNlMode(false);
            setNlSuccessCount(prev => {
              const next = prev + 1;
              localStorage.setItem('jebi:nlSuccessCount', String(next));
              return next;
            });
            setTimeout(() => {
              inputBarRef.current?.setValue(cmd);
              inputBarRef.current?.focus();
            }, 0);
          }}
          onCancel={() => {
            const query = nlPanel.query;
            setNlPanel(null);
            // Keep NL mode active — user stays in AI input mode
            setTimeout(() => {
              inputBarRef.current?.setValue(query);
              inputBarRef.current?.focus();
            }, 0);
          }}
          onRetry={() => {
            const query = nlPanel.query;
            setNlPanel({ query, command: null, loading: true, error: null });
            sendNLQuery(query, callbacksRef.current.currentCwd ?? '');
          }}
        />
      )}
      {!running && !fileListOpen && !historyOpen && !runOpen && !portsOpen && !customList && !previewFile && !askOpen && (
        <InputBar
          ref={inputBarRef}
          onSubmit={handleSubmit}
          onSlashChange={handleSlashChange}
          onNLModeChange={(active) => setNlMode(active)}
          onNLSubmit={(query) => callbacksRef.current.onNLSubmit?.(query)}
          nlMode={nlMode}
          nlSuccessCount={nlSuccessCount}
          aiSuggestions={aiSuggestions}
          onSuggestionPick={(cmd) => { setAiSuggestions([]); handleSubmit(cmd); }}
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
      {saveCommand && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
        }} onClick={() => setSaveCommand(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <SaveShortcutPopover
              command={saveCommand}
              onClose={() => setSaveCommand(null)}
              onAliasSourced={(rcFile) => {
                setSaveCommand(null)
                handleSubmit(`source ${rcFile}`)
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
