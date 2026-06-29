import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { PromptAddon } from "../../addons/PromptAddon";
import Prompt from "../Prompt";
import FileListPanel from "../FileListPanel";
import FilePreviewPanel from "../FilePreviewPanel";
import HistoryPanel from "../HistoryPanel";
import RunPanel from "../RunPanel";
import SlashCommandPanel from "../SlashCommandPanel";
import PortsPanel from "../PortsPanel";
import CustomListPanel from "../CustomListPanel";
import AskPanel from "../AskPanel";
import { usePreferences } from "../../hooks/usePreferences";
import { showStatusMessage } from "../../hooks/useStatusMessage";
import EmptyState from "./EmptyState";

const BUFFER_CAP = 512 * 1024; // 512 KB

function searchOpts(accent, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
  return {
    caseSensitive,
    wholeWord,
    regex,
    decorations: {
      matchBackground:               accent + '30',
      matchBorder:                   accent + '90',
      matchOverviewRuler:            accent + '90',
      activeMatchBackground:         accent + '70',
      activeMatchBorder:             accent,
      activeMatchColorOverviewRuler: accent,
    },
  };
}

// Alternate screen enter/exit — emitted by TUI apps (vim, micro, htop, etc.)
const TUI_ENTER = "\x1b[?1049h";
const TUI_EXIT = "\x1b[?1049l";

function SearchToggle({ label, title, active, disabled, onToggle }) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onToggle}
      disabled={disabled}
      title={title}
      style={{
        background: active ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : 'transparent'}`,
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-muted)' : active ? 'var(--accent)' : 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
        padding: '1px 5px',
        lineHeight: '16px',
        opacity: disabled ? 0.4 : 1,
        userSelect: 'none',
      }}
    >
      {label}
    </button>
  );
}


export default function OutputArea({
  callbacksRef,
  sendRaw,
  sendResize,
  onReplay,
  isActive,
  isVisible,
  tabAccent = '#f43f5e',
  fileListOpen = false,
  fileListCwd = '',
  onFileListSelect,
  onFileListPreview,
  onFileListClose,
  previewFile = null,
  onPreviewClose,
  historyOpen = false,
  history = [],
  onHistorySelect,
  onHistoryClose,
  runOpen = false,
  runCwd = '',
  onRunSelect,
  onRunClose,
  slashOpen = false,
  slashQuery = '',
  onSlashSelect,
  onSlashClose,
  portsOpen = false,
  onPortsSelect,
  onPortsKill,
  onPortsClose,
  customList = null,
  onCustomListSelect,
  onCustomListClose,
  askOpen = false,
  askMessages = [],
  onAskSend,
  onAskClose,
  hasCommands = false,
  onSaveShortcut,
}) {
  const { prefs, activeColors } = usePreferences();
  const rootRef = useRef(null);
  const xtermContainerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const promptAddonRef = useRef(null);
  const cellHeightRef = useRef(28);
  const sendResizeRef = useRef(sendResize);
  const onReplayRef = useRef(onReplay);
  const tabAccentRef = useRef(tabAccent);
  tabAccentRef.current = tabAccent;
  const pendingRef = useRef([]);
  const pendingSizeRef = useRef(0);
  const isVisibleRef = useRef(isVisible);
  const fitFrameRef = useRef(null);
  const rendererAddonRef = useRef(null);

  const [stickyCommand, setStickyCommand] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [regexError, setRegexError] = useState(false);
  const searchAddonRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchOpenRef = useRef(false);
  searchOpenRef.current = searchOpen;

  sendResizeRef.current = sendResize;
  onReplayRef.current = onReplay;

  // When the tab becomes visible, flush buffered output, refit, and scroll to bottom.
  useEffect(() => {
    isVisibleRef.current = isVisible;
    if (!isVisible) return;
    const term = termRef.current;
    if (!term) return;
    if (pendingRef.current.length > 0) {
      term.write(pendingRef.current.join(""), () => term.scrollToBottom());
      pendingRef.current = [];
      pendingSizeRef.current = 0;
    }
    fitAddonRef.current?.fit();
    term.scrollToBottom();
  }, [isVisible]);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const cssVar = (name) => style.getPropertyValue(name).trim();
    const fontFamily = cssVar("--font-mono");
    const fontSize = parseInt(cssVar("--font-size-mono")) || 15;
    let disposed = false;
    let cleanup = () => {};

    // Wait for the font to be fully loaded before xterm measures cell dimensions.
    // Without this, xterm may initialise with a fallback font and get wrong cell sizes,
    // causing wrong cell metrics and prompt row misalignment.
    document.fonts.load(`${fontSize}px ${fontFamily}`).then(() => {
      if (disposed) return;

      const term = new Terminal({
        fontFamily,
        fontSize,
        lineHeight: 1.0,
        letterSpacing: 0,
        customGlyphs: true,
        theme: {
          background: cssVar("--bg-surface"),
          foreground: cssVar("--text-primary"),
          cursor: cssVar("--accent"),
          selectionBackground: tabAccentRef.current + "40",
          selectionForeground: cssVar("--text-primary"),
          selectionInactiveBackground: tabAccentRef.current + "25",
        },
        cursorBlink: false,
        cursorInactiveStyle: "none",
        allowProposedApi: true,
        smoothScrollDuration: 100,
        scrollback: 10000,
      });

      const unicode11Addon = new Unicode11Addon();
      term.loadAddon(unicode11Addon);
      term.unicode.activeVersion = '11';

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon((_, uri) => {
        window.electron.openExternal(uri);
      });
      const promptAddon = new PromptAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.loadAddon(webLinksAddon);
      searchAddonRef.current = searchAddon;
      // Ensure term is always disposed even if the rAF below never fires
      // (component unmounted before the next frame).
      cleanup = () => term.dispose();
      term.loadAddon(promptAddon);
      promptAddonRef.current = promptAddon;
      promptAddon.setOnReplay((command) => onReplayRef.current?.(command));
      promptAddon.setOnSave((command) => onSaveShortcut?.(command));

      term.onSelectionChange(() => {
        if (promptAddonRef.current?._tuiActive) return;
        const sel = term.getSelection();
        if (!sel) return;
        navigator.clipboard.writeText(sel).then(() => showStatusMessage('copied selected text to clipboard !'));
      });

      term.onData((data) => {
        // Strip focus-in/out events (\x1b[I / \x1b[O) — these leak to the shell
        // when an interactive app enables focus reporting and exits without disabling it.
        const clean = data.replace(/\x1b\[I|\x1b\[O/g, '');
        if (clean) sendRaw(clean);
        term.scrollToBottom();
      });
      term.onResize(({ cols, rows }) => sendResizeRef.current?.(cols, rows));

      const scheduleFit = () => {
        if (fitFrameRef.current != null) {
          cancelAnimationFrame(fitFrameRef.current);
        }
        fitFrameRef.current = requestAnimationFrame(() => {
          fitFrameRef.current = requestAnimationFrame(() => {
            fitFrameRef.current = null;
            fitAddon.fit();
            term.refresh(0, term.rows - 1);

          });
        });
      };

      // Defer open() + fit() to the next animation frame so flexbox layout is
      // fully resolved before FitAddon measures the container.  Opening xterm
      // synchronously (inside fonts.load microtask) races the layout engine and
      // produces a stale column count, which TUI apps like claude use for their
      // initial render — causing garbled output until a manual resize fires SIGWINCH.
      requestAnimationFrame(() => {
        if (disposed) return;

        term.open(xtermContainerRef.current);

        // Padding on the xterm element (not the container) so FitAddon
        // subtracts it when computing column count — avoiding phantom columns.
        if (term.element) {
          term.element.style.padding = '8px 12px 0';
        }

        term.attachCustomKeyEventHandler((e) => {
          // File list panel captures all keyboard input while open.
          if (callbacksRef.current.fileListOpen) return false;
          if (e.type === "keydown" && e.metaKey && e.key === "f" && !e.shiftKey && !e.altKey) {
            callbacksRef.current.openSearch?.();
            return false;
          }
          if (e.type === "keydown" && e.metaKey && e.key === "c" && !e.shiftKey && !e.altKey) {
            const sel = term.getSelection();
            if (sel && !promptAddonRef.current?._tuiActive) {
              navigator.clipboard.writeText(sel);
              return false;
            }
          }
          // Shift+Enter: send CSI u sequence so TUI apps (e.g. Claude CLI) receive
          // a distinct code from plain Enter and can insert a newline instead of submitting.
          if (e.type === "keydown" && e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            sendRaw("\x1b[13;2u");
            return false;
          }
          if (e.type === "keydown" && !callbacksRef.current.isInteractive?.()) {
            // Always let Ctrl+C/D/Z reach the PTY so the user can cancel/suspend a running command.
            if (callbacksRef.current.isRunning?.() && e.ctrlKey &&
                (e.key === 'c' || e.key === 'd' || e.key === 'z')) {
              return true;
            }
            callbacksRef.current.focusInput?.();
            return false;
          }
          return true;
        });

        // Cmd held: underline all visible URLs; Cmd+hover: accent background; Cmd+up: clear
        const LINK_REGEX = /(https?|HTTPS?):\/\/[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~[\]`()<>]/g;
        let linkDecorations = []; // { dec, row, startCol, endCol }
        let cmdHeld = false;
        let hoveredLinkIdx = -1;

        function clearLinkDecorations() {
          linkDecorations.forEach(({ dec }) => dec.dispose());
          linkDecorations = [];
          hoveredLinkIdx = -1;
        }

        const onMouseMove = (e) => {
          if (!cmdHeld || linkDecorations.length === 0) return;
          const cellH = term._core?._renderService?.dimensions?.css?.cell?.height ?? 20;
          const cellW = term._core?._renderService?.dimensions?.css?.cell?.width ?? 10;
          // term.element has 8px top / 12px left padding applied after open()
          const col = Math.floor((e.offsetX - 12) / cellW);
          const row = Math.floor((e.offsetY - 8) / cellH);
          const newIdx = linkDecorations.findIndex(
            ({ row: r, startCol, endCol }) => r === row && col >= startCol && col < endCol
          );
          if (newIdx === hoveredLinkIdx) return;
          if (hoveredLinkIdx !== -1) {
            const old = linkDecorations[hoveredLinkIdx];
            if (old?.dec.element) old.dec.element.style.background = 'transparent';
          }
          if (newIdx !== -1) {
            const link = linkDecorations[newIdx];
            if (link?.dec.element) link.dec.element.style.background = tabAccentRef.current + '35';
          }
          hoveredLinkIdx = newIdx;
        };

        const onMetaKeyDown = (e) => {
          if (e.key !== 'Meta' || cmdHeld) return;
          if (promptAddonRef.current?._tuiActive) return;
          cmdHeld = true;
          clearLinkDecorations();
          const buf = term.buffer.active;
          const startY = buf.viewportY;
          const endY = startY + term.rows - 1;
          const accent = tabAccentRef.current;
          // registerMarker(n) offsets from cursor — compute using internal ybase
          const ybase = term._core?.buffer?.ybase ?? buf.viewportY;
          for (let y = startY; y <= endY; y++) {
            const line = buf.getLine(y);
            if (!line) continue;
            const text = line.translateToString(true);
            LINK_REGEX.lastIndex = 0;
            let match;
            while ((match = LINK_REGEX.exec(text)) !== null) {
              const marker = term.registerMarker(y - ybase - buf.cursorY);
              if (!marker) continue;
              const dec = term.registerDecoration({ marker, x: match.index, width: match[0].length });
              if (!dec) { marker.dispose(); continue; }
              dec.onRender((el) => {
                el.style.pointerEvents = 'none';
                el.style.borderBottom = '1px solid rgba(255,255,255,0.65)';
                el.style.boxSizing = 'border-box';
              });
              linkDecorations.push({ dec, row: y - startY, startCol: match.index, endCol: match.index + match[0].length });
            }
          }
          term.refresh(0, term.rows - 1);
          term.element?.addEventListener('mousemove', onMouseMove);
        };

        const onMetaKeyUp = (e) => {
          if (e.key !== 'Meta') return;
          cmdHeld = false;
          term.element?.removeEventListener('mousemove', onMouseMove);
          clearLinkDecorations();
        };

        window.addEventListener('keydown', onMetaKeyDown);
        window.addEventListener('keyup', onMetaKeyUp);

        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          webgl.dispose();
          rendererAddonRef.current = null;
          try {
            const canvas = new CanvasAddon();
            term.loadAddon(canvas);
            rendererAddonRef.current = canvas;
          } catch {
            // DOM renderer fallback
          }
        });
        try {
          term.loadAddon(webgl);
          rendererAddonRef.current = webgl;
        } catch {
          try {
            const canvas = new CanvasAddon();
            term.loadAddon(canvas);
            rendererAddonRef.current = canvas;
          } catch {
            // DOM renderer fallback
          }
        }

        scheduleFit();
        if (term.rows <= 2) term.resize(term.cols, 24);

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Expose a fit trigger so useTerminal can re-fit when the WebSocket
        // opens — by then the layout is definitely settled.
        callbacksRef.current.triggerFit = () => scheduleFit();

        const observer = new ResizeObserver(() => scheduleFit());
        observer.observe(xtermContainerRef.current);

        cleanup = () => {
          observer.disconnect();
          if (fitFrameRef.current != null) cancelAnimationFrame(fitFrameRef.current);
          window.removeEventListener('keydown', onMetaKeyDown);
          window.removeEventListener('keyup', onMetaKeyUp);
          term.element?.removeEventListener('mousemove', onMouseMove);
          clearLinkDecorations();
          callbacksRef.current = {};
          term.dispose();
        };
      });

      term.onScroll(() => {
        const viewportY = term.buffer.active.viewportY;
        const sticky = promptAddon.getStickyCommand(viewportY);
        setStickyCommand(sticky);
        cellHeightRef.current =
          term._core?._renderService?.dimensions?.css?.cell?.height ??
          (term.element ? term.element.offsetHeight / term.rows : 28);
      });

      callbacksRef.current.focusTerm = () => term.focus();
      callbacksRef.current.scrollToBottom = () => term.scrollToBottom();
      callbacksRef.current.openSearch = () => setSearchOpen(true);

      // Slash-command hooks — invoked from the InputBar's command executor
      // via the pane's commandContext.
      callbacksRef.current.clearScrollback = () => term.clear();
      callbacksRef.current.clearScreen = () => { promptAddon.clear(); term.clear(); };
      callbacksRef.current.copyLastOutput = () => promptAddon.copyLastOutput();
      callbacksRef.current.copySelection = () => {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
      };
      callbacksRef.current.getLastEntry = () => promptAddon.getLastEntry();
      callbacksRef.current.getLastEntryForAnalysis = () => promptAddon.getLastEntryForAnalysis();

      callbacksRef.current.onOutput = (data) => {
        // Only hide empty state once a real command is running, not on shell startup output
        if (callbacksRef.current.isRunning?.()) {
          callbacksRef.current.onFirstOutput?.()
        }
        if (data.includes(TUI_ENTER)) {
          callbacksRef.current.onFirstOutput?.()
          promptAddon.enterTui();
          callbacksRef.current.onInteractiveEnter?.();
        } else if (data.includes(TUI_EXIT)) {
          promptAddon.exitTui();
          callbacksRef.current.onInteractiveExit?.();
        }
        // Detect interactive REPLs (node, python, etc.) via readline escape sequences.
        // \x1b[?2004h = bracketed paste; \x1b[?1h = application cursor keys (readline).
        // Gate on isRunning() so the shell's own readline at the prompt doesn't
        // trigger interactive mode between commands.
        if (callbacksRef.current.isRunning?.()) {
          if (data.includes('\x1b[?2004h') || data.includes('\x1b[?1h')) {
            callbacksRef.current.onInteractiveEnter?.();
          }
        }
        if (data.includes('\x1b[?2004l')) callbacksRef.current.onInteractiveExit?.();

        if (isVisibleRef.current) {
          term.write(data, () => {
            const buf = term.buffer.active;
            const atBottom = buf.viewportY >= buf.length - term.rows;
            if (atBottom) term.scrollToBottom();
          });
        } else {
          pendingRef.current.push(data);
          pendingSizeRef.current += data.length;
          while (
            pendingSizeRef.current > BUFFER_CAP &&
            pendingRef.current.length > 1
          ) {
            pendingSizeRef.current -= pendingRef.current.shift().length;
          }
        }
      };

      callbacksRef.current.onCommandStart = (command) => {
        promptAddon.commandStart(
          command,
          callbacksRef.current.currentCwd ?? "",
        );
        setStickyCommand(null);
        term.scrollToBottom();
      };

      callbacksRef.current.onCwdDecoration = (cwd) => {
        promptAddon.updateLastCwd(cwd);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onExitCodeDecoration = (code) => {
        promptAddon.updateLastExitCode(code);
        // Refresh sticky if it's showing the just-updated command.
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onGitDecoration = (gitData) => {
        promptAddon.updateLastGit(gitData);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onNodeDecoration = (nodeData) => {
        promptAddon.updateLastNode(nodeData);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onGoDecoration = (goData) => {
        promptAddon.updateLastGo(goData);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onPythonDecoration = (pythonData) => {
        promptAddon.updateLastPython(pythonData);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onDockerDecoration = (dockerData) => {
        promptAddon.updateLastDocker(dockerData);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

      callbacksRef.current.onK8sDecoration = (k8sData) => {
        promptAddon.updateLastK8s(k8sData);
        const viewportY = term.buffer.active.viewportY;
        setStickyCommand(promptAddon.getStickyCommand(viewportY));
      };

    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (isActive) termRef.current?.focus();
  }, [isActive]);

  // Focus search input whenever the bar opens.
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    }
  }, [searchOpen]);

  // Global Cmd+F to open search; Escape to close it.
  useEffect(() => {
    const handler = (e) => {
      if (e.metaKey && e.key === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 'Escape' && searchOpenRef.current) {
        setSearchOpen(false);
        setSearchQuery('');
        searchAddonRef.current?.clearDecorations?.();
        termRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // Re-run search when toggle state changes while the bar is open.
  useEffect(() => {
    if (!searchOpen || !searchQuery) return;
    const opts = searchOpts(tabAccentRef.current, {
      caseSensitive,
      wholeWord: wholeWord && !useRegex,
      regex: useRegex,
    });
    try {
      setRegexError(false);
      searchAddonRef.current?.findNext(searchQuery, { ...opts, incremental: true });
    } catch {
      setRegexError(true);
    }
  }, [caseSensitive, wholeWord, useRegex]);

  // Theme colors: update synchronously so xterm's internal RAF cycle picks them up immediately.
  // Keeping this separate from the font effect avoids wrapping theme updates in the async
  // fonts.load() Promise, which could delay the canvas repaint by a microtask.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = {
      background: activeColors.bgSurface,
      foreground: activeColors.textPrimary,
      cursor: activeColors.accent,
      selectionBackground: tabAccentRef.current + "40",
      selectionForeground: activeColors.textPrimary,
      selectionInactiveBackground: tabAccentRef.current + "25",
    };
    // Force all visible rows to repaint with the new background.
    // xterm clears the texture atlas on theme change but needs an explicit
    // refresh() to redraw existing canvas content.
    term.refresh(0, term.rows - 1);
  }, [activeColors]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = {
      ...term.options.theme,
      selectionBackground: tabAccent + "40",
      selectionInactiveBackground: tabAccent + "25",
    };
    term.refresh(0, term.rows - 1);
  }, [tabAccent]);

  // Font changes: wait for the font to load before applying so xterm measures
  // cell dimensions correctly. fitAddon.fit() must run after the font metrics settle.
  useEffect(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    document.fonts
      .load(`${prefs.fontSize}px ${prefs.fontFamily}`)
      .then(() => {
        const t = termRef.current;
        const f = fitAddonRef.current;
        if (!t || !f) return;
        t.options.fontSize = prefs.fontSize;
        t.options.fontFamily = prefs.fontFamily;
        t.refresh(0, t.rows - 1);
        requestAnimationFrame(() => f.fit());
      })
      .catch(() => {});
  }, [prefs.fontSize, prefs.fontFamily]);


  const anyOverlayOpen = fileListOpen || !!previewFile || historyOpen || runOpen || slashOpen || portsOpen || !!customList || askOpen

  function safeFind(fn, query, opts) {
    try {
      setRegexError(false);
      fn(query, opts);
    } catch {
      setRegexError(true);
    }
  }

  return (
    <div ref={rootRef} className="flex-1 min-h-0 flex flex-col relative">
      {/* No padding here — padding is applied directly to the xterm element after
          term.open() so FitAddon correctly subtracts it when computing column count.
          Container padding would be included in getComputedStyle().width but not
          subtracted by FitAddon, producing phantom columns that clip TUI apps. */}
      <div
        ref={xtermContainerRef}
        className="flex-1 min-h-0 bg-[var(--bg-surface)]"
        onClick={() => {
          if (!anyOverlayOpen) return
          onFileListClose?.()
          onPreviewClose?.()
          onHistoryClose?.()
          onRunClose?.()
          onSlashClose?.()
          onPortsClose?.()
          onCustomListClose?.()
          onAskClose?.()
        }}
      />
      {!hasCommands && <EmptyState />}
      {searchOpen && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
          position: 'absolute',
          top: 8,
          right: 12,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '4px 6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => {
              const q = e.target.value;
              setSearchQuery(q);
              const opts = searchOpts(tabAccentRef.current, { caseSensitive, wholeWord: wholeWord && !useRegex, regex: useRegex });
              if (q) {
                safeFind(
                  searchAddonRef.current.findNext.bind(searchAddonRef.current),
                  q,
                  { ...opts, incremental: true }
                );
              } else {
                searchAddonRef.current?.clearDecorations?.();
              }
            }}
            onKeyDown={e => {
              const opts = searchOpts(tabAccentRef.current, { caseSensitive, wholeWord: wholeWord && !useRegex, regex: useRegex });
              if (e.key === 'Enter') {
                e.shiftKey
                  ? safeFind(
                      searchAddonRef.current.findPrevious.bind(searchAddonRef.current),
                      searchQuery,
                      opts
                    )
                  : safeFind(
                      searchAddonRef.current.findNext.bind(searchAddonRef.current),
                      searchQuery,
                      opts
                    );
              }
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
                setRegexError(false);
                searchAddonRef.current?.clearDecorations?.();
                termRef.current?.focus();
              }
            }}
            placeholder="Search…"
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: regexError ? '1px solid #f87171' : '1px solid transparent',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-ui)',
              color: regexError ? '#f87171' : 'var(--text-primary)',
              width: 180,
            }}
          />
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
          <SearchToggle
            label="Aa"
            title="Match case"
            active={caseSensitive}
            onToggle={() => { setCaseSensitive(v => !v); searchInputRef.current?.focus(); }}
          />
          <SearchToggle
            label="W"
            title="Whole word (disabled in regex mode)"
            active={wholeWord && !useRegex}
            disabled={useRegex}
            onToggle={() => { if (!useRegex) { setWholeWord(v => !v); } searchInputRef.current?.focus(); }}
          />
          <SearchToggle
            label=".*"
            title="Use regular expression"
            active={useRegex}
            onToggle={() => { setUseRegex(v => !v); setRegexError(false); searchInputRef.current?.focus(); }}
          />
          <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
          <button
            onClick={() => safeFind(
              searchAddonRef.current.findPrevious.bind(searchAddonRef.current),
              searchQuery,
              searchOpts(tabAccentRef.current, { caseSensitive, wholeWord: wholeWord && !useRegex, regex: useRegex })
            )}
            disabled={!searchQuery}
            title="Previous (Shift+Enter)"
            style={{ background: 'none', border: 'none', cursor: searchQuery ? 'pointer' : 'default', color: 'var(--text-muted)', fontSize: 12, padding: '0 2px' }}
          >↑</button>
          <button
            onClick={() => safeFind(
              searchAddonRef.current.findNext.bind(searchAddonRef.current),
              searchQuery,
              searchOpts(tabAccentRef.current, { caseSensitive, wholeWord: wholeWord && !useRegex, regex: useRegex })
            )}
            disabled={!searchQuery}
            title="Next (Enter)"
            style={{ background: 'none', border: 'none', cursor: searchQuery ? 'pointer' : 'default', color: 'var(--text-muted)', fontSize: 12, padding: '0 2px' }}
          >↓</button>
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); setRegexError(false); searchAddonRef.current?.clearDecorations?.(); termRef.current?.focus(); }}
            title="Close (Esc)"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          >✕</button>
        </div>
      )}
      {fileListOpen && (
        <FileListPanel
          cwd={fileListCwd}
          onSelect={onFileListSelect}
          onPreview={onFileListPreview}
          onClose={onFileListClose}
        />
      )}
      {previewFile && (
        <FilePreviewPanel
          filePath={previewFile}
          onClose={onPreviewClose}
        />
      )}
      {historyOpen && (
        <HistoryPanel
          history={history}
          onSelect={onHistorySelect}
          onClose={onHistoryClose}
        />
      )}
      {runOpen && (
        <RunPanel
          cwd={runCwd}
          onSelect={onRunSelect}
          onClose={onRunClose}
        />
      )}
      {slashOpen && (
        <SlashCommandPanel
          query={slashQuery}
          onSelect={onSlashSelect}
          onClose={onSlashClose}
        />
      )}
      {portsOpen && (
        <PortsPanel
          onSelect={onPortsSelect}
          onKill={onPortsKill}
          onClose={onPortsClose}
        />
      )}
      {customList && (
        <CustomListPanel
          title={customList.title}
          items={customList.items}
          itemsFrom={customList.itemsFrom}
          onSelectTemplate={customList.onSelectTemplate}
          cwd={customList.cwd}
          onSelect={onCustomListSelect}
          onClose={onCustomListClose}
        />
      )}
      {askOpen && (
        <AskPanel
          messages={askMessages}
          onSend={onAskSend}
          onClose={onAskClose}
        />
      )}
      {stickyCommand !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            background: "var(--bg-surface)",
          }}
        >
          <Prompt
            command={stickyCommand.command}
            cwd={stickyCommand.cwd}
            exitCode={stickyCommand.exitCode}
            rowHeight={stickyCommand.promptHeight ?? cellHeightRef.current}
            cellHeight={stickyCommand.cellHeight ?? cellHeightRef.current}
            showSeparator={false}
            compact={true}
            onCopy={stickyCommand.onCopy}
            onReplay={stickyCommand.onReplay}
            onSave={stickyCommand.onSave}
            startTime={stickyCommand.startTime}
            duration={stickyCommand.duration}
            gitData={stickyCommand.gitData}
            onGitClick={stickyCommand.gitData?.branch
              ? () => navigator.clipboard.writeText(stickyCommand.gitData.branch)
              : undefined}
            nodeData={stickyCommand.nodeData}
            onNodeClick={stickyCommand.nodeData?.version
              ? () => navigator.clipboard.writeText(stickyCommand.nodeData.version)
              : undefined}
            goData={stickyCommand.goData}
            onGoClick={stickyCommand.goData?.version
              ? () => navigator.clipboard.writeText(stickyCommand.goData.version)
              : undefined}
            pythonData={stickyCommand.pythonData}
            onPythonClick={stickyCommand.pythonData?.version
              ? () => navigator.clipboard.writeText(stickyCommand.pythonData.version)
              : undefined}
            dockerData={stickyCommand.dockerData}
            k8sData={stickyCommand.k8sData}
            onK8sClick={stickyCommand.k8sData?.context
              ? () => navigator.clipboard.writeText(stickyCommand.k8sData.context)
              : undefined}
          />
        </div>
      )}
    </div>
  );
}
