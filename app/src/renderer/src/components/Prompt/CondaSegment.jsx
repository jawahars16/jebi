import condaIconUrl from "../../assets/conda.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function CondaSegment({ env, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-conda-bg)";
  const fg = bare ? "var(--prompt-conda-tint)" : "var(--prompt-conda-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`Conda: ${env}`} style={style}>
      <img src={condaIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "12ch" }}>{env}</span>
    </button>
  );
}
