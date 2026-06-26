# Task 3: Frontend UI — NLCommandPanel + TerminalPane wiring + InputBar NL indicator

## Context
jebi is an Electron terminal app. Tasks 1 and 2 are done: the Go backend handles `nl_query`→`nl_result`/`nl_error` over WebSocket, and the frontend hooks (`useTerminal`, `useShellEditor`) already intercept Enter on `>` prefix and call `callbacksRef.current.onNLSubmit?.(query)`, and handle incoming `TypeNLResult`/`TypeNLError` via `callbacksRef.current.onNLResult`/`onNLError`.

This task wires up the UI state and rendering. Three files to touch, one new component to create.

## Working directory
`/Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command`

All frontend files are under `app/src/renderer/src/`.

---

## 1. New file: `components/NLCommandPanel/index.jsx`

Create this file (~100 lines). It is an inline panel that renders above the InputBar (flex sibling, not fixed/modal). It follows the same visual language as `ExplanationPanel` — same CSS variables, same animation, same left-border accent pattern.

### Props
```jsx
// query: string — the original NL query the user typed
// command: string|null — the translated command from AI (null while loading)
// loading: bool — true while waiting for AI response
// error: string|null — error message if AI failed
// onAccept: (command: string) => void — user clicks Accept
// onCancel: () => void — user clicks Cancel
// onRetry: () => void — user clicks Try Again (error state only)
```

### Visual structure

```
┌─────────────────────────────────────────────────────────┐
│ ✦ AI  [query text here]                              [×] │  ← header row
├─────────────────────────────────────────────────────────┤
│  Thinking…  (loading state)                              │
│  OR                                                      │
│  > docker ps -a  (result state, monospace)               │
│  OR                                                      │
│  Could not translate query  (error state)                │
├─────────────────────────────────────────────────────────┤
│  [Accept]  [Cancel]  (result state)                      │
│  [Try Again]  [Cancel]  (error state)                    │
│  (no buttons while loading)                              │
└─────────────────────────────────────────────────────────┘
```

### Styling rules (use inline styles, same as ExplanationPanel)
- Panel container: `borderTop: '1px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 30%, transparent)'`, `borderLeft: '5px solid var(--accent, var(--tab-accent))'`, `background: 'color-mix(in srgb, var(--accent, var(--tab-accent)) 7%, var(--bg-surface))'`, `animation: 'bannerSlideIn 0.2s ease-out'`
- Include the `@keyframes bannerSlideIn` style tag (copy from ExplanationPanel)
- Header row: `display: flex`, `alignItems: center`, `justifyContent: space-between`, `padding: '6px 12px 4px'`
- Header label: `fontFamily: 'var(--font-mono)'`, `fontSize: 11`, `fontWeight: 600`, `color: 'var(--accent, var(--tab-accent))'`, `letterSpacing: '0.04em'`, `textTransform: 'uppercase'` — show `✦ AI` as label, then a `·` separator, then the query text in normal weight at `color: 'var(--text-secondary)'`
- Body: `padding: '4px 12px 8px'`, `fontFamily: 'var(--font-mono)'`, `fontSize: 'var(--font-size-mono)'`
- Loading state: show "Thinking…" text at `color: 'var(--text-muted)'` with subtle pulse (opacity animation 1→0.5→1 at 1.4s infinite)
- Command display (result state): show the command in a pill/code block — `background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'`, `border: '1px solid var(--border)'`, `borderRadius: 6`, `padding: '6px 10px'`, `color: 'var(--text-primary)'`, `fontSize: 13`, `fontFamily: 'var(--font-mono)'`
- Error text: `color: '#e57373'`
- Button row: `display: flex`, `gap: 8`, `padding: '0 12px 10px'`
- Accept button: `background: 'var(--accent, var(--tab-accent))'`, `color: '#000'`, `border: 'none'`, `borderRadius: 5`, `padding: '4px 14px'`, `fontFamily: 'var(--font-mono)'`, `fontSize: 12`, `fontWeight: 600`, `cursor: 'pointer'`
- Cancel / Try Again buttons: `background: 'transparent'`, `color: 'var(--text-muted)'`, `border: '1px solid var(--border)'`, `borderRadius: 5`, `padding: '4px 12px'`, `fontFamily: 'var(--font-mono)'`, `fontSize: 12`, `cursor: 'pointer'`
- Dismiss (×) button: same as ExplanationPanel's dismiss button, calls `onCancel`

### Behavior
- In loading state: show Thinking… and no buttons
- In result state (command is truthy, !loading, !error): show command pill + Accept + Cancel
- In error state (error is truthy, !loading): show error message + Try Again + Cancel
- If somehow command and error are both null and not loading: render nothing (return null — panel is closed by parent)

---

## 2. `components/TerminalPane/index.jsx`

### New imports (add at top)
```jsx
import NLCommandPanel from "../NLCommandPanel";
```

### Destructure `sendNLQuery` from useTerminal
Change line 39:
```jsx
const { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendSummarize, sendAsk } = useTerminal(...)
```
to:
```jsx
const { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendSummarize, sendAsk, sendNLQuery } = useTerminal(...)
```

### New state (add after existing useState declarations)
```jsx
const [nlMode, setNlMode] = useState(false);
const [nlPanel, setNlPanel] = useState(null); // null = closed; { query, command, loading, error }
```

### Wire NL callbacks onto callbacksRef (add after line ~230, near other callbacksRef.current assignments)
```js
callbacksRef.current.onNLModeChange = (active) => {
  setNlMode(active);
};

callbacksRef.current.onNLSubmit = (query) => {
  setNlPanel({ query, command: null, loading: true, error: null });
  sendNLQuery(query, callbacksRef.current.currentCwd ?? '');
};

callbacksRef.current.onNLResult = (command) => {
  setNlPanel(prev => prev ? { ...prev, command, loading: false, error: null } : null);
};

callbacksRef.current.onNLError = () => {
  setNlPanel(prev => prev ? { ...prev, loading: false, error: 'Could not translate query' } : null);
};
```

### Register Cmd+> shortcut (add to existing useKeyboardShortcuts call)
```jsx
useKeyboardShortcuts({
  'Meta+Alt+1': () => pickSuggestion(0),
  'Meta+Alt+2': () => pickSuggestion(1),
  'Meta+Alt+3': () => pickSuggestion(2),
  'Meta+Shift+>': () => {
    if (!isActive) return;
    const current = inputBarRef.current;
    if (!current) return;
    // toggle: if in NL mode, clear input; otherwise set '>' and focus
    if (nlMode) {
      current.setValue('');
    } else {
      current.setValue('>');
    }
    current.focus();
  },
})
```

Note: `useKeyboardShortcuts` re-registers whenever the handler object changes. The `nlMode` value captured in the closure is fine — the hook re-runs on each render since it's inline.

### Render NLCommandPanel above InputBar
The existing InputBar render block (around line 635):
```jsx
{!running && !fileListOpen && ... && (
  <InputBar ... />
)}
```

Add `onNLModeChange` and `onNLSubmit` props to InputBar, and render NLCommandPanel as a sibling BEFORE InputBar:

```jsx
{nlPanel && (
  <NLCommandPanel
    query={nlPanel.query}
    command={nlPanel.command}
    loading={nlPanel.loading}
    error={nlPanel.error}
    onAccept={(cmd) => {
      setNlPanel(null);
      setNlMode(false);
      setTimeout(() => {
        inputBarRef.current?.setValue(cmd);
        inputBarRef.current?.focus();
      }, 0);
    }}
    onCancel={() => {
      const query = nlPanel.query;
      setNlPanel(null);
      setNlMode(false);
      setTimeout(() => {
        inputBarRef.current?.setValue('>' + query);
        inputBarRef.current?.focus();
      }, 0);
    }}
    onRetry={() => {
      const query = nlPanel.query;
      setNlPanel({ query, command: null, loading: true, error: null });
      sendNLQuery(query, callbacksRef.current.currentCwd ?? '');
    }}
  />
)}
{!running && !fileListOpen && !historyOpen && !runOpen && !portsOpen && !customList && !previewFile && !askOpen && (
  <InputBar
    ref={inputBarRef}
    onSubmit={handleSubmit}
    onSlashChange={handleSlashChange}
    onNLModeChange={(active) => setNlMode(active)}
    onNLSubmit={(query) => callbacksRef.current.onNLSubmit?.(query)}
    nlMode={nlMode}
    ...rest of existing props unchanged...
  />
)}
```

---

## 3. `components/InputBar/index.jsx`

### New props (add to destructured props)
```jsx
nlMode = false,
onNLModeChange,
onNLSubmit,
```

### Wire new callbacks into callbacksRef
Change the existing `onValueChange` assignment from:
```js
callbacksRef.current.onValueChange = (value) => {
  onSlashChange?.(value.startsWith('/') ? value.slice(1) : null);
};
```
to:
```js
callbacksRef.current.onValueChange = (value) => {
  onSlashChange?.(value.startsWith('/') ? value.slice(1) : null);
  onNLModeChange?.(value.trimStart().startsWith('>'));
};
```

Add after existing `callbacksRef.current.onDismissExplanation`:
```js
callbacksRef.current.onNLSubmit = onNLSubmit;
```

### NL mode visual indicator
When `nlMode` is true, show a small pill/badge before the ❯ glyph to indicate AI mode. Change the editor row (the `<div style={{ display: "flex", alignItems: "flex-start", padding: "3px 14px 8px" }}>` section) to:

```jsx
<div style={{ display: "flex", alignItems: "flex-start", padding: "3px 14px 8px" }}>
  {nlMode && (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--accent, var(--tab-accent))',
      background: 'color-mix(in srgb, var(--accent, var(--tab-accent)) 15%, transparent)',
      border: '1px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 40%, transparent)',
      borderRadius: 4,
      padding: '1px 5px',
      marginRight: 6,
      marginTop: 3,
      letterSpacing: '0.05em',
      userSelect: 'none',
      flexShrink: 0,
    }}>AI</span>
  )}
  <span style={{ color: "var(--tab-accent)", opacity: nlMode ? 1 : 0.85, paddingTop: "2px", flexShrink: 0, userSelect: "none", lineHeight: 1.5, fontFamily: "var(--font-mono)", fontSize: "var(--font-size-mono)" }}>
    ❯
  </span>
  <div ref={editorContainerRef} style={{ flex: 1, minWidth: 0 }} />
</div>
```

Also add a subtle left border on the entire InputBar container when nlMode is true:
```jsx
<div style={{
  marginTop: "2px",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  background: 'color-mix(in srgb, #000 20%, var(--bg-surface))',
  borderLeft: nlMode ? '3px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 60%, transparent)' : '3px solid transparent',
  transition: 'border-left-color 0.15s ease',
}}>
```

---

## Constraints
- `NLCommandPanel` renders regardless of whether `running` is true — the panel can stay open even if something else happens. It gates itself: returns null when `nlPanel` is null (in TerminalPane) so it only shows when there's active NL work.
- Do NOT close nlPanel when `running` becomes true — user may have typed something in parallel.
- `onAccept` and `onCancel` use `setTimeout(..., 0)` to avoid setting state during React's render cycle.
- Do NOT add NL state to `useShellEditor.js` — all NL state lives in TerminalPane, the panel reads it via props.
- The `Cmd+>` shortcut uses `nlMode` from TerminalPane's state — it's captured fresh on each render since the handler object is inlined.
- Preserve ALL existing InputBar props exactly — only add `nlMode`, `onNLModeChange`, `onNLSubmit`.

---

## Verification
1. `cd /Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command/app && npm run build 2>&1 | tail -20` — must build without errors
2. Check NLCommandPanel renders in the component tree (it's a new file)
3. Confirm InputBar receives `nlMode`, `onNLModeChange`, `onNLSubmit` props in TerminalPane's render
4. Confirm `sendNLQuery` is destructured from `useTerminal` in TerminalPane
5. Confirm the `Meta+Shift+>` shortcut is registered in `useKeyboardShortcuts`

Commit all changes with `git -C /Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command commit`.

---

## Report file
Write your full report to: `/Users/jawahar/Work/me/jebi/.superpowers/sdd/task-3-report.md`

Return: status (DONE/BLOCKED/NEEDS_CONTEXT), commit hash, one-line build result, any concerns.
