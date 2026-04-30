import haskellIconUrl from "../../assets/haskell.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function HaskellSegment({ version, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-haskell-bg)";
  const fg = bare ? "var(--prompt-haskell-tint)" : "var(--prompt-haskell-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`GHC ${version}`} style={style}>
      <img src={haskellIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "10ch" }}>{version}</span>
    </button>
  );
}
