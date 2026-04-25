import { createRoot } from "react-dom/client";
import Prompt from "../components/Prompt";

// Rows for the prompt elements line (➜, cwd, etc.)
const PROMPT_HEADER_ROWS = 1;

// PromptAddon — xterm.js addon that renders a React <Prompt> component
// above each command's output using xterm's Decoration + Marker APIs.
//
// How it works:
//   1. commandStart() writes a blank line to reserve space
//   2. A Marker is registered at that line (stable through scrollback)
//   3. A Decoration overlays it with a React-rendered <Prompt>
export class PromptAddon {
  constructor() {
    this._term = null;
    this._roots = [];
    this._decorations = [];
    this._elements = []; // DOM elements from onRender, for TUI visibility toggling
    this._tuiActive = false;
    this._onReplay = null; // (command) => void, set by OutputArea
    this._commands = []; // { marker, command, cwd, exitCode, gitData, nodeData, goData, pythonData, dockerData, k8sData, root, cellHeight, onCopy, onReplay }
  }

  // Registers a pane-level replay handler. Called by OutputArea so per-command
  // onReplay closures can invoke the pane's submit pipeline (which sets running
  // state, updates history, etc.) rather than sending input straight to the PTY.
  setOnReplay(fn) {
    this._onReplay = fn;
  }

  activate(terminal) {
    this._term = terminal;
  }

  dispose() {
    this._roots.forEach((r) => {
      try {
        r.unmount();
      } catch {}
    });
    this._decorations.forEach((d) => {
      try {
        d.dispose();
      } catch {}
    });
    this._roots = [];
    this._decorations = [];
    this._elements = [];
    this._commands = [];
  }

  // Copies the most recent command's output to the clipboard.
  // Reuses the per-entry onCopy wired in commandStart — returns false if no
  // command has run yet (nothing to copy).
  copyLastOutput() {
    const entry = this._commands[this._commands.length - 1];
    if (!entry || !entry.onCopy) return false;
    entry.onCopy();
    return true;
  }

  // Returns the command whose prompt should be shown as a sticky header.
  getStickyCommand(viewportY) {
    let best = null;
    for (const entry of this._commands) {
      if (entry.marker.isDisposed) continue;
      if (entry.marker.line < viewportY) {
        if (best === null || entry.marker.line > best.marker.line) best = entry;
      }
    }
    if (!best) return null;
    return {
      command: best.command,
      cwd: best.cwd,
      exitCode: best.exitCode,
      gitData: best.gitData ?? null,
      nodeData: best.nodeData ?? null,
      goData: best.goData ?? null,
      pythonData: best.pythonData ?? null,
      dockerData: best.dockerData ?? null,
      k8sData: best.k8sData ?? null,
      onCopy: best.onCopy,
      onReplay: best.onReplay,
      startTime: best.startTime,
      duration: best.duration,
    };
  }

  // Returns the most recently completed command + its output (read once for AI context).
  getLastEntry() {
    const completed = this._commands.filter((e) => !e.running);
    const last = completed[completed.length - 1];
    if (!last) return null;
    return {
      command: last.command,
      output: (this._getOutput(last) || "").slice(0, 500),
    };
  }

  // Reads the command's output from the xterm buffer as plain text.
  _getOutput(entry) {
    const buffer = this._term.buffer.active;
    const commandLines = entry.command ? entry.command.split("\n").length : 0;
    const promptRows = PROMPT_HEADER_ROWS + commandLines;
    const outputStart = entry.marker.line + promptRows + 1;

    const entryIndex = this._commands.indexOf(entry);
    const nextEntry = this._commands[entryIndex + 1];
    const outputEnd = nextEntry
      ? nextEntry.marker.line
      : buffer.baseY + buffer.cursorY + 1;

    const lines = [];
    for (let i = outputStart; i < outputEnd; i++) {
      const line = buffer.getLine(i);
      if (!line) break;
      lines.push(line.translateToString(true));
    }

    // Trim trailing blank lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "")
      lines.pop();

    return lines.join("\n");
  }

  _renderEntry(entry) {
    const onGitClick = entry.gitData?.branch
      ? () => navigator.clipboard.writeText(entry.gitData.branch)
      : undefined;
    const onNodeClick = entry.nodeData?.version
      ? () => navigator.clipboard.writeText(entry.nodeData.version)
      : undefined;
    const onGoClick = entry.goData?.version
      ? () => navigator.clipboard.writeText(entry.goData.version)
      : undefined;
    const onPythonClick = entry.pythonData?.version
      ? () => navigator.clipboard.writeText(entry.pythonData.version)
      : undefined;
    const onK8sClick = entry.k8sData?.context
      ? () => navigator.clipboard.writeText(entry.k8sData.context)
      : undefined;
    entry.root?.render(
      <Prompt
        command={entry.command}
        cwd={entry.cwd}
        exitCode={entry.exitCode}
        gitData={entry.gitData}
        onGitClick={onGitClick}
        nodeData={entry.nodeData}
        onNodeClick={onNodeClick}
        goData={entry.goData}
        onGoClick={onGoClick}
        pythonData={entry.pythonData}
        onPythonClick={onPythonClick}
        dockerData={entry.dockerData}
        k8sData={entry.k8sData}
        onK8sClick={onK8sClick}
        rowHeight={entry.cellHeight}
        onCopy={entry.onCopy}
        onReplay={entry.onReplay}
        running={entry.running}
        startTime={entry.startTime}
        duration={entry.duration}
      />,
    );
  }

  // Called when TypeCwd arrives — updates the most recent decoration with the real cwd.
  updateLastCwd(cwd) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.cwd = cwd;
    this._renderEntry(entry);
  }

  // Called when TypeExitCode arrives — updates the most recent decoration with the real exit code.
  updateLastExitCode(code) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.exitCode = code;
    entry.running = false;
    entry.duration = Date.now() - entry.startTime;
    this._renderEntry(entry);
  }

  // Called when TypeGit arrives — updates the most recent decoration with git state.
  updateLastGit(gitData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.gitData = gitData;
    this._renderEntry(entry);
  }

  // Called when TypeNode arrives — updates the most recent decoration with node state.
  updateLastNode(nodeData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.nodeData = nodeData;
    this._renderEntry(entry);
  }

  // Called when TypeGo arrives — updates the most recent decoration with go state.
  updateLastGo(goData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.goData = goData;
    this._renderEntry(entry);
  }

  // Called when TypePython arrives — updates the most recent decoration with python state.
  updateLastPython(pythonData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.pythonData = pythonData;
    this._renderEntry(entry);
  }

  // Called when TypeDocker arrives — updates the most recent decoration with docker state.
  updateLastDocker(dockerData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.dockerData = dockerData;
    this._renderEntry(entry);
  }

  // Called when TypeK8s arrives — updates the most recent decoration with k8s state.
  updateLastK8s(k8sData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.k8sData = k8sData;
    this._renderEntry(entry);
  }

  enterTui() {
    this._tuiActive = true;
    for (const el of this._elements) {
      if (el) el.style.visibility = "hidden";
    }
  }

  exitTui() {
    this._tuiActive = false;
    for (const el of this._elements) {
      if (el) el.style.visibility = "";
    }
  }

  commandStart(command, cwd = "") {
    const commandLines = command ? command.split("\n").length : 0;

    const cellHeight =
      this._term._core?._renderService?.dimensions?.css?.cell?.height ??
      (this._term.element
        ? this._term.element.offsetHeight / this._term.rows
        : 25);
    const promptRows = PROMPT_HEADER_ROWS + commandLines;

    // Reserve promptRows + 1 blank lines. The extra row's height is split between
    // top and bottom padding via CSS on the decoration element.
    const marker = this._term.registerMarker(0);
    if (!marker) return;
    this._term.write("\r\n".repeat(promptRows + 1));

    const decoration = this._term.registerDecoration({
      marker,
      height: promptRows + 1,
      layer: "top",
    });
    if (!decoration) return;

    const entry = {
      marker,
      command,
      cwd,
      exitCode: 0,
      gitData: null,
      nodeData: null,
      goData: null,
      pythonData: null,
      dockerData: null,
      k8sData: null,
      running: true,
      root: null,
      cellHeight,
      onCopy: null,
      onReplay: null,
      startTime: Date.now(),
      duration: null,
    };

    // onCopy reads the buffer at call-time so it always captures the final output.
    entry.onCopy = () => {
      const output = this._getOutput(entry);
      const text = (entry.command ? `$ ${entry.command}\n` : "") + output;
      navigator.clipboard.writeText(text).catch(() => {});
    };

    // onReplay delegates to the pane-level handler so replay goes through the
    // same path as InputBar submission (sets running state, updates history).
    entry.onReplay = entry.command
      ? () => this._onReplay?.(entry.command)
      : null;

    // Read the container's left padding so the decoration can bleed back to the true left edge.
    const termContainer = this._term.element?.parentElement;
    const paddingLeft = termContainer
      ? parseInt(getComputedStyle(termContainer).paddingLeft) || 0
      : 0;

    // Split the extra reserved row between top and bottom padding.
    const paddingTop = Math.round(cellHeight * 0.5);

    decoration.onRender((el) => {
      el.style.marginLeft = `-${paddingLeft}px`;
      el.style.width = `calc(100% + ${paddingLeft}px)`;
      el.style.paddingTop = `${paddingTop}px`;
      el.style.boxSizing = "border-box";
      el.style.overflow = "visible";
      el.style.backgroundColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bg-surface")
          .trim() || "#141416";
      if (this._tuiActive) el.style.visibility = "hidden";
      if (!el._reactRoot) {
        this._elements.push(el);
        const root = createRoot(el);
        el._reactRoot = root;
        entry.root = root;
        this._roots.push(root);
        this._renderEntry(entry);
      }
    });

    this._decorations.push(decoration);
    this._commands.push(entry);
  }
}
