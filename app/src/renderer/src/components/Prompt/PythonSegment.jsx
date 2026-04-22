import { FaPython } from "react-icons/fa";

// PythonSegment — Python version + optional virtualenv badge.
// Shown when dir is inside a Python project (pyproject.toml / requirements.txt / etc.).
export default function PythonSegment({
  version,
  venv,
  onClick,
  rowHeight,
  iconSize,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const paddingH = bare ? 0 : (compact ? 7 : 10);
  const paddingV = compact ? 0 : 4;

  const bg = bare ? "transparent" : "var(--border)";
  const fg = "var(--text-primary)";

  const label = venv ? `${version} (${venv})` : version;

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
      title={`Python ${label}`}
      style={style}
    >
      <FaPython size={iconSize + 2} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "12ch",
        }}
      >
        {label}
      </span>
    </button>
  );
}
