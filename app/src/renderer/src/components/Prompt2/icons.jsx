// Brand SVG icons for prompt segments.
// Inline SVGs avoid new package dependencies and stay crisp at 10-14px.
// Each accepts { size, color } and sets flexShrink: 0 so flex layout never squishes them.

export function GitIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Git diamond-fork logo — simplified from git-scm.com brand */}
      <path d="M15.698 7.287 8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.55 1.56l1.773 1.773a1.224 1.224 0 0 1 1.267 2.025 1.226 1.226 0 0 1-2.002-1.334L8.49 5.865v4.198a1.226 1.226 0 0 1 .325 2.405 1.226 1.226 0 0 1-1.218-1.225c0-.348.146-.662.38-.887V5.797a1.226 1.226 0 0 1-.666-1.607L5.48 2.371.302 7.55a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.03 1.03 0 0 0 0-1.453z" />
    </svg>
  )
}

export function NodeIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Node.js hexagon — simplified from nodejs.org brand kit */}
      <path d="M8 .5 1 4.5v7l7 4 7-4v-7L8 .5zm0 1.155 5.5 3.175v6.35L8 14.345l-5.5-3.165V4.83L8 1.655zM8 4 4 6.25v3.5L8 12l4-2.25v-3.5L8 4zm0 1.155 2.5 1.443v2.904L8 10.845 5.5 9.502V6.598L8 5.155z" />
    </svg>
  )
}
