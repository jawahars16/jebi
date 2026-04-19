// TabBar — renders tab pills and action buttons.
// Supports two positions:
//   'top'  — horizontal strip, lives inside the h-9 drag row
//   'left' — vertical strip, lives beside the pane area
//
// All interactive elements carry [-webkit-app-region:no-drag] so clicks work
// even though the parent drag strip has drag enabled.

import { usePaneInfo, computeTabTitle } from '../../hooks/usePaneInfo'

export default function TabBar({
  tabs,
  activeTabId,
  position,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTogglePosition,
  onSplitRight,
  onSplitDown,
}) {
  const isTop = position === 'top'

  return isTop
    ? <TopTabBar {...{ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown }} />
    : <LeftTabBar {...{ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown }} />
}

function TopTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown }) {
  return (
    <div
      className="flex-1 flex items-center gap-1 px-2 overflow-hidden"
      style={{ fontFamily: 'var(--font-ui)', borderBottom: '1px solid var(--accent)' }}
    >
      {/* Tab pills — no-drag so clicks register */}
      <div className="flex items-center gap-1 overflow-hidden [-webkit-app-region:no-drag]">
        {tabs.map(tab => (
          <TabPill
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onClose={tabs.length > 1 ? () => onCloseTab(tab.id) : null}
          />
        ))}
      </div>

      {/* New tab button */}
      <button
        title="New Tab (⌘T)"
        onClick={onNewTab}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] select-none [-webkit-app-region:no-drag]"
        style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-ui)' }}
      >
        +
      </button>

      {/* Empty space — inherits drag from the parent h-9 strip */}
      <div className="flex-1" />

      {/* Split buttons */}
      <div className="flex items-center gap-1 shrink-0 [-webkit-app-region:no-drag]">
        <IconButton title="Split Right (⌘D)" onClick={onSplitRight}>⊢</IconButton>
        <IconButton title="Split Down (⌘⇧D)" onClick={onSplitDown}>⊥</IconButton>
        <IconButton title="Toggle tab bar position" onClick={onTogglePosition}>⊣</IconButton>
      </div>
    </div>
  )
}

function LeftTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown }) {
  return (
    <div
      className="flex flex-col py-2 gap-0.5 shrink-0 border-r [-webkit-app-region:no-drag]"
      style={{
        width: '160px',
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-surface)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Tab pills — full width with title */}
      {tabs.map(tab => (
        <LeftTabPill
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onSelectTab(tab.id)}
          onClose={tabs.length > 1 ? () => onCloseTab(tab.id) : null}
        />
      ))}

      {/* New tab button */}
      <button
        title="New Tab (⌘T)"
        onClick={onNewTab}
        className="mx-2 mt-1 h-7 flex items-center gap-1.5 px-2 rounded hover:bg-[var(--bg-elevated)] select-none"
        style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-ui)' }}
      >
        <span>+</span>
        <span>New Tab</span>
      </button>

      <div className="flex-1" />

      {/* Split + toggle buttons at bottom */}
      <div className="flex flex-col gap-0.5 px-2 pb-1">
        <LeftIconButton title="Split Right (⌘D)" onClick={onSplitRight}>⊢ Split Right</LeftIconButton>
        <LeftIconButton title="Split Down (⌘⇧D)" onClick={onSplitDown}>⊥ Split Down</LeftIconButton>
        <LeftIconButton title="Move tab bar to top" onClick={onTogglePosition}>⊤ Move to Top</LeftIconButton>
      </div>
    </div>
  )
}

function TabPill({ tab, isActive, onSelect, onClose }) {
  const info = usePaneInfo(tab.activePaneId)
  const title = computeTabTitle(info, tab.fallbackTitle)
  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-1 px-3 h-7 rounded-t cursor-pointer select-none group shrink-0 p-4"
      style={{
        fontSize: 'var(--font-size-ui)',
        color: isActive ? 'var(--on-accent)' : 'var(--text-muted)',
        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        borderBottom: '2px solid transparent',
        maxWidth: '140px',
      }}
    >
      <span className="truncate">{title}</span>
      {onClose && (
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-base)]"
          style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function LeftTabPill({ tab, isActive, onSelect, onClose }) {
  const info = usePaneInfo(tab.activePaneId)
  const title = computeTabTitle(info, tab.fallbackTitle)
  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-1 mx-2 px-2 h-7 rounded cursor-pointer select-none group"
      style={{
        fontSize: 'var(--font-size-ui)',
        color: isActive ? 'var(--on-accent)' : 'var(--text-muted)',
        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        borderLeft: 'none',
        paddingLeft: '8px',
      }}
    >
      <span className="flex-1 truncate">{title}</span>
      {onClose && (
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-base)]"
          style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function LeftIconButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="h-7 flex items-center gap-1.5 px-2 rounded hover:bg-[var(--bg-elevated)] select-none w-full"
      style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-ui)' }}
    >
      {children}
    </button>
  )
}

function IconButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] select-none shrink-0"
      style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-ui)' }}
    >
      {children}
    </button>
  )
}
