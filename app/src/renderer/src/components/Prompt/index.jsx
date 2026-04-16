import { useState } from "react";
import FolderIcon from "../../icons/FolderIcon";
import ClipboardIcon from "../../icons/ClipboardIcon";

// Prompt — prompt header rendered in xterm decorations and InputBar.
// Used in two places:
//   1. xterm Decoration above each command's output  →  row 1: elements, rows 2+: command lines
//   2. InputBar first line                           →  row 1: elements only (textarea is row 2)
//
// rowHeight: when provided (xterm decorations), each row is fixed to that pixel height
// so prompt rows align exactly with terminal cell rows. When omitted (InputBar), rows
// use natural height with lineHeight 1.2 to match xterm's compact feel.
// Total decoration height must equal (1 + commandLines.length) * rowHeight.
export default function Prompt({ command, cwd, exitCode, rowHeight, onCopy }) {
  const [copied, setCopied] = useState(false);
  const hasError = exitCode > 0;
  const commandLines = command ? command.split("\n") : [];
  const rowStyle = rowHeight
    ? { height: `${rowHeight}px`, minHeight: `${rowHeight}px` }
    : { lineHeight: 1.2 };

  function handleCopy(e) {
    e.stopPropagation();
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="flex flex-col select-none w-full bg-[var(--bg-surface)]"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-mono)",
      }}
    >
      {/* Row 1: prompt elements */}
      <div className="flex items-center w-full gap-1" style={rowStyle}>
        <div
          className="flex items-center gap-1 py-2 px-2 rounded-md text-[var(--text-primary)]"
          style={{
            flexShrink: 0,
            backgroundColor: "#00000038",
            border: "1px solid #f9f9f91f",
            lineHeight: 1,
          }}
        >
          {cwd && (
            <button
              onClick={() => window.electron?.openPath(cwd)}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              title={cwd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                padding: 0,
              }}
            >
              <FolderIcon color="var(--accent)" size={16} />
              <span
                className="ml-1 hover:text-[var(--accent)] transition-colors duration-150"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "40vw",
                }}
              >
                {shortenPath(cwd)}
              </span>
            </button>
          )}
        </div>
        <div className="flex-1 h-px bg-gray-300/15" />
        {onCopy && (
          <button
            onClick={handleCopy}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: copied ? "var(--accent)" : "var(--text-muted)",
              flexShrink: 0,
              transition: "color 0.15s",
              marginRight: "20px",
            }}
            title="Copy command and output"
          >
            {copied ? (
              <span style={{ fontSize: "11px", fontWeight: "bold" }}>✓</span>
            ) : (
              <ClipboardIcon size={11} color="currentColor" />
            )}
          </button>
        )}
      </div>

      {/* Rows 2+: one row per command line (xterm decoration only) */}
      {commandLines.map((line, i) => (
        <div key={i} className="flex items-center px-3 mt-2" style={rowStyle}>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}

function shortenPath(p) {
  const home = "/Users/";
  const parts = p.split("/");
  if (p.startsWith(home) && parts.length >= 3) {
    return "~/" + parts.slice(3).join("/");
  }
  return p;
}
