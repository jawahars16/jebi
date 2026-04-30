import userIconUrl from "../../assets/user.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

export default function UsernameSegment({ username, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-username-bg)";
  const fg = bare ? "var(--prompt-username-tint)" : "var(--prompt-username-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius });

  return (
    <div onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={username} style={{ ...style, cursor: "default" }}>
      <img src={userIconUrl} alt="" aria-hidden="true" width={iconSize} height={iconSize} style={{ flexShrink: 0, objectFit: "contain" }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "12ch" }}>{username}</span>
    </div>
  );
}
