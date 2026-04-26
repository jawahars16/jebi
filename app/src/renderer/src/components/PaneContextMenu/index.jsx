// Right-click context menu for terminal panes.
// Pure presentational — all actions are passed in as callbacks from App.jsx.

export default function PaneContextMenu({ x, y, canClose, onSplitRight, onSplitDown, onClose, onNewTab, onCopy, onToggleTabPosition }) {
  const menuStyle = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 10000,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 0',
    minWidth: 168,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    fontFamily: 'var(--font-ui, system-ui)',
    fontSize: 'var(--font-size-ui)',
  }
  const divStyle = { height: 1, background: 'var(--border)', margin: '4px 0' }

  return (
    <div style={menuStyle} onMouseDown={(e) => e.stopPropagation()}>
      <PaneMenuItem onMouseDown={onCopy} shortcut="⌘⇧C">Copy</PaneMenuItem>
      <div style={divStyle} />
      <PaneMenuItem onMouseDown={onSplitRight} shortcut="⌘D">Split Right</PaneMenuItem>
      <PaneMenuItem onMouseDown={onSplitDown} shortcut="⌘⇧D">Split Down</PaneMenuItem>
      <div style={divStyle} />
      <PaneMenuItem onMouseDown={onNewTab} shortcut="⌘T">New Tab</PaneMenuItem>
      <PaneMenuItem onMouseDown={onToggleTabPosition}>Toggle Tab Bar</PaneMenuItem>
      {canClose && (
        <>
          <div style={divStyle} />
          <PaneMenuItem onMouseDown={onClose} shortcut="⌘W" danger>Close Pane</PaneMenuItem>
        </>
      )}
    </div>
  )
}

function PaneMenuItem({ children, onMouseDown, shortcut, danger }) {
  return (
    <button
      onMouseDown={onMouseDown}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 24, padding: '6px 8px',
        width: 'calc(100% - 8px)',
        textAlign: 'left',
        background: 'transparent', border: 'none', borderRadius: 4, margin: '0 4px',
        cursor: 'pointer',
        color: danger ? '#f87171' : 'var(--text-primary)',
        fontFamily: 'var(--font-ui, system-ui)',
        fontSize: 'var(--font-size-ui)',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-base)' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span>{children}</span>
      {shortcut && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{shortcut}</span>}
    </button>
  )
}
