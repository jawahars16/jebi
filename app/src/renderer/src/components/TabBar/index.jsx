// TabBar — renders tab pills and action buttons.
// Supports two positions:
//   'top'  — horizontal strip, lives inside the h-9 drag row
//   'left' — vertical strip, lives beside the pane area
//
// All interactive elements carry [-webkit-app-region:no-drag] so clicks work
// even though the parent drag strip has drag enabled.

import { FolderIcon } from '@phosphor-icons/react'
import { usePaneInfo, computeTabTitle, hasCommandTitle } from '../../hooks/usePaneInfo'
import { commandIcon } from './commandIcon'
import RunningRing from './RunningRing'

// Picks between a command-specific icon (when the title is a command) and a
// folder icon (when the title falls through to cwd basename). Keeps the icon
// and the title visually consistent.
function pickIcon(info) {
  if (hasCommandTitle(info)) {
    return commandIcon(info?.runningCommand ?? info?.lastCommand)
  }
  return FolderIcon
}

const TAB_WIDTH = 180
const TAB_HEIGHT = 32

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
      className="flex-1 flex items-end gap-1 px-2 overflow-hidden"
      style={{ fontFamily: 'var(--font-ui)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Tab pills — no-drag so clicks register */}
      <div className="flex items-end gap-0.5 overflow-hidden [-webkit-app-region:no-drag]">
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
        className="shrink-0 w-7 h-7 mb-1 ml-1 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] select-none [-webkit-app-region:no-drag]"
        style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-ui)' }}
      >
        +
      </button>

      {/* Empty space — inherits drag from the parent h-9 strip */}
      <div className="flex-1" />

      {/* Split buttons */}
      <div className="flex items-center gap-1 shrink-0 mb-1 [-webkit-app-region:no-drag]">
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
        width: '180px',
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
        className="mx-2 mt-1 h-8 flex items-center gap-2 px-2.5 rounded hover:bg-[var(--bg-elevated)] select-none"
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

// TabPill — fixed 180px wide pill with icon slot (left), title (center, monospace), close (right).
function TabPill({ tab, isActive, onSelect, onClose }) {
  const info = usePaneInfo(tab.activePaneId)
  const title = computeTabTitle(info, tab.fallbackTitle)
  const running = !!info?.runningCommand
  const Icon = pickIcon(info)
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? ''

  const iconColor = isActive ? 'var(--on-accent)' : 'var(--text-secondary)'
  const textColor = isActive ? 'var(--on-accent)' : 'var(--text-muted)'

  return (
    <div
      onClick={onSelect}
      title={fullCmd || title}
      className="group relative flex items-center gap-2 px-2.5 cursor-pointer select-none shrink-0 transition-colors"
      style={{
        width: `${TAB_WIDTH}px`,
        height: `${TAB_HEIGHT}px`,
        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        boxShadow: isActive ? 'inset 0 -2px 0 var(--accent)' : undefined,
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <RunningRing running={running}>
        <Icon size={15} color={iconColor} weight="regular" />
      </RunningRing>

      <span
        className="flex-1 truncate"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          letterSpacing: '0.01em',
          color: textColor,
        }}
      >
        {title}
      </span>

      {onClose && (
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            color: isActive ? 'var(--on-accent)' : 'var(--text-muted)',
            fontSize: '14px',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = isActive ? 'rgba(0,0,0,0.15)' : 'var(--bg-base)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

// LeftTabPill — vertical sidebar variant. Same visual system; active state uses an inset left bar.
function LeftTabPill({ tab, isActive, onSelect, onClose }) {
  const info = usePaneInfo(tab.activePaneId)
  const title = computeTabTitle(info, tab.fallbackTitle)
  const running = !!info?.runningCommand
  const Icon = pickIcon(info)
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? ''

  const iconColor = isActive ? 'var(--on-accent)' : 'var(--text-secondary)'
  const textColor = isActive ? 'var(--on-accent)' : 'var(--text-muted)'

  return (
    <div
      onClick={onSelect}
      title={fullCmd || title}
      className="group relative flex items-center gap-2 mx-2 px-2.5 cursor-pointer select-none transition-colors"
      style={{
        height: '34px',
        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
        borderRadius: 6,
        boxShadow: isActive ? 'inset 2px 0 0 var(--accent)' : undefined,
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <RunningRing running={running}>
        <Icon size={15} color={iconColor} weight="regular" />
      </RunningRing>

      <span
        className="flex-1 truncate"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          letterSpacing: '0.01em',
          color: textColor,
        }}
      >
        {title}
      </span>

      {onClose && (
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            color: isActive ? 'var(--on-accent)' : 'var(--text-muted)',
            fontSize: '14px',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = isActive ? 'rgba(0,0,0,0.15)' : 'var(--bg-base)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
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
