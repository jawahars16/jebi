import goIconUrl from "../../assets/go.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

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
  const bg = bare ? "transparent" : "var(--prompt-go-bg)";
  const fg = bare ? "var(--prompt-go-tint)" : "var(--prompt-go-fg)";

  // "go1.21.3" → "1.21.3"
  const display = version?.startsWith("go") ? version.slice(2) : version;

  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
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
