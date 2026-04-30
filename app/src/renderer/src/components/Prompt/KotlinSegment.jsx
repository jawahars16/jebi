import kotlinIconUrl from "../../assets/kotlin.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function KotlinSegment({ version, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-kotlin-bg)";
  const fg = bare ? "var(--prompt-kotlin-tint)" : "var(--prompt-kotlin-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`Kotlin ${version}`} style={style}>
      <img src={kotlinIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "10ch" }}>{version}</span>
    </button>
  );
}
