import { SiKubernetes } from "react-icons/si";

// K8sSegment — current kubectl context + namespace.
// Shown when dir is inside a k8s project (kustomization.yaml / Chart.yaml /
// k8s|kubernetes|helm|manifests directory) AND kubectl is available.
export default function K8sSegment({
  context,
  namespace,
  onClick,
  rowHeight,
  iconSize,
  segmentRadius,
  bare,
}) {
  const compact = rowHeight != null;
  const paddingH = bare ? 0 : (compact ? 7 : 10);
  const paddingV = compact ? 0 : 4;

  const bg = bare ? "transparent" : "var(--border)";
  const fg = "var(--text-primary)";

  // Hide namespace when it's "default" — reduces clutter.
  const label = namespace && namespace !== "default"
    ? `${context}:${namespace}`
    : context;

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
      title={`kubectl context: ${context} · namespace: ${namespace || "default"}`}
      style={style}
    >
      <SiKubernetes size={iconSize + 2} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "18ch",
        }}
      >
        {label}
      </span>
    </button>
  );
}
