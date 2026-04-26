import bulbIconUrl from "../../assets/light-bulb.png";

function renderWithCode(text) {
  const re = /`+([^`]+)`+/g;
  if (!re.test(text)) return text;
  re.lastIndex = 0;
  const nodes = [];
  let key = 0;
  const raw = text;
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) nodes.push(raw.slice(last, m.index));
    nodes.push(
      <code
        key={key++}
        style={{
          background: "color-mix(in srgb, var(--tab-accent) 30%, transparent)",
          color: "#ffffff",
          fontWeight: 600,
          borderRadius: 3,
          padding: "1px 5px",
          fontFamily: "var(--font-mono)",
        }}
      >
        {m[1]}
      </code>,
    );
    last = m.index + m[0].length;
  }
  if (last < raw.length) nodes.push(raw.slice(last));
  return nodes;
}

export default function ExplanationPanel({ text, onDismiss }) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header: bulb icon + gradient line + dismiss */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "3px",
        }}
      >
        <img
          src={bulbIconUrl}
          className="bg-[var(--bg-surface)]"
          style={{
            width: 24,
            height: 24,
            flexShrink: 0,
            opacity: 0.85,
            left: 25,
            position: "absolute",
          }}
        />
        <div
          style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(90deg, #a855f7, #3b82f6)",
          }}
          className="mx-1"
        />
        {/* <button
          onClick={onDismiss}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            color: "var(--text-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontSize: "0.85em",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button> */}
      </div>
      {/* Explanation text */}
      <div
        style={{
          padding: "10px",
          fontFamily: "var(--font-mono)",
          fontSize: "calc(var(--font-size-mono) * 0.88)",
          color: "#ffffff",
          lineHeight: 1.5,
        }}
      >
        {renderWithCode(text)}
      </div>
    </div>
  );
}
