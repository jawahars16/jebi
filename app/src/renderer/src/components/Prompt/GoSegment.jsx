import { FaGolang } from "react-icons/fa6";

// GoSegment — Go toolchain version badge.
// Shown whenever dir is inside a Go module (go.mod walk-up).
export default function GoSegment({
  version,
  onClick,
  rowHeight,
  iconSize,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const paddingH = bare ? 0 : compact ? 7 : 10;
  const paddingV = compact ? 0 : 4;

  const bg = "#01A7D0";
  const fg = "#000";

  // "go1.21.3" → "1.21.3"
  const display = version?.startsWith("go") ? version.slice(2) : version;

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

  return (
    <button
      onClick={onClick}
      onMouseDown={stopEvents}
      onPointerDown={stopEvents}
      title={`Go ${display}`}
      style={style}
    >
      <FaGolang size={iconSize + 4} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "10ch",
        }}
      >
        {display}
      </span>
    </button>
  );
}
