import rustIconUrl from "../../assets/rust.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function RustSegment({ version, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-rust-bg)";
  const fg = bare ? "var(--prompt-rust-tint)" : "var(--prompt-rust-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`Rust ${version}`} style={style}>
      <img src={rustIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "10ch" }}>{version}</span>
    </button>
  );
}
