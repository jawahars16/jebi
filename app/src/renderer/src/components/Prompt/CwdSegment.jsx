import FsIcon from "../FsIcon";
import errorIconUrl from "../../assets/error.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

// CwdSegment — current working directory pill.
// Also renders a compact ✕N error badge when the previous command failed.
// onClick: usually opens the directory in Finder/Nautilus.
export default function CwdSegment({
  cwd,
  exitCode = 0,
  rowHeight,
  iconSize,
  onClick,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const hasError = exitCode > 0;

  const bg = bare ? "transparent" : "color-mix(in srgb, var(--tab-accent) var(--prompt-tint-strength), var(--bg-elevated))";
  const fg = bare ? "var(--accent)" : "var(--prompt-cwd-fg)";

  const style = {
    ...pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick }),
    // Left accent bar — a thin inset shadow that matches the tab accent color.
    boxShadow: bare ? undefined : "inset 6px 0 0 var(--tab-accent)",
  };

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
      title={cwd}
      style={style}
    >
      <div className="ml-1">
        <FsIcon kind="folder" size={iconSize} />
      </div>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "40vw",
        }}
      >
        {shortenPath(cwd)}
      </span>
      {hasError && (
        <img
          src={errorIconUrl}
          alt={`Exit code ${exitCode}`}
          title={`Exit code: ${exitCode}`}
          width={iconSize}
          height={iconSize}
          style={{
            width: iconSize + 4,
            height: iconSize + 4,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
      )}
    </button>
  );
}

function shortenPath(p) {
  if (!p) return "";
  const parts = p.split("/");
  if (p.startsWith("/Users/") && parts.length >= 3) {
    return "~/" + parts.slice(3).join("/");
  }
  return p;
}
