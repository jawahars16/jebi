import { SiKubernetes } from "react-icons/si";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

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
  const bg = bare ? "transparent" : "var(--prompt-k8s-bg)";
  const fg = "var(--prompt-k8s-fg)";

  // Hide namespace when it's "default" — reduces clutter.
  const label = namespace && namespace !== "default"
    ? `${context}:${namespace}`
    : context;

  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius, onClick });

  return (
    <button
      onClick={onClick}
      onMouseDown={stopSegmentEvents}
      onPointerDown={stopSegmentEvents}
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
