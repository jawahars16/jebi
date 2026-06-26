# Task 2: Frontend Hooks — Wire Constants + useTerminal + useShellEditor + useKeyboardShortcuts

## Context
jebi's frontend communicates with the Go backend via WebSocket typed messages. This task wires up the frontend side of the NL-to-command feature: new wire constants, a send function, incoming message handling, Enter-key intercept for `>` prefix queries, and the `Cmd+>` keyboard shortcut.

## Working directory
`/Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command`

All files below are under `app/src/renderer/src/`.

---

## 1. `wire.js` — add 3 constants at the end of the file

```js
export const TypeNLQuery  = 'nl_query'
export const TypeNLResult = 'nl_result'
export const TypeNLError  = 'nl_error'
```

---

## 2. `hooks/useTerminal.js` — two additions

**A. New `sendNLQuery` callback** (add alongside the other `sendXxx` functions near the bottom):
```js
const sendNLQuery = useCallback((query, cwd) => {
  if (ws.current?.readyState !== WebSocket.OPEN) return
  ws.current.send(JSON.stringify({ type: wire.TypeNLQuery, data: { query, cwd } }))
}, [paneId])
```

**B. Two new cases in `socket.onmessage` switch** (add after the `TypeAIAnalysis` case):
```js
case wire.TypeNLResult:
  callbacksRef.current.onNLResult?.(msg.data?.command ?? '')
  break
case wire.TypeNLError:
  callbacksRef.current.onNLError?.(msg.data)
  break
```

**C. Add `sendNLQuery` to the return object**:
```js
return { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendSummarize, sendAsk, sendNLQuery }
```

---

## 3. `components/InputBar/useShellEditor.js` — Enter handler intercept

In the `Enter` keymap handler (currently at the top of the `submitKeymap` array), add a `>` prefix check **before** the slash-command check and before `onSubmit`. The Enter handler currently looks like:

```js
{
  key: 'Enter',
  run(view) {
    let text = view.state.doc.toString()
    if (!text.trim()) {
      return true
    }
    // slash-command check...
    callbacksRef.current.onSubmit?.(text)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
    return true
  },
},
```

Change it to:

```js
{
  key: 'Enter',
  run(view) {
    let text = view.state.doc.toString()
    if (!text.trim()) {
      return true
    }

    // NL mode: lines starting with '>' are routed to AI, not the shell
    if (text.trimStart().startsWith('>')) {
      const query = text.trimStart().slice(1).trim()
      if (query) {
        callbacksRef.current.onNLSubmit?.(query)
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
      }
      return true
    }

    // Slash-commands short-circuit...
    const ctx = callbacksRef.current.commandContext
    if (ctx && tryExecuteSlashCommand(text, ctx)) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
      return true
    }

    callbacksRef.current.resetNavigation?.()
    callbacksRef.current.onSubmit?.(text)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
    return true
  },
},
```

Also add an Escape handler entry that exits NL mode specifically (add after the existing Escape entry):
The **existing** Escape handler already clears the whole input, which exits NL mode implicitly. No extra Escape handling needed.

---

## 4. `hooks/useKeyboardShortcuts.js` — no changes to the hook itself

The hook is generic — it matches shortcuts from a handlers object. The `Cmd+>` shortcut (`Meta+Shift+>`) will be registered from TerminalPane in Task 3. No changes needed to `useKeyboardShortcuts.js` itself.

---

## NL mode visual detection (via existing onValueChange)

`useShellEditor.js` already fires `callbacksRef.current.onValueChange?.(doc)` on every change via `valueChangeListener`. TerminalPane (Task 3) will detect the `>` prefix in `onValueChange` and set NL mode state. No additional callbacks needed in `useShellEditor.js`.

---

## Constraints
- Do NOT add NL mode state to `useShellEditor.js` — state lives in TerminalPane (Task 3)
- `sendNLQuery` must guard `ws.current?.readyState !== WebSocket.OPEN` like other send functions
- `TypeNLResult` payload from the backend is `{"command": string}` — access as `msg.data?.command`
- `TypeNLError` payload is a plain string — pass as-is to `onNLError`
- No other changes to `useShellEditor.js` beyond the Enter handler

---

## Verification
The app doesn't need to be fully functional yet (Task 3 wires the state). Verify:
1. No lint/build errors: `cd app && npm run typecheck 2>/dev/null || echo "no typecheck"` — just ensure no obvious syntax issues
2. The three constants exist in `wire.js`
3. `sendNLQuery` is exported from `useTerminal.js`
4. The `>` check is before the slash-command check in `useShellEditor.js`

Commit all changes in the worktree with `git -C /Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command commit`.

---

## Report file
Write your full report to: `/Users/jawahar/Work/me/jebi/.superpowers/sdd/task-2-report.md`

Return ONLY: status (DONE/BLOCKED/NEEDS_CONTEXT), commit hash, one-line build/lint result, any concerns.
