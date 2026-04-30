// Powerline-style right-pointing triangle.
// `color` = previous segment's bg (fill color of the arrow head).
// The triangle sits on top of whatever is underneath (next segment bg or surface bg),
// producing a clean angular transition.

export default function TriangleSeparator({ color, height = 20 }) {
  const w = Math.max(8, Math.round(height * 0.55))
  // preserveAspectRatio=none + alignSelf:stretch lets the triangle scale to
  // match the flex row's actual height regardless of the `height` prop, so
  // the cap always aligns perfectly with adjacent segments.
  return (
    <svg
      width={w}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', flexShrink: 0, alignSelf: 'stretch', height: '100%' }}
      aria-hidden="true"
    >
      <polygon points={`0,0 ${w},${height / 2} 0,${height}`} fill={color} />
    </svg>
  )
}
