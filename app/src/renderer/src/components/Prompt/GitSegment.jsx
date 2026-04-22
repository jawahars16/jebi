import { DiGitBranch } from "react-icons/di";
import { FaStarOfLife } from "react-icons/fa";
import {
  FaArrowDownLong,
  FaArrowsUpDown,
  FaArrowUpLong,
} from "react-icons/fa6";

// GitSegment — branch name, dirty indicator, ahead/behind counts.
// onClick: in InputBar → runs `git status`; in xterm decoration → copies branch to clipboard.
export default function GitSegment({
  branch,
  dirty,
  ahead,
  behind,
  onClick,
  rowHeight,
  iconSize,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const paddingH = bare ? 0 : (compact ? 7 : 10);
  const paddingV = compact ? 0 : 4;

  const bg = bare ? "transparent" : "var(--bg-elevated)";
  const fg = "var(--text-primary)";
  const dirtyColor = "#edf459";
  const upColor = "#e74c3c";
  const downColor = "#27ae60";

  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: compact ? `${rowHeight}px` : undefined,
    minHeight: compact ? `${rowHeight}px` : undefined,
    padding: `${paddingV}px ${paddingH}px`,
    backgroundColor: bg,
    color: fg,
    lineHeight: 1,
    flexShrink: 0,
    whiteSpace: "nowrap",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-mono)",
    fontWeight: 500,
    border: "none",
    borderRadius: segmentRadius != null ? `${segmentRadius}px` : 0,
    cursor: onClick ? "pointer" : "default",
  };

  const stopEvents = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const title = `Branch: ${branch}${dirty ? " (dirty)" : ""}${ahead ? ` ↑${ahead}` : ""}${behind ? ` ↓${behind}` : ""}`;

  return (
    <button
      onClick={onClick}
      onMouseDown={stopEvents}
      onPointerDown={stopEvents}
      title={title}
      style={style}
    >
      <DiGitBranch size={iconSize + 3} color="var(--text-primary)" />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "20ch",
        }}
      >
        {branch}
      </span>
      {dirty && (
        <span style={{ color: fg, lineHeight: 1, flexShrink: 0 }}>
          <FaStarOfLife size={9} color={dirtyColor} />
        </span>
      )}
      {ahead > 0 && (
        <span
          className="flex"
          style={{
            color: upColor,
            lineHeight: 1,
            flexShrink: 0,
            scale: "0.8",
          }}
        >
          <FaArrowUpLong size={iconSize} />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span
          className="flex -ml-1"
          style={{
            color: downColor,
            lineHeight: 1,
            flexShrink: 0,
            scale: "0.8",
          }}
        >
          <FaArrowDownLong size={iconSize} />
          {behind}
        </span>
      )}
    </button>
  );
}
