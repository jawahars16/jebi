import { FaNodeJs } from "react-icons/fa";
import { RiNpmjsFill } from "react-icons/ri";

// NodeSegment — Node.js version and package manager badge.
// onClick: in InputBar → runs `npm/yarn/pnpm/bun run`; in xterm decoration → copies version.
export default function NodeSegment({
  version,
  packageManager,
  onClick,
  rowHeight,
  iconSize,
}) {
  const compact = rowHeight != null;
  const paddingH = compact ? 7 : 10;
  const paddingV = compact ? 0 : 4;

  const bg = "#23347b";
  const fg = "#ffffff";

  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: compact ? `${rowHeight}px` : undefined,
    minHeight: compact ? `${rowHeight}px` : undefined,
    padding: `${paddingV}px ${paddingH}px`,
    backgroundColor: bg,
    color: fg,
    lineHeight: 1,
    flexShrink: 0,
    whiteSpace: "nowrap",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-mono)",
    fontWeight: 500,
    border: "none",
    cursor: onClick ? "pointer" : "default",
  };

  const stopEvents = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <button
      onClick={onClick}
      onMouseDown={stopEvents}
      onPointerDown={stopEvents}
      title={`Node ${version} · ${packageManager}`}
      style={style}
    >
      <FaNodeJs size={iconSize + 2} />
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
