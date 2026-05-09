import { useState, useCallback, useEffect, useRef } from "react";
import chevronCollapseUrl from "../../assets/chevron-collapse.png";
import addIconUrl from "../../assets/add.png";
import {
  usePaneInfo,
  computeTabTitle,
  hasCommandTitle,
} from "../../hooks/usePaneInfo";
import { commandIconUrl } from "./commandIcon";
import RunningRing from "./RunningRing";
import FsIcon from "../FsIcon";
import { TabContextMenu } from "./TabContextMenu";

function renderTabIcon(info, size) {
  const cmd = info?.runningCommand ?? info?.lastCommand;
  const url = commandIconUrl(hasCommandTitle(info) ? cmd : null);
  if (hasCommandTitle(info)) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }}
      />
    );
  }
  return <FsIcon kind="folder" size={size} />;
}

const TAB_WIDTH = 180;
const TAB_HEIGHT = 32;
const LEFT_TAB_H = 34;

function ChevronDownIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 3.5l3.5 3 3.5-3" />
    </svg>
  );
}

// Shared dropdown rendered at a fixed viewport position to escape overflow:hidden parents.
function OverflowDropdown({ dropdownRef, pos, tabs, activeTabId, onSelect, onClose }) {
  return (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 1000,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        minWidth: 200,
        maxHeight: 360,
        overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {tabs.map((tab) => (
        <OverflowTabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onSelect(tab.id)}
          onClose={onClose ? () => onClose(tab.id) : null}
        />
      ))}
    </div>
  );
}

function OverflowTabItem({ tab, isActive, onSelect, onClose }) {
  const info = usePaneInfo(tab.activePaneId);
  const title = computeTabTitle(info, tab.fallbackTitle);
  const running = !!info?.runningCommand;
  const isCmd = hasCommandTitle(info);

  return (
    <div
      onClick={onSelect}
      className="group flex items-center gap-2 px-3 cursor-pointer select-none"
      style={{
        height: 36,
        backgroundColor: isActive ? "var(--bg-base)" : "transparent",
        borderLeft: `2px solid ${isActive ? (tab.accent ?? "#3b82f6") : "transparent"}`,
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-base)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <RunningRing running={running}>{renderTabIcon(info, 14)}</RunningRing>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: isActive ? "var(--text-primary)" : "var(--text-muted)",
          direction: isCmd ? "ltr" : "rtl",
        }}
      >
        {title}
      </span>
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="opacity-0 group-hover:opacity-100 shrink-0 w-4 h-4 flex items-center justify-center rounded"
          style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1 }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

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
  const [menu, setMenu] = useState(null);
  const [cmdHeld, setCmdHeld] = useState(false);

  useEffect(() => {
    const onDown = (e) => {
      if (e.key === "Meta") setCmdHeld(true);
      if (e.metaKey && /^[1-9]$/.test(e.key)) setCmdHeld(false);
    };
    const onUp = (e) => {
      if (e.key === "Meta") setCmdHeld(false);
    };
    const onBlur = () => setCmdHeld(false);
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const openMenu = (e, tabId) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, tabId });
  };
  const closeMenu = () => setMenu(null);

  const isTop = position === "top";
  const shared = {
    tabs,
    activeTabId,
    onSelectTab,
    onCloseTab,
    onNewTab,
    onTogglePosition,
    onSplitRight,
    onSplitDown,
    onContextMenu: openMenu,
    cmdHeld,
  };

  const tabIndex = menu ? tabs.findIndex((t) => t.id === menu.tabId) : -1;
  const currentAccent = tabIndex !== -1 ? (tabs[tabIndex].accent ?? null) : null;

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
          onSplitRight={() => onSplitTabPane?.(menu.tabId, "horizontal")}
          onSplitDown={() => onSplitTabPane?.(menu.tabId, "vertical")}
          onPickAccent={(color) => onSetTabAccent?.(menu.tabId, color)}
          onResetAccent={() => onSetTabAccent?.(menu.tabId, null)}
          onTogglePosition={onTogglePosition}
        />
      )}
    </>
  );
}

// Computes visible/hidden tab windows given container size.
// Returns { visibleTabs, hiddenTabs, windowStart }.
function computeWindow(tabs, activeTabId, containerSize, tabSize, reserved, overflowBtnSize) {
  let visibleCount = tabs.length;
  if (containerSize > 0 && containerSize < 99999) {
    let count = Math.floor((containerSize - reserved) / tabSize);
    if (count < tabs.length) {
      count = Math.floor((containerSize - reserved - overflowBtnSize) / tabSize);
    }
    visibleCount = Math.max(1, Math.min(count, tabs.length));
  }

  const activeIdx = tabs.findIndex((t) => t.id === activeTabId);
  let windowStart = 0;
  if (activeIdx >= 0 && activeIdx >= visibleCount) {
    windowStart = activeIdx - visibleCount + 1;
  }
  windowStart = Math.max(0, Math.min(windowStart, Math.max(0, tabs.length - visibleCount)));

  const visibleTabs = tabs.slice(windowStart, windowStart + visibleCount);
  const hiddenTabs = [
    ...tabs.slice(0, windowStart),
    ...tabs.slice(windowStart + visibleCount),
  ];
  return { visibleTabs, hiddenTabs, windowStart };
}

function TopTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onContextMenu,
  cmdHeld,
}) {
  const containerRef = useRef(null);
  const overflowBtnRef = useRef(null);
  const dropdownRef = useRef(null);
  const [containerW, setContainerW] = useState(99999);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.offsetWidth));
    setContainerW(el.offsetWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!overflowOpen) return;
    const fn = (e) => {
      if (
        !overflowBtnRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      )
        setOverflowOpen(false);
    };
    window.addEventListener("mousedown", fn, true);
    return () => window.removeEventListener("mousedown", fn, true);
  }, [overflowOpen]);

  // px-2=16px, new-tab btn~36px incl margin, each tab = TAB_WIDTH+2px gap
  const { visibleTabs, hiddenTabs, windowStart } = computeWindow(
    tabs,
    activeTabId,
    containerW,
    TAB_WIDTH + 2,
    16 + 36,
    32,
  );

  function toggleOverflow() {
    if (overflowOpen) { setOverflowOpen(false); return; }
    const rect = overflowBtnRef.current?.getBoundingClientRect();
    if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    setOverflowOpen(true);
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-end gap-1 px-2 overflow-hidden"
      style={{ fontFamily: "var(--font-ui)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Visible tab pills */}
      <div className="flex items-end gap-0.5 shrink-0 [-webkit-app-region:no-drag]">
        {visibleTabs.map((tab, i) => (
          <TabPill
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onClose={tabs.length > 1 ? () => onCloseTab(tab.id) : null}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            tabNum={cmdHeld && windowStart + i < 8 ? windowStart + i + 1 : null}
          />
        ))}
      </div>

      {/* Overflow chevron — only when tabs don't all fit */}
      {hiddenTabs.length > 0 && (
        <div
          ref={overflowBtnRef}
          className="shrink-0 self-center [-webkit-app-region:no-drag]"
          style={{ marginBottom: 4 }}
        >
          <button
            onClick={toggleOverflow}
            title={`${hiddenTabs.length} more tab${hiddenTabs.length !== 1 ? "s" : ""}`}
            className="flex items-center gap-1 px-2 h-6 rounded hover:bg-[var(--bg-elevated)] select-none"
            style={{
              color: overflowOpen ? "var(--text-primary)" : "var(--text-muted)",
              background: overflowOpen ? "var(--bg-elevated)" : "none",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "var(--font-ui)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <ChevronDownIcon size={9} />
            <span>{hiddenTabs.length}</span>
          </button>
          {overflowOpen && (
            <OverflowDropdown
              dropdownRef={dropdownRef}
              pos={dropdownPos}
              tabs={hiddenTabs}
              activeTabId={activeTabId}
              onSelect={(id) => { onSelectTab(id); setOverflowOpen(false); }}
              onClose={tabs.length > 1 ? (id) => onCloseTab(id) : null}
            />
          )}
        </div>
      )}

      {/* New tab button */}
      <button
        title="New Tab (⌘T)"
        onClick={onNewTab}
        className="shrink-0 w-7 h-7 mb-1 ml-1 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] select-none [-webkit-app-region:no-drag]"
      >
        <img src={addIconUrl} style={{ width: 14, height: 14, opacity: 0.5 }} />
      </button>

      <div className="flex-1" />
    </div>
  );
}

function LeftTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onContextMenu,
  cmdHeld,
}) {
  const [collapsed, setCollapsed] = useState(true);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const containerRef = useRef(null);
  const overflowBtnRef = useRef(null);
  const dropdownRef = useRef(null);
  const [containerH, setContainerH] = useState(99999);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerH(el.offsetHeight));
    setContainerH(el.offsetHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!overflowOpen) return;
    const fn = (e) => {
      if (
        !overflowBtnRef.current?.contains(e.target) &&
        !dropdownRef.current?.contains(e.target)
      )
        setOverflowOpen(false);
    };
    window.addEventListener("mousedown", fn, true);
    return () => window.removeEventListener("mousedown", fn, true);
  }, [overflowOpen]);

  // new-tab btn=32px, collapse btn=28px, buffer=8px, overflow btn=28px
  const { visibleTabs, hiddenTabs, windowStart } = computeWindow(
    tabs,
    activeTabId,
    containerH,
    LEFT_TAB_H,
    32 + 28 + 8,
    28,
  );

  function toggleOverflow() {
    if (overflowOpen) { setOverflowOpen(false); return; }
    const rect = overflowBtnRef.current?.getBoundingClientRect();
    if (rect) setDropdownPos({ top: rect.top, left: rect.right + 4 });
    setOverflowOpen(true);
  }

  const overflowDropdown = overflowOpen && (
    <OverflowDropdown
      dropdownRef={dropdownRef}
      pos={dropdownPos}
      tabs={hiddenTabs}
      activeTabId={activeTabId}
      onSelect={(id) => { onSelectTab(id); setOverflowOpen(false); }}
      onClose={tabs.length > 1 ? (id) => onCloseTab(id) : null}
    />
  );

  if (collapsed) {
    return (
      <div
        ref={containerRef}
        className="flex flex-col items-center gap-0.5 shrink-0 border-r [-webkit-app-region:no-drag]"
        style={{
          width: "44px",
          borderColor: "var(--border)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        {visibleTabs.map((tab, i) => (
          <LeftTabIcon
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            tabNum={cmdHeld && windowStart + i < 8 ? windowStart + i + 1 : null}
          />
        ))}

        {hiddenTabs.length > 0 && (
          <div ref={overflowBtnRef} className="relative w-full">
            <button
              onClick={toggleOverflow}
              title={`${hiddenTabs.length} more tab${hiddenTabs.length !== 1 ? "s" : ""}`}
              className="w-full h-7 flex flex-col items-center justify-center hover:bg-[var(--bg-elevated)] select-none"
              style={{
                color: overflowOpen ? "var(--text-primary)" : "var(--text-muted)",
                background: overflowOpen ? "var(--bg-elevated)" : "none",
                border: "none",
                cursor: "pointer",
                gap: "2px",
              }}
            >
              <ChevronDownIcon size={9} />
              <span style={{ fontSize: "8px", lineHeight: 1, fontFamily: "var(--font-ui)" }}>
                {hiddenTabs.length}
              </span>
            </button>
            {overflowDropdown}
          </div>
        )}

        <button
          title="New Tab (⌘T)"
          onClick={onNewTab}
          className="w-full h-8 flex items-center justify-center hover:bg-[var(--bg-elevated)] select-none"
        >
          <img src={addIconUrl} style={{ width: 14, height: 14, opacity: 0.5 }} />
        </button>

        <div className="flex-1" />

        <button
          title="Expand tab bar"
          onClick={toggle}
          className="w-full h-7 flex items-center justify-center hover:bg-[var(--bg-elevated)] select-none"
        >
          <img
            src={chevronCollapseUrl}
            style={{ width: 14, height: 14, opacity: 0.5, transform: "rotate(180deg)" }}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-0.5 shrink-0 border-r [-webkit-app-region:no-drag]"
      style={{
        width: "180px",
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-surface)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {visibleTabs.map((tab, i) => (
        <LeftTabPill
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onSelectTab(tab.id)}
          onClose={tabs.length > 1 ? () => onCloseTab(tab.id) : null}
          onContextMenu={(e) => onContextMenu(e, tab.id)}
          tabNum={cmdHeld && windowStart + i < 8 ? windowStart + i + 1 : null}
        />
      ))}

      {hiddenTabs.length > 0 && (
        <div ref={overflowBtnRef} className="relative">
          <button
            onClick={toggleOverflow}
            title={`${hiddenTabs.length} more tab${hiddenTabs.length !== 1 ? "s" : ""}`}
            className="h-7 flex items-center gap-2 px-2.5 w-full hover:bg-[var(--bg-elevated)] select-none"
            style={{
              color: overflowOpen ? "var(--text-primary)" : "var(--text-muted)",
              background: overflowOpen ? "var(--bg-elevated)" : "none",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--font-size-ui)",
            }}
          >
            <ChevronDownIcon size={9} />
            <span>{hiddenTabs.length} more</span>
          </button>
          {overflowDropdown}
        </div>
      )}

      <button
        title="New Tab (⌘T)"
        onClick={onNewTab}
        className="h-8 flex items-center gap-2 px-2.5 hover:bg-[var(--bg-elevated)] select-none"
        style={{ color: "var(--text-muted)", fontSize: "var(--font-size-ui)" }}
      >
        <img src={addIconUrl} style={{ width: 14, height: 14, opacity: 0.5 }} />
        <span>New Tab</span>
      </button>

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5 px-2 pb-1">
        <LeftIconButton title="Collapse tab bar" onClick={toggle}>
          <img src={chevronCollapseUrl} style={{ width: 14, height: 14, opacity: 0.5 }} />
          Collapse
        </LeftIconButton>
      </div>
    </div>
  );
}

function TabPill({ tab, isActive, onSelect, onClose, onContextMenu, tabNum }) {
  const info = usePaneInfo(tab.activePaneId);
  const title = computeTabTitle(info, tab.fallbackTitle);
  const running = !!info?.runningCommand;
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? "";
  const isCmd = hasCommandTitle(info);
  const textColor = isActive ? "var(--text-primary)" : "var(--text-muted)";

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={fullCmd || title}
      className="group relative flex items-center gap-2 px-2.5 cursor-pointer select-none shrink-0 transition-colors"
      style={{
        width: `${TAB_WIDTH}px`,
        height: `${TAB_HEIGHT}px`,
        backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        boxShadow: isActive ? "inset 0 -2px 0 var(--tab-accent)" : undefined,
        "--tab-accent": tab.accent ?? "#3b82f6",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <RunningRing running={running}>{renderTabIcon(info, 18)}</RunningRing>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          direction: isCmd ? "ltr" : "rtl",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.01em",
          color: textColor,
        }}
      >
        {title}
      </span>
      {tabNum && <TabNumBadge num={tabNum} />}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-base)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function LeftTabPill({ tab, isActive, onSelect, onClose, onContextMenu, tabNum }) {
  const info = usePaneInfo(tab.activePaneId);
  const title = computeTabTitle(info, tab.fallbackTitle);
  const running = !!info?.runningCommand;
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? "";
  const isCmd = hasCommandTitle(info);
  const textColor = isActive ? "var(--text-primary)" : "var(--text-muted)";

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={fullCmd || title}
      className="group relative flex items-center gap-2 px-2.5 cursor-pointer select-none transition-colors"
      style={{
        height: "34px",
        backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        boxShadow: isActive ? "inset 2px 0 0 var(--tab-accent)" : undefined,
        "--tab-accent": tab.accent ?? "#3b82f6",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <RunningRing running={running}>{renderTabIcon(info, 15)}</RunningRing>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          direction: isCmd ? "ltr" : "rtl",
          fontFamily: "var(--font-mono)",
          fontSize: "12.5px",
          letterSpacing: "0.01em",
          color: textColor,
        }}
      >
        {title}
      </span>
      {tabNum && <TabNumBadge num={tabNum} />}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-base)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function LeftTabIcon({ tab, isActive, onSelect, onContextMenu, tabNum }) {
  const info = usePaneInfo(tab.activePaneId);
  const title = computeTabTitle(info, tab.fallbackTitle);
  const running = !!info?.runningCommand;
  const fullCmd = info?.runningCommand ?? info?.lastCommand ?? "";

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={fullCmd || title}
      className="relative flex items-center justify-center cursor-pointer select-none transition-colors"
      style={{
        width: "100%",
        height: 34,
        backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
        boxShadow: isActive ? "inset 2px 0 0 var(--tab-accent)" : undefined,
        "--tab-accent": tab.accent ?? "#3b82f6",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <RunningRing running={running}>{renderTabIcon(info, 16)}</RunningRing>
      {tabNum && (
        <span
          style={{
            position: "absolute",
            top: 1,
            right: 1,
            fontSize: "8px",
            lineHeight: 1,
            fontWeight: 700,
            color: "var(--text-muted)",
            fontFamily: "var(--font-ui)",
          }}
        >
          {tabNum}
        </span>
      )}
    </div>
  );
}

function TabNumBadge({ num }) {
  return (
    <span
      style={{
        fontSize: "9px",
        lineHeight: 1,
        fontWeight: 700,
        color: "var(--text-muted)",
        background: "var(--bg-base)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        padding: "1px 3px",
        fontFamily: "var(--font-ui)",
        flexShrink: 0,
      }}
    >
      {num}
    </span>
  );
}

function LeftIconButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="h-7 flex items-center gap-1.5 px-2 rounded hover:bg-[var(--bg-elevated)] select-none w-full"
      style={{ color: "var(--text-muted)", fontSize: "var(--font-size-ui)" }}
    >
      {children}
    </button>
  );
}
