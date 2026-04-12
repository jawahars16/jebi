import TerminalPane from '../TerminalPane'

// PaneContainer — recursively renders a layout tree node.
//
// Leaf nodes render a TerminalPane keyed by paneId so React never
// re-mounts the terminal session across layout tree mutations.
//
// Split nodes render two PaneContainers in a flex row (horizontal)
// or flex column (vertical), separated by a thin divider.
export default function PaneContainer({
  node,
  activePaneId,
  onFocusPane,
  onSplitPane,
  onClosePane,
  onTitleChange,
  // paneCount: total leaf count in the current tab, used to decide
  // whether to show the close button (only when more than one pane exists)
  paneCount,
}) {
  if (node.type === 'leaf') {
    const { paneId } = node
    return (
      <TerminalPane
        key={paneId}
        paneId={paneId}
        isActive={paneId === activePaneId}
        onFocus={() => onFocusPane(paneId)}
        onTitleChange={title => onTitleChange(paneId, title)}
        onSplitRight={() => onSplitPane(paneId, 'horizontal')}
        onSplitDown={() => onSplitPane(paneId, 'vertical')}
        onClose={paneCount > 1 ? () => onClosePane(paneId) : null}
      />
    )
  }

  const isHorizontal = node.direction === 'horizontal'
  const sharedProps = { activePaneId, onFocusPane, onSplitPane, onClosePane, onTitleChange, paneCount }

  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
      <div className="flex flex-1 min-h-0 min-w-0" style={{ flex: '0 0 50%' }}>
        <PaneContainer node={node.first} {...sharedProps} />
      </div>

      {/* Divider */}
      <div
        className="shrink-0"
        style={{
          width: isHorizontal ? '4px' : undefined,
          height: isHorizontal ? undefined : '4px',
          backgroundColor: 'var(--border)',
        }}
      />

      <div className="flex flex-1 min-h-0 min-w-0">
        <PaneContainer node={node.second} {...sharedProps} />
      </div>
    </div>
  )
}
