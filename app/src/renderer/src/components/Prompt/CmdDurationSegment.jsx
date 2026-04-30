import timerIconUrl from "../../assets/timer.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

function formatDur(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export default function CmdDurationSegment({ durationMs, rowHeight, iconSize, segmentRadius, bare }) {
  if (durationMs == null) return null;

  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-cmdduration-bg)";
  const fg = bare ? "var(--prompt-cmdduration-tint)" : "var(--prompt-cmdduration-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius });

  return (
    <div onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={`Took ${formatDur(durationMs)}`} style={{ ...style, cursor: "default" }}>
      <img src={timerIconUrl} alt="" aria-hidden="true" width={iconSize} height={iconSize} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span>{formatDur(durationMs)}</span>
    </div>
  );
}
