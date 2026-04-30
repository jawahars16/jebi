import javaIconUrl from "../../assets/java.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function JavaSegment({ version, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-java-bg)";
  const fg = bare ? "var(--prompt-java-tint)" : "var(--prompt-java-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`Java ${version}`} style={style}>
      <img src={javaIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "10ch" }}>{version}</span>
    </button>
  );
}
