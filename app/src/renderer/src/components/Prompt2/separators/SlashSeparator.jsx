// Slant-style separator — a forward-leaning wedge.
// `color` = previous segment's bg; extends the previous segment with a slanted right edge.
// Placed between segments (and as the group's trailing cap) to produce a parallelogram look.

export default function SlashSeparator({ color, height = 20 }) {
  const w = Math.max(10, Math.round(height * 0.55))
  return (
    <div
      aria-hidden="true"
      style={{
        width: `${w}px`,
        backgroundColor: color,
        clipPath: 'polygon(0 0, 100% 0, 0 100%)',
        flexShrink: 0,
        alignSelf: 'stretch',
      }}
    />
  )
}
