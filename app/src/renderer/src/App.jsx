import { useState, useRef, useCallback, useEffect } from 'react'
import TabBar from './components/TabBar'
import TerminalPane from './components/TerminalPane'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionStore } from './hooks/useSessionStore.jsx'
import { usePaneResize } from './hooks/usePaneResize'
import { deletePaneInfo } from './hooks/usePaneInfo'
import { triggerCopy } from './hooks/paneCopyRegistry'
import { triggerFocus } from './hooks/paneFocusRegistry'
import { createLeaf, splitLeaf, removeLeaf, collectPaneIds, computePaneRects, computeDividers } from './utils/layoutTree'
import StatusBar from './components/StatusBar/index.jsx'
import PreferencesModal from './components/Preferences'
import PaneContextMenu from './components/PaneContextMenu'

function createTab(counter) {
  const leaf = createLeaf()
  return {
    id: crypto.randomUUID(),
    fallbackTitle: `Terminal ${counter}`,
    layout: leaf,
    activePaneId: leaf.paneId,
    accent: null,
  }
}

export default function App() {
  const tabCounterRef = useRef(1)
  const [tabs, setTabs] = useState(() => [createTab(tabCounterRef.current)])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const [tabBarPosition, setTabBarPosition] = useState('top')
  const toggleTabBarPosition = useCallback(
    () => setTabBarPosition((p) => (p === 'top' ? 'left' : 'top')),
    [],
  )

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0]
  const { deleteSession } = useSessionStore()
  const paneWrapperRef = useRef(null)
  const { startDrag, dragCursor } = usePaneResize(paneWrapperRef, setTabs)
  const [isPrefsOpen, setIsPrefsOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, tabId, paneId, paneCount }

  // Close context menu on any click/Escape
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // --- Tab handlers ---

  const addTab = useCallback(() => {
    tabCounterRef.current += 1
    const tab = createTab(tabCounterRef.current)
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback((tabId) => {
    setTabs(prev => {
      if (prev.length === 1) return prev // never close the last tab
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(curr => {
        if (curr !== tabId) return curr
        // Activate the tab to the left, or the new first tab
        return (next[idx - 1] ?? next[0]).id
      })
      return next
    })
  }, [])

  // --- Pane handlers ---

  const setActivePane = useCallback((tabId, paneId) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, activePaneId: paneId } : t
    ))
    setActiveTabId(tabId)
  }, [])

  const splitPane = useCallback((tabId, paneId, direction) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const { tree, newPaneId } = splitLeaf(t.layout, paneId, direction)
      return { ...t, layout: tree, activePaneId: newPaneId }
    }))
  }, [])

  const closePane = useCallback((tabId, paneId) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const newTree = removeLeaf(t.layout, paneId)
      if (newTree === null) return t // safety: don't remove the last pane
      const remainingIds = collectPaneIds(newTree)
      const newActiveId = remainingIds.includes(t.activePaneId)
        ? t.activePaneId
        : remainingIds[remainingIds.length - 1]
      return { ...t, layout: newTree, activePaneId: newActiveId }
    }))
    deleteSession(paneId)
    deletePaneInfo(paneId)
  }, [deleteSession])

  const closeActivePane = useCallback(() => {
    closePane(activeTab.id, activeTab.activePaneId)
  }, [activeTab, closePane])

  // Spatial pane navigation: finds nearest pane in the given direction using
  // rect geometry. Falls back to cycling when no spatial neighbor exists.
  const navigatePane = useCallback((dir) => {
    const rects = computePaneRects(activeTab.layout)
    const paneIds = collectPaneIds(activeTab.layout)
    if (paneIds.length < 2) return

    const cur = rects[activeTab.activePaneId]
    if (!cur) return

    const EPS = 0.5 // % tolerance for floating-point edge alignment
    const curRight  = cur.left + cur.width
    const curBottom = cur.top  + cur.height
    const curCX = cur.left + cur.width  / 2
    const curCY = cur.top  + cur.height / 2

    let best = null
    let bestDist = Infinity

    for (const id of paneIds) {
      if (id === activeTab.activePaneId) continue
      const r = rects[id]
      let match = false
      let dist  = 0
      if (dir === 'right' && Math.abs(r.left          - curRight)  < EPS) { match = true; dist = Math.abs(r.top  + r.height / 2 - curCY) }
      if (dir === 'left'  && Math.abs(r.left + r.width - cur.left) < EPS) { match = true; dist = Math.abs(r.top  + r.height / 2 - curCY) }
      if (dir === 'down'  && Math.abs(r.top            - curBottom) < EPS) { match = true; dist = Math.abs(r.left + r.width  / 2 - curCX) }
      if (dir === 'up'    && Math.abs(r.top + r.height - cur.top)  < EPS) { match = true; dist = Math.abs(r.left + r.width  / 2 - curCX) }
      if (match && dist < bestDist) { bestDist = dist; best = id }
    }

    if (best) {
      setActivePane(activeTab.id, best)
    } else {
      // Cycle when no direct spatial neighbor
      const idx = paneIds.indexOf(activeTab.activePaneId)
      const fwd = dir === 'right' || dir === 'down'
      const next = fwd ? (idx + 1) % paneIds.length : (idx - 1 + paneIds.length) % paneIds.length
      setActivePane(activeTab.id, paneIds[next])
    }
  }, [activeTab, setActivePane])

  const splitActivePane = useCallback((direction) => {
    splitPane(activeTab.id, activeTab.activePaneId, direction)
  }, [activeTab, splitPane])

  // Cmd+Shift+D is intercepted via before-input-event in main (Chromium swallows it otherwise)
  useEffect(() => {
    return window.electron?.onAppShortcut?.((name) => {
      if (name === 'split-down') splitActivePane('vertical')
      if (name === 'copy') triggerCopy(activeTab.activePaneId)
    })
  }, [splitActivePane, activeTab.activePaneId])

  const setTabAccent = useCallback((tabId, accent) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, accent } : t))
  }, [])

  // --- Bulk tab close + per-tab split (driven by right-click menu) ---

  const closeTabsToRight = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1 || idx === prev.length - 1) return prev
      const kept = prev.slice(0, idx + 1)
      setActiveTabId(curr => kept.find(t => t.id === curr) ? curr : tabId)
      return kept
    })
  }, [])

  const closeOtherTabs = useCallback((tabId) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const target = prev.find(t => t.id === tabId)
      if (!target) return prev
      setActiveTabId(tabId)
      return [target]
    })
  }, [])

  const closeAllTabs = useCallback(() => {
    tabCounterRef.current += 1
    const fresh = createTab(tabCounterRef.current)
    setTabs([fresh])
    setActiveTabId(fresh.id)
  }, [])

  const splitTabPane = useCallback((tabId, direction) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const { tree, newPaneId } = splitLeaf(t.layout, t.activePaneId, direction)
      return { ...t, layout: tree, activePaneId: newPaneId }
    }))
    setActiveTabId(tabId)
  }, [])

  // --- Keyboard shortcuts ---

  const switchToTab = useCallback((t) => {
    if (!t) return
    setActiveTabId(t.id)
    setTimeout(() => triggerFocus(t.activePaneId), 0)
  }, [])

  const tabShortcuts = Object.fromEntries(
    [1,2,3,4,5,6,7,8].map(n => [
      `Meta+${n}`,
      () => switchToTab(tabs[n - 1]),
    ])
  )
  tabShortcuts['Meta+9'] = () => switchToTab(tabs[tabs.length - 1])

  useKeyboardShortcuts({
    'Meta+t': addTab,
    'Meta+w': closeActivePane,
    'Meta+d': () => splitActivePane('horizontal'),
    'Meta+Shift+D': () => splitActivePane('vertical'),
    'Meta+,': () => setIsPrefsOpen(true),
    'Meta+Alt+ArrowRight': () => navigatePane('right'),
    'Meta+Alt+ArrowLeft':  () => navigatePane('left'),
    'Meta+Alt+ArrowUp':    () => navigatePane('up'),
    'Meta+Alt+ArrowDown':  () => navigatePane('down'),
    ...tabShortcuts,
  })

  // --- Pane count for current tab (to show/hide close button) ---
  const paneCount = collectPaneIds(activeTab.layout).length

  // --- Render ---

  const tabBarProps = {
    tabs: tabs.map(t => ({ id: t.id, activePaneId: t.activePaneId, fallbackTitle: t.fallbackTitle, accent: t.accent })),
    activeTabId,
    position: tabBarPosition,
    onSelectTab: (tabId) => switchToTab(tabs.find(t => t.id === tabId)),
    onCloseTab: closeTab,
    onNewTab: addTab,
    onTogglePosition: toggleTabBarPosition,
    onSplitRight: () => splitActivePane('horizontal'),
    onSplitDown: () => splitActivePane('vertical'),
    onSetTabAccent: setTabAccent,
    onCloseTabsToRight: closeTabsToRight,
    onCloseOtherTabs: closeOtherTabs,
    onCloseAllTabs: closeAllTabs,
    onSplitTabPane: splitTabPane,
  }

  // Render all tabs but hide inactive ones — keeps xterm + WebSocket alive across tab switches.
  // Tab containers use position:absolute to fill the stable pane wrapper, so their DOM parent
  // never changes when the tab bar position toggles (avoiding xterm remounts).
  const allPaneContainers = tabs.map(tab => {
    const paneIds = collectPaneIds(tab.layout)
    const paneCount = paneIds.length
    const rects = computePaneRects(tab.layout)
    const dividers = computeDividers(tab.layout)

    return (
      <div
        key={tab.id}
        style={{
          display: tab.id === activeTabId ? 'block' : 'none',
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          '--tab-accent': tab.accent ?? '#3b82f6',
        }}
      >
        {/* Dividers — 8px hit area with a centered 1px visual bar */}
        {dividers.map(d => (
          <div
            key={d.id}
            onMouseDown={(e) => startDrag(e, tab.id, d)}
            className="group"
            style={{
              position: 'absolute',
              left: `${d.x}%`,
              top: `${d.y}%`,
              width:      d.vertical ? '8px' : `${d.w}%`,
              height:     d.vertical ? `${d.h}%` : '8px',
              marginLeft: d.vertical ? '-4px' : 0,
              marginTop:  d.vertical ? 0 : '-4px',
              cursor:  d.vertical ? 'col-resize' : 'row-resize',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div className="group-hover:bg-[var(--accent)]" style={{
              width:           d.vertical ? '1px' : '100%',
              height:          d.vertical ? '100%' : '1px',
              backgroundColor: 'var(--border)',
              transition:      'background-color 0.15s',
            }} />
          </div>
        ))}

        {/* Panes — flat siblings so keys survive layout tree mutations */}
        {paneIds.map(paneId => {
          const r = rects[paneId]
          const isActive = paneId === tab.activePaneId
          return (
            <div
              key={paneId}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, paneId, paneCount })
              }}
              style={{
                position: 'absolute',
                left: `${r.left}%`,
                top: `${r.top}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
                display: 'flex',
                filter: isActive ? 'none' : 'grayscale(60%)',
              }}
            >
              <TerminalPane
                paneId={paneId}
                isActive={isActive}
                isVisible={tab.id === activeTabId}
                tabAccent={tab.accent ?? '#3b82f6'}
                onFocus={() => setActivePane(tab.id, paneId)}
                onSplitRight={() => splitPane(tab.id, paneId, 'horizontal')}
                onSplitDown={() => splitPane(tab.id, paneId, 'vertical')}
                onClose={paneCount > 1 ? () => closePane(tab.id, paneId) : null}
                onNewTab={addTab}
                onToggleTabPosition={toggleTabBarPosition}
              />
            </div>
          )
        })}
      </div>
    )
  })

  // Single layout tree — pane wrapper is always at the same position so React never
  // remounts terminals when toggling tab bar between top and left.
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-surface)]">
      {/* Title bar — always at top; holds TabBar in top mode, just a drag handle in left mode */}
      <div
        className="shrink-0 flex items-center bg-[var(--bg-base)] border-b border-[var(--border)] [-webkit-app-region:drag]"
        style={{ height: '36px' }}
      >
        {tabBarPosition === 'top' && (
          <>
            <div className="w-20 shrink-0" />
            <TabBar {...tabBarProps} />
          </>
        )}
        <div className="ml-auto flex items-center pr-3 [-webkit-app-region:no-drag]">
          <button
            title="Preferences (⌘,)"
            onClick={() => setIsPrefsOpen(true)}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--bg-elevated)]"
            style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Main area — flex row; left TabBar appears here when in left mode */}
      <div className="flex flex-1 min-h-0">
        {tabBarPosition === 'left' && <TabBar {...tabBarProps} />}

        {/* Pane wrapper — stable containing block; never moves regardless of tab bar position */}
        <div ref={paneWrapperRef} className="flex-1 min-h-0 min-w-0" style={{ position: 'relative' }}>
          {allPaneContainers}
        </div>
      </div>

      <StatusBar />

      {/* Pointer-capture overlay — sits over xterm canvases during drag so the
          cursor stays consistent and mouse events don't get swallowed by xterm */}
      {dragCursor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: dragCursor }} />
      )}

      <PreferencesModal isOpen={isPrefsOpen} onClose={() => setIsPrefsOpen(false)} />

      {/* Pane context menu */}
      {ctxMenu && (
        <PaneContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          canClose={ctxMenu.paneCount > 1}
          onSplitRight={() => { splitPane(ctxMenu.tabId, ctxMenu.paneId, 'horizontal'); setCtxMenu(null) }}
          onSplitDown={() => { splitPane(ctxMenu.tabId, ctxMenu.paneId, 'vertical'); setCtxMenu(null) }}
          onClose={() => { closePane(ctxMenu.tabId, ctxMenu.paneId); setCtxMenu(null) }}
          onNewTab={() => { addTab(); setCtxMenu(null) }}
          onCopy={() => { triggerCopy(ctxMenu.paneId); setCtxMenu(null) }}
          onToggleTabPosition={() => { toggleTabBarPosition(); setCtxMenu(null) }}
        />
      )}
    </div>
  )
}

