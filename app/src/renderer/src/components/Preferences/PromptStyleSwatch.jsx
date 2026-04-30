// Mini preview of a prompt style preset. Three stub "segments" laid out with
// the preset's separator/edge shape, rendered at miniature scale.
//
// Note: inner preview colors intentionally use fixed theme-variable references
// so the swatch reflects whatever theme is active.

const SWATCH_COLORS = [
  "var(--tab-accent, var(--accent))",
  "var(--prompt-go-tint, #00acd7)",
  "var(--prompt-git-tint, #eb6200)",
];

function miniPreview(preset) {
  // Minimal: plain colored text blocks with │ separators, no background.
  if (preset.id === "minimal") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        {SWATCH_COLORS.map((c, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: "3px" }}
          >
            {i > 0 && (
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "9px",
                  opacity: 0.5,
                }}
              >
                |
              </span>
            )}
            <div
              style={{
                width: "38px",
                height: "3px",
                background: c,
                borderRadius: "2px",
                opacity: 0.9,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  // Pill: neon glass segments — left border accent + tinted background.
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {SWATCH_COLORS.map((c, i) => (
        <div
          key={i}
          style={{
            height: "16px",
            minWidth: "60px",
            background: `color-mix(in srgb, ${c} 15%, transparent)`,
            borderLeft: `3px solid ${c}`,
          }}
        />
      ))}
    </div>
  );
}

export default function PromptStyleSwatch({ preset, isActive, onSelect }) {
  return (
    <button
      onClick={onSelect}
      style={{
        background: "none",
        border: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
        borderRadius: "8px",
        padding: "3px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "4px",
        outline: "none",
      }}
    >
      <div
        style={{
          borderRadius: "5px",
          border: "1px solid var(--border)",
          background: "var(--bg-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "58px",
          padding: "0 8px",
        }}
      >
        {miniPreview(preset)}
      </div>
      <span
        style={{
          fontSize: "11px",
          color: isActive ? "var(--accent)" : "var(--text-secondary)",
          textAlign: "center",
          fontWeight: isActive ? 600 : 400,
          fontFamily: "var(--font-ui)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {preset.name}
      </span>
    </button>
  );
}
