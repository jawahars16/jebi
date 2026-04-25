// TabBar — renders tab pills and action buttons.
// Supports two positions:
//   'top'  — horizontal strip, lives inside the h-9 drag row
//   'left' — vertical strip, lives beside the pane area
//
// All interactive elements carry [-webkit-app-region:no-drag] so clicks work
// even though the parent drag strip has drag enabled.

import { useState, useEffect, useRef } from 'react'
import { usePaneInfo, computeTabTitle, hasCommandTitle } from '../../hooks/usePaneInfo'
import { commandIconUrl } from './commandIcon'
import RunningRing from './RunningRing'
import FsIcon from '../FsIcon'

// Curated palette for per-tab accents — chosen to read on dark themes.
const TAB_ACCENT_PALETTE = [
  '#ec4899', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#94a3b8',
]

function renderTabIcon(info, size) {
  const cmd = info?.runningCommand ?? info?.lastCommand
  const url = commandIconUrl(hasCommandTitle(info) ? cmd : null)
  if (hasCommandTitle(info)) {
    return <img src={url} alt="" aria-hidden="true" width={size} height={size} style={{ width: size, height: size, flexShrink: 0, objectFit: 'contain' }} />
  }
  return <FsIcon kind="folder" size={size} />
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
  onSetTabAccent,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onCloseAllTabs,
  onSplitTabPane,
}) {
  // Right-click menu state — anchored to the click point.
  const [menu, setMenu] = useState(null) // { x, y, tabId } | null

  const openMenu = (e, tabId) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, tabId })
  }
  const closeMenu = () => setMenu(null)

  const isTop = position === 'top'
  const shared = { tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown, onContextMenu: openMenu }

  const tabIndex = menu ? tabs.findIndex(t => t.id === menu.tabId) : -1
  const currentAccent = tabIndex !== -1 ? tabs[tabIndex].accent ?? null : null

  return (
    <>
      {isTop ? <TopTabBar {...shared} /> : <LeftTabBar {...shared} />}
      {menu && tabIndex !== -1 && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          tabIndex={tabIndex}
          totalTabs={tabs.length}
          currentAccent={currentAccent}
          onClose={closeMenu}
          onCloseTab={() => onCloseTab?.(menu.tabId)}
          onCloseToRight={() => onCloseTabsToRight?.(menu.tabId)}
          onCloseOthers={() => onCloseOtherTabs?.(menu.tabId)}
          onCloseAll={() => onCloseAllTabs?.()}
          onSplitRight={() => onSplitTabPane?.(menu.tabId, 'horizontal')}
          onSplitDown={() => onSplitTabPane?.(menu.tabId, 'vertical')}
          onPickAccent={(color) => onSetTabAccent?.(menu.tabId, color)}
          onResetAccent={() => onSetTabAccent?.(menu.tabId, null)}
        />
      )}
    </>
  )
}

function TopTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown, onContextMenu }) {
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
            onContextMenu={(e) => onContextMenu(e, tab.id)}
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

function LeftTabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onTogglePosition, onSplitRight, onSplitDown, onContextMenu }) {
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
          onContextMenu={(e) => onContextMenu(e, tab.id)}
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
function TabPill({ tab, isActive, onSelect, onClose, onContextMenu }) {
  const info = usePaneInfo(tab.activePaneId)
  const title = computeTabTitle(info, tab.fallbackTitle)
  const running = !!info?.runningCommand
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? ''
  const isCmd = hasCommandTitle(info)

  const textColor = isActive ? 'var(--text-primary)' : 'var(--text-muted)'

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={fullCmd || title}
      className="group relative flex items-center gap-2 px-2.5 cursor-pointer select-none shrink-0 transition-colors"
      style={{
        width: `${TAB_WIDTH}px`,
        height: `${TAB_HEIGHT}px`,
        backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        boxShadow: isActive ? 'inset 0 -2px 0 var(--tab-accent)' : undefined,
        '--tab-accent': tab.accent ?? 'var(--accent)',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <RunningRing running={running}>
        {renderTabIcon(info, 18)}
      </RunningRing>

      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          direction: isCmd ? 'ltr' : 'rtl',
          fontFamily: 'var(--font-mono)',
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
            color: 'var(--text-muted)',
            fontSize: '14px',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-base)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

// LeftTabPill — vertical sidebar variant. Same visual system; active state uses an inset left bar.
function LeftTabPill({ tab, isActive, onSelect, onClose, onContextMenu }) {
  const info = usePaneInfo(tab.activePaneId)
  const title = computeTabTitle(info, tab.fallbackTitle)
  const running = !!info?.runningCommand
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? ''
  const isCmd = hasCommandTitle(info)

  const textColor = isActive ? 'var(--text-primary)' : 'var(--text-muted)'

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={fullCmd || title}
      className="group relative flex items-center gap-2 mx-2 px-2.5 cursor-pointer select-none transition-colors"
      style={{
        height: '34px',
        backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
        borderRadius: 6,
        boxShadow: isActive ? 'inset 2px 0 0 var(--tab-accent)' : undefined,
        '--tab-accent': tab.accent ?? 'var(--accent)',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <RunningRing running={running}>
        {renderTabIcon(info, 15)}
      </RunningRing>

      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          direction: isCmd ? 'ltr' : 'rtl',
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
            color: 'var(--text-muted)',
            fontSize: '14px',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-base)' }}
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

// TabContextMenu — right-click menu for a tab.
// Close / Close to Right / Close Others / Close All / Split Right / Split Down / Accent palette.
// Closes on Escape or any mousedown outside the menu, and after any action fires.
function TabContextMenu({
  x,
  y,
  tabIndex,
  totalTabs,
  currentAccent,
  onClose,
  onCloseTab,
  onCloseToRight,
  onCloseOthers,
  onCloseAll,
  onSplitRight,
  onSplitDown,
  onPickAccent,
  onResetAccent,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  // Clamp position to viewport so the menu never spills off-screen.
  const MENU_WIDTH = 220
  const MENU_HEIGHT = 280
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT - 8)

  const fire = (fn) => () => { fn?.(); onClose() }

  const canClose = totalTabs > 1
  const canCloseToRight = tabIndex < totalTabs - 1
  const canCloseOthers = totalTabs > 1

  return (
    <div
      ref={ref}
      className="[-webkit-app-region:no-drag]"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        minWidth: MENU_WIDTH,
        padding: '6px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--font-size-ui)',
      }}
    >
      <MenuItem onClick={fire(onCloseTab)} disabled={!canClose}>Close</MenuItem>
      <MenuItem onClick={fire(onCloseToRight)} disabled={!canCloseToRight}>Close to Right</MenuItem>
      <MenuItem onClick={fire(onCloseOthers)} disabled={!canCloseOthers}>Close Others</MenuItem>
      <MenuItem onClick={fire(onCloseAll)}>Close All</MenuItem>

      <MenuSeparator />

      <MenuItem onClick={fire(onSplitRight)} shortcut="⌘D">Split Right</MenuItem>
      <MenuItem onClick={fire(onSplitDown)} shortcut="⌘⇧D">Split Down</MenuItem>

      <MenuSeparator />

      <div
        style={{
          padding: '4px 8px 2px',
          color: 'var(--text-muted)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Accent
      </div>
      <div
        className="flex items-center gap-1.5"
        style={{ padding: '6px 8px 4px' }}
      >
        {TAB_ACCENT_PALETTE.map(color => {
          const selected = currentAccent != null && currentAccent.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              title={color}
              onClick={fire(() => onPickAccent?.(color))}
              className="rounded-full"
              style={{
                width: 18,
                height: 18,
                backgroundColor: color,
                border: selected
                  ? '2px solid var(--text-primary)'
                  : '1px solid var(--border)',
                boxShadow: selected ? `0 0 0 2px ${color}55` : undefined,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          )
        })}
      </div>
      <MenuItem onClick={fire(onResetAccent)}>Reset Accent</MenuItem>
    </div>
  )
}

function MenuItem({ children, onClick, disabled, shortcut }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between rounded text-left transition-colors"
      style={{
        padding: '6px 8px',
        background: 'transparent',
        border: 'none',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--font-size-ui)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--bg-base)' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span>{children}</span>
      {shortcut && (
        <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: 12 }}>{shortcut}</span>
      )}
    </button>
  )
}

function MenuSeparator() {
  return (
    <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />
  )
}
