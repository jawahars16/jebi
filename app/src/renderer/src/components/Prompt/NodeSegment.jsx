import nodeIconUrl from "../../assets/node.png";

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
  const paddingH = bare ? 0 : (compact ? 7 : 10);
  const paddingV = compact ? 0 : 4;

  const bg = bare ? "transparent" : "var(--prompt-node-bg)";
  const fg = "var(--prompt-node-fg)";

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
    borderRadius: segmentRadius != null ? `${segmentRadius}px` : 0,
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
