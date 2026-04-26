import { FaDocker } from "react-icons/fa";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

// DockerSegment — shown when dir contains a Dockerfile or compose file.
// `kind` is "compose" or "dockerfile".
export default function DockerSegment({
  kind,
  onClick,
  rowHeight,
  iconSize,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-docker-bg)";
  const fg = "var(--prompt-docker-fg)";

  const label = kind === "compose" ? "compose" : "docker";

  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
      title={kind === "compose" ? "Docker Compose project" : "Dockerfile present"}
      style={style}
    >
      <FaDocker size={iconSize + 2} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "10ch",
        }}
      >
        {label}
      </span>
    </button>
  );
}
