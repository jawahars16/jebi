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
    this._commands = []; // { marker, command, cwd, exitCode, gitData, root, cellHeight, onCopy }
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
      onCopy: best.onCopy,
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
    entry.root?.render(
      <Prompt
        command={entry.command}
        cwd={entry.cwd}
        exitCode={entry.exitCode}
        gitData={entry.gitData}
        onGitClick={onGitClick}
        rowHeight={entry.cellHeight}
        onCopy={entry.onCopy}
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
    this._renderEntry(entry);
  }

  // Called when TypeGit arrives — updates the most recent decoration with git state.
  updateLastGit(gitData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.gitData = gitData;
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
      root: null,
      cellHeight,
      onCopy: null,
    };

    // onCopy reads the buffer at call-time so it always captures the final output.
    entry.onCopy = () => {
      const output = this._getOutput(entry);
      const text = (entry.command ? `$ ${entry.command}\n` : "") + output;
      navigator.clipboard.writeText(text).catch(() => {});
    };

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
      el.style.overflow = "hidden";
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
