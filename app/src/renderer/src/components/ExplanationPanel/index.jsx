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
    <div className="relative z-20 flex flex-col">
      {/* Header: bulb icon centered on the AI gradient divider line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "3px",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 1,
            background: "var(--border)",
          }}
        />
        <span
          className="bg-[var(--bg-surface)] px-3 "
          style={{
            fontFamily: "var(--font-ui, system-ui)",
            fontSize: "10px",
            color: "var(--text-muted)",
            right: 20,
            position: "absolute",
            whiteSpace: "nowrap",
          }}
        >
          AI · may be inaccurate
        </span>
      </div>
      {/* Explanation text */}
      <div
        style={{
          padding: "10px",
          fontFamily: "var(--font-mono)",
          fontSize: "calc(var(--font-size-mono) * 0.88)",
          color: "var(--text-primary)",
          lineHeight: 1.5,
        }}
        className="mt-1 mb-2 bg-[var(--bg-surface)]"
      >
        {renderWithCode(text)}
      </div>
    </div>
  );
}
