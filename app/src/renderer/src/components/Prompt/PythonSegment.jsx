import { FaPython } from "react-icons/fa";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

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
  const bg = bare ? "transparent" : "var(--prompt-python-bg)";
  const fg = "var(--prompt-python-fg)";

  const label = venv ? `${version} (${venv})` : version;

  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
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
