import { useState, useSyncExternalStore } from "react";
import { VscCopy, VscCheck, VscDebugRestart, VscWatch } from "react-icons/vsc";
import CwdSegment from "./CwdSegment";
import GitSegment from "./GitSegment";
import NodeSegment from "./NodeSegment";
import GoSegment from "./GoSegment";
import PythonSegment from "./PythonSegment";
import DockerSegment from "./DockerSegment";
import K8sSegment from "./K8sSegment";
import RustSegment from "./RustSegment";
import CSegment from "./CSegment";
import PhpSegment from "./PhpSegment";
import JavaSegment from "./JavaSegment";
import KotlinSegment from "./KotlinSegment";
import HaskellSegment from "./HaskellSegment";
import CondaSegment from "./CondaSegment";
import { MdAccessTimeFilled } from "react-icons/md";
import {
  getSegmentEnabled,
  subscribeSegmentPrefs,
  getSegmentPrefSnapshot,
} from "../../preferences/segments";
import { formatDuration } from "../../utils/formatDuration";

const SEP = (
  <span
    aria-hidden
    style={{
      color: "var(--text-secondary)",
      opacity: 0.5,
      flexShrink: 0,
      fontFamily: "var(--font-mono)",
      userSelect: "none",
      fontSize: "0.9em",
      paddingLeft: "2px",
      paddingRight: "2px",
    }}
  >
    │
  </span>
);

export default function Prompt({
  command,
  cwd,
  exitCode,
  rowHeight,
  cellHeight,
  showSeparator = true,
  running = false,
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
  rustData,
  onRustClick,
  phpData,
  onPhpClick,
  javaData,
  onJavaClick,
  kotlinData,
  onKotlinClick,
  haskellData,
  onHaskellClick,
  cData,
  onCClick,
  condaData,
  onCondaClick,
}) {
  useSyncExternalStore(subscribeSegmentPrefs, getSegmentPrefSnapshot);
  const seg = getSegmentEnabled;

  const [copied, setCopied] = useState(false);
  const [timeHovered, setTimeHovered] = useState(false);
  const commandLines = command ? command.split("\n") : [];

  const iconSize = 13;

  const rowStyle = rowHeight
    ? { minHeight: `${rowHeight}px`, alignItems: "center" }
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

  const segmentList = [];
  if (seg("cwd") && cwd) segmentList.push({ kind: "cwd" });
  if (seg("git") && gitData) segmentList.push({ kind: "git" });
  if (seg("rust") && rustData) segmentList.push({ kind: "rust" });
  if (seg("c") && cData) segmentList.push({ kind: "c" });
  if (seg("node") && nodeData) segmentList.push({ kind: "node" });
  if (seg("go") && goData) segmentList.push({ kind: "go" });
  if (seg("php") && phpData) segmentList.push({ kind: "php" });
  if (seg("java") && javaData) segmentList.push({ kind: "java" });
  if (seg("kotlin") && kotlinData) segmentList.push({ kind: "kotlin" });
  if (seg("haskell") && haskellData) segmentList.push({ kind: "haskell" });
  if (seg("python") && pythonData) segmentList.push({ kind: "python" });
  if (seg("docker") && dockerData) segmentList.push({ kind: "docker" });
  if (seg("k8s") && k8sData) segmentList.push({ kind: "k8s" });
  if (seg("conda") && condaData) segmentList.push({ kind: "conda" });

  const segProps = { rowHeight, iconSize };

  function renderSegment({ kind }, i) {
    const key = `${kind}-${i}`;
    if (kind === "cwd")
      return (
        <CwdSegment
          key={key}
          {...segProps}
          cwd={cwd}
          exitCode={exitCode}
          onClick={() => window.electron?.openPath(cwd)}
        />
      );
    if (kind === "git")
      return (
        <GitSegment
          key={key}
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
          key={key}
          {...segProps}
          version={nodeData.version}
          packageManager={nodeData.packageManager}
          onClick={onNodeClick}
        />
      );
    if (kind === "go")
      return (
        <GoSegment
          key={key}
          {...segProps}
          version={goData.version}
          onClick={onGoClick}
        />
      );
    if (kind === "python")
      return (
        <PythonSegment
          key={key}
          {...segProps}
          version={pythonData.version}
          venv={pythonData.venv}
          onClick={onPythonClick}
        />
      );
    if (kind === "docker")
      return (
        <DockerSegment
          key={key}
          {...segProps}
          kind={dockerData.kind}
          onClick={onDockerClick}
        />
      );
    if (kind === "k8s")
      return (
        <K8sSegment
          key={key}
          {...segProps}
          context={k8sData.context}
          namespace={k8sData.namespace}
          onClick={onK8sClick}
        />
      );
    if (kind === "rust")
      return (
        <RustSegment
          key={key}
          {...segProps}
          version={rustData.version}
          onClick={onRustClick}
        />
      );
    if (kind === "c")
      return (
        <CSegment
          key={key}
          {...segProps}
          version={cData.version}
          onClick={onCClick}
        />
      );
    if (kind === "php")
      return (
        <PhpSegment
          key={key}
          {...segProps}
          version={phpData.version}
          onClick={onPhpClick}
        />
      );
    if (kind === "java")
      return (
        <JavaSegment
          key={key}
          {...segProps}
          version={javaData.version}
          onClick={onJavaClick}
        />
      );
    if (kind === "kotlin")
      return (
        <KotlinSegment
          key={key}
          {...segProps}
          version={kotlinData.version}
          onClick={onKotlinClick}
        />
      );
    if (kind === "haskell")
      return (
        <HaskellSegment
          key={key}
          {...segProps}
          version={haskellData.version}
          onClick={onHaskellClick}
        />
      );
    if (kind === "conda")
      return (
        <CondaSegment
          key={key}
          {...segProps}
          env={condaData.env}
          onClick={onCondaClick}
        />
      );
    return null;
  }

  const hasError = exitCode > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginTop: 6,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-mono)",
        userSelect: "none",
      }}
    >
      {rowHeight != null && showSeparator && (
        <div
          style={{
            height: "1px",
            background: "var(--tab-accent)",
            flexShrink: 0,
            opacity: 0.25,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {running && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)",
                backgroundSize: "50% 100%",
                backgroundRepeat: "no-repeat",
                animation: "promptRunning 1.2s ease-in-out infinite",
              }}
            />
          )}
        </div>
      )}
      <div
        style={{
          display: "flex",
          marginTop: "-9px",
          ...rowStyle,
        }}
      >
        {/* Segments with │ separators */}
        {segmentList.map((s, i) => (
          <span
            key={s.kind}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            {renderSegment(s, i)}
          </span>
        ))}

        {/* Error pill — shown after segments when exitCode > 0 */}
        {hasError && (
          <>
            <span
              style={{
                background: "color-mix(in srgb, #f85149 12%, transparent)",
                color: "#f85149",
                borderLeft: "4px solid #f85149",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                lineHeight: 1,
                padding: "5px 10px",
                flexShrink: 0,
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--font-size-mono)",
                fontWeight: 500,
                cursor: "default",
                transition: "background 0.15s ease, box-shadow 0.15s ease",
                userSelect: "none",
              }}
            >
              ✕ exit {exitCode}
            </span>
          </>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Timing — always visible but minimal; hover reveals full timestamp */}
        {duration != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              marginRight: 8,
              cursor: "pointer",
            }}
            onMouseEnter={() => setTimeHovered(true)}
            onMouseLeave={() => setTimeHovered(false)}
          >
            {timeHovered && startTime != null ? (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "2px 7px",
                  borderRadius: 3,
                  fontSize: `${iconSize - 1}px`,
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  animation: "slideInRight 0.12s ease-out",
                }}
              >
                <MdAccessTimeFilled
                  size={iconSize - 1}
                  style={{ opacity: 0.6 }}
                />
                <span>
                  {new Date(startTime).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{formatDuration(duration)}</span>
              </span>
            ) : (
              <span
                style={{
                  fontSize: `${iconSize - 1}px`,
                  color: "var(--text-muted)",
                  opacity: 0.5,
                }}
              >
                {formatDuration(duration)}
              </span>
            )}
          </div>
        )}

        {/* Replay */}
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
            title="Run again"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 5,
              width: iconSize + 10,
              height: iconSize + 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              opacity: 0.4,
              flexShrink: 0,
              transition: "opacity 0.15s, color 0.15s",
              borderRadius: 3,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = 1;
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = 0.4;
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <VscDebugRestart size={iconSize} />
          </button>
        )}

        {/* Copy */}
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
            title="Copy command and output"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 5,
              width: iconSize + 10,
              height: iconSize + 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: copied ? "var(--accent)" : "var(--text-muted)",
              opacity: copied ? 1 : 0.4,
              flexShrink: 0,
              transition: "opacity 0.15s, color 0.15s",
              borderRadius: 3,
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.opacity = 1;
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.opacity = 0.4;
                e.currentTarget.style.color = "var(--text-muted)";
              }
            }}
          >
            {copied ? (
              <VscCheck size={iconSize} />
            ) : (
              <VscCopy size={iconSize} />
            )}
          </button>
        )}
      </div>

      {/* Command lines — xterm decoration only */}
      {commandLines.map((line, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            position: "relative",
            ...(cellHeight
              ? { minHeight: `${cellHeight}px`, alignItems: "center" }
              : { lineHeight: 1.4 }),
            overflow: "visible",
            paddingLeft: 25,
            paddingRight: 12,
            paddingBottom: 8,
          }}
        >
          {i === 0 && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 15,
                top: 1,
                bottom: "50%",
                width: 13,
                height: 15,
                borderLeft:
                  "2px dotted color-mix(in srgb, var(--tab-accent) 30%, transparent)",
                borderBottom:
                  "2px dotted color-mix(in srgb, var(--tab-accent) 30%, transparent)",
                borderBottomLeftRadius: 3,
                pointerEvents: "none",
              }}
            />
          )}
          <span
            style={{
              marginLeft: 10,
              color:
                "color-mix(in srgb, var(--tab-accent) 70%, var(--text-primary))",
            }}
          >
            {line}
          </span>
        </div>
      ))}
    </div>
  );
}
