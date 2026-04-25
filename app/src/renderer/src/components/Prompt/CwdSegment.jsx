import FsIcon from "../FsIcon";
import errorIconUrl from "../../assets/error.png";

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
  const paddingH = bare ? 0 : compact ? 7 : 10;
  const paddingV = compact ? 0 : 4;
  const hasError = exitCode > 0;

  const bg = bare ? "transparent" : "color-mix(in srgb, var(--tab-accent) var(--prompt-tint-strength), var(--bg-elevated))";
  const fg = bare ? "var(--accent)" : "var(--prompt-cwd-fg)";

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
    boxShadow: bare ? undefined : "inset 6px 0 0 var(--tab-accent)",
  };

  const stopEvents = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <button
      onClick={onClick}
      onMouseDown={stopEvents}
      onPointerDown={stopEvents}
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
