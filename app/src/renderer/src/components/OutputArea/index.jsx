import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { WebglAddon } from "@xterm/addon-webgl";
import { PromptAddon } from "../../addons/PromptAddon";
import Prompt from "../Prompt";
import { usePreferences } from "../../hooks/usePreferences";

const BUFFER_CAP = 512 * 1024; // 512 KB

// Alternate screen enter/exit — emitted by TUI apps (vim, micro, htop, etc.)
const TUI_ENTER = "\x1b[?1049h";
const TUI_EXIT = "\x1b[?1049l";

// 'webgl'   — GPU-accelerated, best performance, no ligatures
// 'canvas'  — software renderer, supports font ligatures
// Will be driven by user preferences once that system is implemented.
const DEFAULT_RENDERER = "canvas";

export default function OutputArea({
  callbacksRef,
  sendRaw,
  sendResize,
  onReplay,
  isActive,
  isVisible,
  renderer = DEFAULT_RENDERER,
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
  const pendingRef = useRef([]);
  const pendingSizeRef = useRef(0);
  const isVisibleRef = useRef(isVisible);

  const [stickyCommand, setStickyCommand] = useState(null);

  sendResizeRef.current = sendResize;
  onReplayRef.current = onReplay;

  // When the tab becomes visible, flush buffered output and refit.
  useEffect(() => {
    isVisibleRef.current = isVisible;
    if (!isVisible) return;
    const term = termRef.current;
    if (!term || pendingRef.current.length === 0) return;
    term.write(pendingRef.current.join(""));
    pendingRef.current = [];
    pendingSizeRef.current = 0;
    fitAddonRef.current?.fit();
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
    // which breaks ligatures and prompt row alignment.
    document.fonts.load(`${fontSize}px ${fontFamily}`).then(() => {
      if (disposed) return;

      const term = new Terminal({
        fontFamily,
        fontSize,
        lineHeight: 1.2,
        theme: {
          background: cssVar("--bg-surface"),
          foreground: cssVar("--text-primary"),
          cursor: cssVar("--accent"),
        },
        fontLigatures: renderer === "canvas",
        cursorBlink: false,
        cursorInactiveStyle: "none",
        allowProposedApi: true,
        smoothScrollDuration: 100,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      const promptAddon = new PromptAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(promptAddon);
      promptAddonRef.current = promptAddon;
      promptAddon.setOnReplay((command) => onReplayRef.current?.(command));

      term.onData((data) => {
        sendRaw(data);
        term.scrollToBottom();
      });
      term.onResize(({ cols, rows }) => sendResizeRef.current?.(cols, rows));

      term.open(xtermContainerRef.current);

      // If xterm somehow has keyboard focus while InputBar is visible, redirect
      // the key there and suppress xterm from forwarding it to the PTY.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type === "keydown" && !callbacksRef.current.isRunning?.()) {
          callbacksRef.current.focusInput?.();
          return false;
        }
        return true;
      });

      if (renderer === "webgl") {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        term.loadAddon(webglAddon);
      }

      fitAddon.fit();
      if (term.rows <= 2) term.resize(term.cols, 24);

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      term.onScroll(() => {
        const viewportY = term.buffer.active.viewportY;
        const sticky = promptAddon.getStickyCommand(viewportY);
        setStickyCommand(sticky);
        cellHeightRef.current =
          term._core?._renderService?.dimensions?.css?.cell?.height ??
          (term.element ? term.element.offsetHeight / term.rows : 28);
      });

      callbacksRef.current.focusTerm = () => term.focus();

      // Slash-command hooks — invoked from the InputBar's command executor
      // via the pane's commandContext.
      callbacksRef.current.clearScrollback = () => term.clear();
      callbacksRef.current.copyLastOutput = () => promptAddon.copyLastOutput();

      callbacksRef.current.onOutput = (data) => {
        if (data.includes(TUI_ENTER)) promptAddon.enterTui();
        else if (data.includes(TUI_EXIT)) promptAddon.exitTui();

        if (isVisibleRef.current) {
          term.write(data, () => term.scrollToBottom());
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

      const observer = new ResizeObserver(() => fitAddon.fit());
      observer.observe(rootRef.current);

      cleanup = () => {
        observer.disconnect();
        callbacksRef.current = {};
        term.dispose();
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
    };
    // Force all visible rows to repaint with the new background.
    // xterm clears the texture atlas on theme change but needs an explicit
    // refresh() to redraw existing canvas content.
    term.refresh(0, term.rows - 1);
  }, [activeColors]);

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

  return (
    <div ref={rootRef} className="flex-1 min-h-0 flex flex-col relative">
      {/* bg-[var(--bg-surface)] ensures the container padding area matches xterm's canvas
          background. Without it, the parent's --bg-base bleeds through the px-3/pt-2
          padding, creating a visible border when bg-base ≠ bg-surface (e.g. Catppuccin). */}
      <div
        ref={xtermContainerRef}
        className="flex-1 min-h-0 px-3 pt-2 bg-[var(--bg-surface)]"
      />
      {stickyCommand !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        >
          <Prompt
            command={stickyCommand.command}
            cwd={stickyCommand.cwd}
            exitCode={stickyCommand.exitCode}
            rowHeight={cellHeightRef.current}
            onCopy={stickyCommand.onCopy}
            onReplay={stickyCommand.onReplay}
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
