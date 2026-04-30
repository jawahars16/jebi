import { useState, useEffect } from "react";
import clockIconUrl from "../../assets/clock.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function TimeSegment({ rowHeight, iconSize, segmentRadius, bare }) {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-time-bg)";
  const fg = bare ? "var(--prompt-time-tint)" : "var(--prompt-time-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius });

  return (
    <div onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title="Current time" style={{ ...style, cursor: "default" }}>
      <img src={clockIconUrl} alt="" aria-hidden="true" width={iconSize} height={iconSize} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span>{time}</span>
    </div>
  );
}
