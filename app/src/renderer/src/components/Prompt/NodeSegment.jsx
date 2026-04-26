import nodeIconUrl from "../../assets/node.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

// NodeSegment — Node.js version and package manager badge.
// onClick: in InputBar → runs `npm/yarn/pnpm/bun run`; in xterm decoration → copies version.
export default function NodeSegment({
  version,
  packageManager,
  onClick,
  rowHeight,
  iconSize,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-node-bg)";
  const fg = "var(--prompt-node-fg)";

  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
      title={`Node ${version} · ${packageManager}`}
      style={style}
    >
      <img
        src={nodeIconUrl}
        alt=""
        aria-hidden="true"
        width={iconSize + 2}
        height={iconSize + 2}
        style={{ flexShrink: 0, objectFit: "contain" }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "8ch",
        }}
      >
        {version}
      </span>
    </button>
  );
}
