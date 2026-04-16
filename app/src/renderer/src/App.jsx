import { useState, useRef, useCallback } from 'react'
import TabBar from './components/TabBar'
import TerminalPane from './components/TerminalPane'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionStore } from './hooks/useSessionStore.jsx'
import { usePaneResize } from './hooks/usePaneResize'
import { createLeaf, splitLeaf, removeLeaf, collectPaneIds, computePaneRects, computeDividers } from './utils/layoutTree'
import StatusBar from './components/StatusBar/index.jsx'
import PreferencesModal from './components/Preferences'

function createTab(counter) {
  const leaf = createLeaf()
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${counter}`,
    layout: leaf,
    activePaneId: leaf.paneId,
  }
}

export default function App() {
  const tabCounterRef = useRef(1)
  const [tabs, setTabs] = useState(() => [createTab(tabCounterRef.current)])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const [tabBarPosition, setTabBarPosition] = useState('top')

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0]
  const { deleteSession } = useSessionStore()
  const paneWrapperRef = useRef(null)
  const { startDrag, dragCursor } = usePaneResize(paneWrapperRef, setTabs)
  const [isPrefsOpen, setIsPrefsOpen] = useState(false)

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

  const updateTabTitle = useCallback((tabId, paneId, title) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      // Only update title when the changed pane is the active one
      if (t.activePaneId !== paneId) return t
      return { ...t, title }
    }))
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
  }, [deleteSession])

  const closeActivePane = useCallback(() => {
    closePane(activeTab.id, activeTab.activePaneId)
  }, [activeTab, closePane])

  const splitActivePane = useCallback((direction) => {
    splitPane(activeTab.id, activeTab.activePaneId, direction)
  }, [activeTab, splitPane])

  // --- Keyboard shortcuts ---

  useKeyboardShortcuts({
    'Meta+t': addTab,
    'Meta+w': closeActivePane,
    'Meta+d': () => splitActivePane('horizontal'),
    'Meta+Shift+D': () => splitActivePane('vertical'),
    'Meta+,': () => setIsPrefsOpen(true),
  })

  // --- Pane count for current tab (to show/hide close button) ---
  const paneCount = collectPaneIds(activeTab.layout).length

  // --- Render ---

  const tabBarProps = {
    tabs: tabs.map(t => ({ id: t.id, title: t.title })),
    activeTabId,
    position: tabBarPosition,
    onSelectTab: setActiveTabId,
    onCloseTab: closeTab,
    onNewTab: addTab,
    onTogglePosition: () => setTabBarPosition(p => p === 'top' ? 'left' : 'top'),
    onSplitRight: () => splitActivePane('horizontal'),
    onSplitDown: () => splitActivePane('vertical'),
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
          return (
            <div
              key={paneId}
              style={{
                position: 'absolute',
                left: `${r.left}%`,
                top: `${r.top}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
                display: 'flex',
              }}
            >
              <TerminalPane
                paneId={paneId}
                isActive={paneId === tab.activePaneId}
                isVisible={tab.id === activeTabId}
                onFocus={() => setActivePane(tab.id, paneId)}
                onTitleChange={title => updateTabTitle(tab.id, paneId, title)}
                onSplitRight={() => splitPane(tab.id, paneId, 'horizontal')}
                onSplitDown={() => splitPane(tab.id, paneId, 'vertical')}
                onClose={paneCount > 1 ? () => closePane(tab.id, paneId) : null}
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
    </div>
  )
}
