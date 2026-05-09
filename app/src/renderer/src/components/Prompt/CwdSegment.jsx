import { useState } from "react";
import { VscFolder, VscFolderActive } from "react-icons/vsc";
import {
  neonGlassStyle,
  neonGlassHoverStyle,
  stopSegmentEvents,
} from "./segmentStyle";

export default function CwdSegment({
  cwd,
  exitCode = 0,
  rowHeight,
  iconSize,
  onClick,
  minimal,
}) {
  const [hovered, setHovered] = useState(false);
  const compact = rowHeight != null;
  const tint = "var(--tab-accent)";
  const base = neonGlassStyle({ tint, compact, rowHeight, onClick, minimal });
  const style = hovered ? { ...base, ...neonGlassHoverStyle(tint, minimal) } : base;

  const parts = buildParts(cwd);

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={cwd}
      style={style}
    >
      <VscFolder size={iconSize ?? 12} style={{ flexShrink: 0 }} />
      {parts.map((p, i) => (
        <span
          key={i}
          style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
        >
          {i > 0 && <span style={{ opacity: 0.45, fontSize: "0.8em" }}>›</span>}
          <span style={{ opacity: i === parts.length - 1 ? 1 : 0.65 }}>
            {p}
          </span>
        </span>
      ))}
    </button>
  );
}

function buildParts(p) {
  if (!p) return ["~"];
  const home = p.match(/^\/Users\/[^/]+/);
  const rel = home ? "~" + p.slice(home[0].length) : p;
  const parts = rel.split("/").filter(Boolean);
  if (rel === "~" || parts.length === 0) return ["~"];
  const last4 = parts.slice(-4);
  return last4;
}
