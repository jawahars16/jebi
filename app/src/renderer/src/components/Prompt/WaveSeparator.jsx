const STYLE = `
@keyframes waveDrift {
  from { transform: translateX(0px); }
  to   { transform: translateX(-40px); }
}
`;

// Draws a repeating sine-wave approximated by cubic bezier curves.
// When running=false, amplitude collapses to 0 → visually identical to a line.
// SVG is 12px tall with overflow: hidden so the wide path (3000px) is clipped
// at the element's flex-assigned width and doesn't cover adjacent content.
export default function WaveSeparator({ running }) {
  const amp = running ? 3 : 0;

  // Build enough 40px-wide tiles to overfill any reasonable screen width (3000px / 40 = 75 tiles).
  // Each tile is one full sine period: a crest from 0→20, then a trough from 20→40.
  // Both bezier curves use control points at the same extremum y so the curve peaks cleanly.
  // The 1.3x multiplier compensates for cubic bezier max reaching only ~0.75 of control y.
  const tiles = 75;
  const cy = amp * 1.3;
  let d = `M 0 0`;
  for (let i = 0; i < tiles; i++) {
    const x = i * 40;
    d += ` C ${x + 5} ${-cy}, ${x + 15} ${-cy}, ${x + 20} 0`;
    d += ` C ${x + 25} ${cy}, ${x + 35} ${cy}, ${x + 40} 0`;
  }

  const pathStyle = {
    stroke: "rgba(255,255,255,0.4)",
    strokeWidth: 1,
    fill: "none",
    animation: running ? "waveDrift 1s linear infinite" : "none",
  };

  return (
    <>
      <style>{STYLE}</style>
      <svg
        style={{
          flex: 1,
          height: "12px",
          overflow: "hidden",
          minWidth: 0,
          opacity: 0.7,
        }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g transform="translate(0, 6)">
          <path d={d} style={pathStyle} />
        </g>
      </svg>
    </>
  );
}
