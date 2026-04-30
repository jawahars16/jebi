import macosIconUrl from "../../assets/macos.png";
import linuxIconUrl from "../../assets/linux.png";
import { pillStyle, stopSegmentEvents } from "./segmentStyle";

function resolveIcon(os) {
  if (os === "darwin" || os === "macos") return macosIconUrl;
  return linuxIconUrl;
}

function resolveLabel(os) {
  if (os === "darwin" || os === "macos") return "macOS";
  if (os?.startsWith("linux:")) return os.slice(6);
  return os ?? "Linux";
}

export default function OsSegment({ os, rowHeight, iconSize, segmentRadius, bare }) {
  const compact = rowHeight != null;
  const bg = bare ? "transparent" : "var(--prompt-os-bg)";
  const fg = bare ? "var(--prompt-os-tint)" : "var(--prompt-os-fg)";
  const style = pillStyle({ bare, compact, rowHeight, bg, fg, segmentRadius });
  const icon = resolveIcon(os);
  const label = resolveLabel(os);

  return (
    <div onMouseDown={stopSegmentEvents} onPointerDown={stopSegmentEvents} title={label} style={{ ...style, cursor: "default" }}>
      <img src={icon} alt="" aria-hidden="true" width={iconSize + 2} height={iconSize + 2} style={{ flexShrink: 0, objectFit: "contain" }} />
    </div>
  );
}
