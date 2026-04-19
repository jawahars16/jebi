import { useState } from "react";
import { FaRegCopy, FaCheck } from "react-icons/fa";
import CwdSegment from "./CwdSegment";
import GitSegment from "./GitSegment";
import NodeSegment from "./NodeSegment";
import WaveSeparator from "./WaveSeparator";

export default function Prompt({
  command,
  cwd,
  exitCode,
  rowHeight,
  onCopy,
  gitData,
  onGitClick,
  nodeData,
  onNodeClick,
  running,
}) {
  const [copied, setCopied] = useState(false);
  const commandLines = command ? command.split("\n") : [];

  const iconSize = rowHeight ? Math.min(14, Math.max(10, rowHeight - 6)) : 14;

  const rowStyle = rowHeight
    ? {
        height: `${rowHeight}px`,
        minHeight: `${rowHeight}px`,
        maxHeight: `${rowHeight}px`,
        overflow: "hidden",
      }
    : { lineHeight: 1.4 };

  function handleCopy(e) {
    e.stopPropagation();
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasCwd = Boolean(cwd);
  const hasGit = Boolean(gitData);
  const hasNode = Boolean(nodeData);
  const hasAny = hasCwd || hasGit || hasNode;

  // Border radius for the connected group
  const groupRadius = rowHeight ? Math.max(4, Math.floor(rowHeight / 3)) : 8;

  return (
    <div
      className="flex flex-col select-none w-full bg-[var(--bg-surface)]"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-mono)",
      }}
    >
      {/* Row 1 */}
      <div
        className="flex items-center w-full"
        style={{ gap: "8px", ...rowStyle }}
      >
        {/* Connected segment group */}
        {hasAny && (
          <div
            style={{
              display: "inline-flex",
              borderRadius: `0 ${groupRadius}px ${groupRadius}px 0`,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {hasCwd && (
              <CwdSegment
                cwd={cwd}
                exitCode={exitCode}
                rowHeight={rowHeight}
                iconSize={iconSize}
                onClick={() => window.electron?.openPath(cwd)}
              />
            )}

            {hasGit && (
              <GitSegment
                branch={gitData.branch}
                dirty={gitData.dirty}
                ahead={gitData.ahead}
                behind={gitData.behind}
                onClick={onGitClick}
                rowHeight={rowHeight}
                iconSize={iconSize}
              />
            )}

            {hasNode && (
              <NodeSegment
                version={nodeData.version}
                packageManager={nodeData.packageManager}
                onClick={onNodeClick}
                rowHeight={rowHeight}
                iconSize={iconSize}
              />
            )}
          </div>
        )}

        <WaveSeparator running={running} />

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
              width: `${iconSize + 10}px`,
              height: `${iconSize + 10}px`,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: copied ? "var(--accent)" : "var(--text-secondary)",
              flexShrink: 0,
              transition: "color 0.15s",
              marginRight: "16px",
            }}
            title="Copy command and output"
          >
            {copied ? (
              <FaCheck size={iconSize + 2} />
            ) : (
              <FaRegCopy size={iconSize + 2} />
            )}
          </button>
        )}
      </div>

      {/* Rows 2+: command lines (xterm decoration only) */}
      {commandLines.map((line, i) => (
        <div
          key={i}
          className="flex items-center m-2 relative"
          style={{ ...rowStyle, paddingLeft: 22, paddingRight: 12 }}
        >
          {i === 0 && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 5,
                top: -1,
                bottom: "50%",
                width: 13,
                height: 18,
                borderLeft: "2px dotted #fff",
                borderBottom: "2px dotted #fff",
                borderBottomLeftRadius: 3,
                pointerEvents: "none",
              }}
            />
          )}
          <span className="ml-1">{line}</span>
        </div>
      ))}
    </div>
  );
}

