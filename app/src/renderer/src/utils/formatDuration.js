// Formats a millisecond duration into a human-readable string.
//   < 1 s  → "342ms"
//   < 1 m  → "4.1s"
//   >= 1 m → "2m 13s"
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}
