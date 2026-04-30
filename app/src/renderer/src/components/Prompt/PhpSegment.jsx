import phpIconUrl from "../../assets/php.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function PhpSegment({ version, onClick, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-php-bg)";
  const fg = bare ? "var(--prompt-php-tint)" : "var(--prompt-php-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button onClick={onClick} onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`PHP ${version}`} style={style}>
      <img src={phpIconUrl} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "10ch" }}>{version}</span>
    </button>
  );
}
