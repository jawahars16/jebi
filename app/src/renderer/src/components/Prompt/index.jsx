import { useState, useSyncExternalStore } from "react";
import { FaRegCopy, FaCheck, FaRedo, FaInfoCircle } from "react-icons/fa";
import CwdSegment from "./CwdSegment";
import GitSegment from "./GitSegment";
import NodeSegment from "./NodeSegment";
import GoSegment from "./GoSegment";
import PythonSegment from "./PythonSegment";
import DockerSegment from "./DockerSegment";
import K8sSegment from "./K8sSegment";
import WaveSeparator from "./WaveSeparator";
import TriangleSeparator from "./separators/TriangleSeparator";
import SlashSeparator from "./separators/SlashSeparator";
import DotSeparator from "./separators/DotSeparator";
import {
  getPromptStyle,
  getPromptStyleId,
  subscribePromptStyle,
} from "../../preferences/promptStyles";
import infoIconUrl from "../../assets/info.png";

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

// Per-segment bg color used for Powerline/Slant separators that need to "extend"
// the previous segment's color into an arrow/wedge sitting on the surface bg.
// Reads the same --prompt-{kind}-bg var the segment itself paints with so the
// separator never drifts out of sync with the segment's color.
function segmentBg(kind) {
  return `var(--prompt-${kind}-bg)`;
}

export default function Prompt({
  command,
  cwd,
  exitCode,
  rowHeight,
  onCopy,
  onReplay,
  startTime,
  duration,
  gitData,
  onGitClick,
  nodeData,
  onNodeClick,
  goData,
  onGoClick,
  pythonData,
  onPythonClick,
  dockerData,
  onDockerClick,
  k8sData,
  onK8sClick,
  running,
}) {
  // Read via module store, not context — Prompt is also rendered inside xterm
  // decoration React roots that live outside PreferencesProvider.
  const promptStyleId = useSyncExternalStore(
    subscribePromptStyle,
    getPromptStyleId,
  );
  const preset = getPromptStyle(promptStyleId);
  const { group, separator } = preset;

  const [copied, setCopied] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const commandLines = command ? command.split("\n") : [];

  const iconSize = rowHeight ? Math.min(14, Math.max(10, rowHeight - 6)) : 14;

  const rowStyle = rowHeight
    ? {
        height: `${rowHeight}px`,
        minHeight: `${rowHeight}px`,
        maxHeight: `${rowHeight}px`,
        overflow: "hidden",
      }
    : { lineHeight: 1.4 };

  function handleCopy(e) {
    e.stopPropagation();
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleReplay(e) {
    e.stopPropagation();
    onReplay?.();
  }

  const hasCwd = Boolean(cwd);
  const hasGit = Boolean(gitData);
  const hasNode = Boolean(nodeData);
  const hasGo = Boolean(goData);
  const hasPython = Boolean(pythonData);
  const hasDocker = Boolean(dockerData);
  const hasK8s = Boolean(k8sData);
  const hasAny =
    hasCwd || hasGit || hasNode || hasGo || hasPython || hasDocker || hasK8s;

  // Build ordered segment descriptors so separators can reference the
  // previous segment's bg color (for Powerline/Slant).
  const segmentList = [];
  if (hasCwd) segmentList.push({ kind: "cwd" });
  if (hasGit) segmentList.push({ kind: "git" });
  if (hasNode) segmentList.push({ kind: "node" });
  if (hasGo) segmentList.push({ kind: "go" });
  if (hasPython) segmentList.push({ kind: "python" });
  if (hasDocker) segmentList.push({ kind: "docker" });
  if (hasK8s) segmentList.push({ kind: "k8s" });

  // Resolve segment radius per preset.
  // 'dynamic' → rowHeight / 3 (used by Wave for gentle rounding)
  // 'pill'    → 9999 (full pill ends)
  // number    → literal px value
  const resolvedRadius =
    group.radius === "dynamic"
      ? rowHeight
        ? Math.max(4, Math.floor(rowHeight / 3))
        : 8
      : group.radius === "pill"
        ? 9999
        : group.radius;

  // Separator height tracks the segment height so triangles/slashes align.
  const sepHeight = rowHeight ?? 24;

  function renderSegment({ kind }, i) {
    const segProps = {
      key: `${kind}-${i}`,
      rowHeight,
      iconSize,
      bare: separator === "dot",
      // In pill mode each segment is a full independent pill.
      // In other modes segment radius is handled by the group wrapper (or 0).
      segmentRadius: group.connected ? undefined : resolvedRadius,
    };
    if (kind === "cwd")
      return (
        <CwdSegment
          {...segProps}
          cwd={cwd}
          exitCode={exitCode}
          onClick={() => window.electron?.openPath(cwd)}
        />
      );
    if (kind === "git")
      return (
        <GitSegment
          {...segProps}
          branch={gitData.branch}
          dirty={gitData.dirty}
          ahead={gitData.ahead}
          behind={gitData.behind}
          onClick={onGitClick}
        />
      );
    if (kind === "node")
      return (
        <NodeSegment
          {...segProps}
          version={nodeData.version}
          packageManager={nodeData.packageManager}
          onClick={onNodeClick}
        />
      );
    if (kind === "go")
      return (
        <GoSegment {...segProps} version={goData.version} onClick={onGoClick} />
      );
    if (kind === "python")
      return (
        <PythonSegment
          {...segProps}
          version={pythonData.version}
          venv={pythonData.venv}
          onClick={onPythonClick}
        />
      );
    if (kind === "docker")
      return (
        <DockerSegment
          {...segProps}
          kind={dockerData.kind}
          onClick={onDockerClick}
        />
      );
    if (kind === "k8s")
      return (
        <K8sSegment
          {...segProps}
          context={k8sData.context}
          namespace={k8sData.namespace}
          onClick={onK8sClick}
        />
      );
    return null;
  }

  function renderBetweenSeparator(prevKind, key) {
    if (separator === "triangle")
      return (
        <TriangleSeparator
          key={key}
          color={segmentBg(prevKind)}
          height={sepHeight}
        />
      );
    if (separator === "slash")
      return (
        <SlashSeparator
          key={key}
          color={segmentBg(prevKind)}
          height={sepHeight}
        />
      );
    if (separator === "dot") return <DotSeparator key={key} />;
    return null;
  }

  // Group wrapper: connected modes get a single flex row that clips the right
  // edge (Wave: rounded). Non-connected modes (Pill, Minimal) use gaps between
  // independent segments. alignItems:stretch ensures triangle/slash separators
  // always match segment height exactly.
  const groupStyle = {
    display: "inline-flex",
    alignItems: "stretch",
    flexShrink: 0,
  };

  if (group.connected) {
    if (group.rightCap === "round" && resolvedRadius > 0) {
      groupStyle.borderRadius = `0 ${resolvedRadius}px ${resolvedRadius}px 0`;
      groupStyle.overflow = "hidden";
    }
    // Powerline (triangle cap) / Slant (slash cap): the trailing separator
    // after the last segment produces the angled edge; no wrapper clip needed.
  } else if (separator === "dot") {
    // Minimal: DotSeparator carries its own horizontal padding — no extra gap.
    groupStyle.gap = 0;
    groupStyle.alignItems = "center";
  } else {
    // Pill: independent pills with a gentle gap.
    groupStyle.gap = "6px";
  }

  function renderGroup() {
    if (!hasAny) return null;

    const children = [];
    segmentList.forEach((seg, i) => {
      if (i > 0) {
        const between = renderBetweenSeparator(
          segmentList[i - 1].kind,
          `sep-${i}`,
        );
        if (between) children.push(between);
      }
      children.push(renderSegment(seg, i));
    });

    // Trailing cap: for Powerline/Slant, the last segment's color extends
    // into a final triangle/slash sitting on the surface bg.
    if (group.connected && segmentList.length > 0) {
      const lastKind = segmentList[segmentList.length - 1].kind;
      if (group.rightCap === "triangle")
        children.push(
          <TriangleSeparator
            key="cap"
            color={segmentBg(lastKind)}
            height={sepHeight}
          />,
        );
      if (group.rightCap === "slant")
        children.push(
          <SlashSeparator
            key="cap"
            color={segmentBg(lastKind)}
            height={sepHeight}
          />,
        );
    }

    return <div style={groupStyle}>{children}</div>;
  }

  return (
    <div
      className="flex flex-col select-none w-full bg-[var(--bg-surface)]"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-mono)",
      }}
    >
      {/* Row 1 */}
      <div
        className="flex items-center w-full"
        style={{ gap: "8px", ...rowStyle }}
      >
        {renderGroup()}

        {/* Always render a connecting line between prompt segments and the copy
            button. Flat when idle; animates into a wave while a command runs. */}
        <WaveSeparator running={running} />

        {onReplay && (
          <button
            onClick={handleReplay}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: `${iconSize + 10}px`,
              height: `${iconSize + 10}px`,
              title: "Run this command again",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              flexShrink: 0,
              transition: "color 0.15s",
            }}
            title="Run this command again"
          >
            <FaRedo size={iconSize} />
          </button>
        )}

        {onCopy && (
          <button
            onClick={handleCopy}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: `${iconSize + 10}px`,
              height: `${iconSize + 10}px`,
              background: "none",
              cursor: "pointer",
              border: "none",
              title: "Copy command and output",
              color: copied ? "var(--accent)" : "var(--text-secondary)",
              flexShrink: 0,
              transition: "color 0.15s",
            }}
            title="Copy command and output"
          >
            {copied ? (
              <FaCheck size={iconSize + 2} />
            ) : (
              <FaRegCopy size={iconSize + 2} />
            )}
          </button>
        )}

        {startTime != null && duration != null && (
          <div
            style={{
              flexShrink: 0,
              marginRight: "16px",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
            onMouseEnter={() => setInfoVisible(true)}
            onMouseLeave={() => setInfoVisible(false)}
          >
            {infoVisible ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "2px 8px",
                  backgroundColor: "var(--tab-accent)",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono)",
                  fontSize: `${iconSize}px`,
                  color: "var(--on-accent)",
                  whiteSpace: "nowrap",
                  animation: "slideInRight 0.15s ease-out",
                }}
              >
                <span>{new Date(startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{formatDuration(duration)}</span>
              </div>
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: `${iconSize + 10}px`,
                  height: `${iconSize + 10}px`,
                  color: "var(--text-muted)",
                  cursor: "default",
                }}
              >
                {/* <FaInfoCircle size={iconSize + 4} /> */}
                <img
                  src={infoIconUrl}
                  alt={`Exit code ${exitCode}`}
                  title={`Exit code: ${exitCode}`}
                  width={iconSize}
                  height={iconSize}
                  style={{
                    width: iconSize + 4,
                    height: iconSize + 4,
                    objectFit: "contain",
                    flexShrink: 0,
                  }}
                />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Rows 2+: command lines (xterm decoration only) */}
      {commandLines.map((line, i) => (
        <div
          key={i}
          className="flex items-center m-2 relative"
          style={{ ...rowStyle, paddingLeft: 22, paddingRight: 12 }}
        >
          {i === 0 && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 5,
                top: -1,
                bottom: "50%",
                width: 13,
                height: 18,
                borderLeft: "2px dotted var(--tab-accent)",
                borderBottom: "2px dotted var(--tab-accent)",
                borderBottomLeftRadius: 3,
                pointerEvents: "none",
              }}
            />
          )}
          <span className="ml-1 text-[var(--tab-accent)]">{line}</span>
        </div>
      ))}
    </div>
  );
}
