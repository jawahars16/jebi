import cIconUrl from "../../assets/c.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function CSegment({ version, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-c-bg)";
  const fg = bare ? "var(--prompt-c-tint)" : "var(--prompt-c-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`C/C++ ${version}`} style={style}>
      <img src={cIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "12ch" }}>{version}</span>
    </button>
  );
}
