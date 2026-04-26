import { FaStarOfLife } from "react-icons/fa";
import {
  FaArrowDownLong,
  FaArrowsUpDown,
  FaArrowUpLong,
} from "react-icons/fa6";
import gitIconUrl from "../../assets/git.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

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
  const bg = bare ? "transparent" : "var(--prompt-git-bg)";
  const fg = "var(--prompt-git-fg)";
  const dirtyColor = "#edf459";
  const upColor = "#e74c3c";
  const downColor = "#27ae60";

  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  const title = `Branch: ${branch}${dirty ? " (dirty)" : ""}${ahead ? ` ↑${ahead}` : ""}${behind ? ` ↓${behind}` : ""}`;

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
      title={title}
      style={style}
    >
      <img
        src={gitIconUrl}
        alt=""
        aria-hidden="true"
        width={iconSize + 3}
        height={iconSize + 3}
        style={{ flexShrink: 0, objectFit: "contain" }}
      />
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
