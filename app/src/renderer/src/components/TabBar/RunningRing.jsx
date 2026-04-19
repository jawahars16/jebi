// RunningRing — 22×22 icon slot. When `running` is true, the icon itself
// breathes (opacity pulse) so the user can see activity without adding extra
// geometry that fights with the pill's edges.

export default function RunningRing({ children, running }) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0${running ? ' tab-icon-pulse' : ''}`}
      style={{ width: 22, height: 22 }}
    >
      {children}
    </span>
  )
}
