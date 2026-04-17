import { GitBranch } from '@phosphor-icons/react';

// GitSegment — renders a git context badge: branch name, dirty indicator, ahead/behind counts.
// onClick behavior differs by context:
//   InputBar  → runs `git status` in the active shell
//   xterm decoration → copies branch name to clipboard
export default function GitSegment({ branch, dirty, ahead, behind, onClick }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      title={`Branch: ${branch}${dirty ? " (dirty)" : ""}${ahead ? ` ↑${ahead}` : ""}${behind ? ` ↓${behind}` : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-primary)",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <GitBranch size={14} color="var(--accent)" weight="regular" />
      <span
        style={{
          maxWidth: "20ch",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {branch}
      </span>
      {dirty && (
        <span style={{ color: "var(--accent)", lineHeight: 1 }}>•</span>
      )}
      {ahead > 0 && (
        <span style={{ color: "var(--text-primary)", fontSize: "11px" }}>
          ↑{ahead}
        </span>
      )}
      {behind > 0 && (
        <span style={{ color: "var(--text-primary)", fontSize: "11px" }}>
          ↓{behind}
        </span>
      )}
    </button>
  );
}
