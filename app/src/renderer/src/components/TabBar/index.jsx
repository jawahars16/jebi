// TabBar — renders tab pills and action buttons.
// Supports two positions:
//   'top'  — horizontal strip, lives inside the h-9 drag row
//   'left' — vertical strip, lives beside the pane area
//
// All interactive elements carry [-webkit-app-region:no-drag] so clicks work
// even though the parent drag strip has drag enabled.

import { useState, useCallback, useEffect } from "react";
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
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          objectFit: "contain",
        }}
      />
    );
  }
  return <FsIcon kind="folder" size={size} />;
}

const TAB_WIDTH = 180;
const TAB_HEIGHT = 32;

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
  const [menu, setMenu] = useState(null); // { x, y, tabId } | null

  // Show tab-number hints while Cmd is held; hide immediately on digit shortcut or release.
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
  const currentAccent =
    tabIndex !== -1 ? (tabs[tabIndex].accent ?? null) : null;

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

function TopTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTogglePosition,
  onSplitRight,
  onSplitDown,
  onContextMenu,
  cmdHeld,
}) {
  return (
    <div
      className="flex-1 flex items-end gap-1 px-2 overflow-hidden"
      style={{
        fontFamily: "var(--font-ui)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Tab pills — no-drag so clicks register */}
      <div className="flex items-end gap-0.5 overflow-hidden [-webkit-app-region:no-drag]">
        {tabs.map((tab, i) => (
          <TabPill
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onClose={tabs.length > 1 ? () => onCloseTab(tab.id) : null}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            tabNum={cmdHeld && i < 8 ? i + 1 : null}
          />
        ))}
      </div>

      {/* New tab button */}
      <button
        title="New Tab (⌘T)"
        onClick={onNewTab}
        className="shrink-0 w-7 h-7 mb-1 ml-1 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] select-none [-webkit-app-region:no-drag]"
      >
        <img src={addIconUrl} style={{ width: 14, height: 14, opacity: 0.5 }} />
      </button>

      {/* Empty space — inherits drag from the parent h-9 strip */}
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
  onTogglePosition,
  onSplitRight,
  onSplitDown,
  onContextMenu,
  cmdHeld,
}) {
  const [collapsed, setCollapsed] = useState(true);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-0.5 shrink-0 border-r [-webkit-app-region:no-drag]"
        style={{
          width: "44px",
          borderColor: "var(--border)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        {tabs.map((tab, i) => (
          <LeftTabIcon
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelectTab(tab.id)}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            tabNum={cmdHeld && i < 8 ? i + 1 : null}
          />
        ))}

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
          <img src={chevronCollapseUrl} style={{ width: 14, height: 14, opacity: 0.5, transform: "rotate(180deg)" }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-0.5 shrink-0 border-r [-webkit-app-region:no-drag]"
      style={{
        width: "180px",
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-surface)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {tabs.map((tab, i) => (
        <LeftTabPill
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onSelectTab(tab.id)}
          onClose={tabs.length > 1 ? () => onCloseTab(tab.id) : null}
          onContextMenu={(e) => onContextMenu(e, tab.id)}
          tabNum={cmdHeld && i < 8 ? i + 1 : null}
        />
      ))}

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

// TabPill — fixed 180px wide pill with icon slot (left), title (center, monospace), close (right).
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
        if (!isActive)
          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
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
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            color: "var(--text-muted)",
            fontSize: "14px",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-base)";
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

// LeftTabPill — vertical sidebar variant. Same visual system; active state uses an inset left bar.
function LeftTabPill({
  tab,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  tabNum,
}) {
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
        if (!isActive)
          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
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
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            color: "var(--text-muted)",
            fontSize: "14px",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-base)";
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

// Collapsed left-bar variant — icon only, no title text.
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
        if (!isActive)
          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
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

// Small Cmd+number hint badge rendered inline inside a tab pill.
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

function IconButton({ title, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] select-none shrink-0"
      style={{ color: "var(--text-muted)", fontSize: "var(--font-size-ui)" }}
    >
      {children}
    </button>
  );
}
