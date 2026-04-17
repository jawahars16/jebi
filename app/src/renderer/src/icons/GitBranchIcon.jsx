export default function GitBranchIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      style={{ flexShrink: 0 }}
    >
      <path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 2.75a2.25 2.25 0 1 1-1.5-2.122V5A2.5 2.5 0 0 1 8.5 7.5H5.5a1 1 0 0 0-1 1v1.128a2.25 2.25 0 1 1-1.5 0V8.5a2.5 2.5 0 0 1 2.5-2.5H8.5A1 1 0 0 0 9.5 5V4.878A2.25 2.25 0 0 1 12.5 5.25zm-8.75 7a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0z" />
    </svg>
  )
}
