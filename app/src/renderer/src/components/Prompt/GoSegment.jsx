import goIconUrl from "../../assets/go.png";

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

  const bg = bare ? "transparent" : "var(--prompt-go-bg)";
  const fg = bare ? "var(--prompt-go-tint)" : "var(--prompt-go-fg)";

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
      <img
        src={goIconUrl}
        alt=""
        aria-hidden="true"
        width={iconSize + 4}
        height={iconSize + 4}
        style={{ flexShrink: 0, objectFit: "contain" }}
      />
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
