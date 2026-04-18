import { PackageIcon } from '@phosphor-icons/react'

// NodeSegment — renders a node.js context badge: version and package manager.
// onClick behavior differs by context:
//   InputBar  → runs `npm run` / `yarn run` / `pnpm run` / `bun run`
//   xterm decoration → copies node version to clipboard
export default function NodeSegment({ version, packageManager, onClick }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
      title={`Node ${version} · ${packageManager}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-primary)',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <PackageIcon size={20} color="var(--accent)" weight="regular" />
      <span style={{ whiteSpace: 'nowrap' }}>{version}</span>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{packageManager}</span>
    </button>
  )
}
