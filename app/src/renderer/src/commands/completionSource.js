// CodeMirror 6 CompletionSource factory for slash commands.
//
// Fires only when the editor doc starts with '/' and the cursor is on the
// first line. Returns completions filtered by the text after '/'. If the
// filter matches nothing, returns null so CM6 hides the tooltip naturally —
// this is what makes `/usr/local/bin/foo` behave like a normal shell path.
//
// Acceptance is one-keystroke: the `apply` hook clears the input and runs
// the command immediately. The editor-level Enter keybinding still handles
// the case where the user typed a full command name and dismissed the popup
// (Escape) before pressing Enter — see executor.js.

import { filterByPrefix, ALL_COMMANDS } from './registry'

export function makeSlashCommandSource(callbacksRef) {
  return function slashCommandSource(context) {
    const { state, pos } = context
    if (state.doc.lineAt(pos).number !== 1) return null

    const doc = state.doc.toString()
    if (!doc.startsWith('/')) return null

    const prefix = doc.slice(1)
    const matches = prefix ? filterByPrefix(prefix) : ALL_COMMANDS
    if (matches.length === 0) return null

    return {
      from: 0,
      to: state.doc.line(1).length,
      options: matches.map((cmd) => ({
        label: '/' + cmd.id,
        info: cmd.description,
        type: 'keyword',
        apply: (view) => {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: '' },
          })
          const ctx = callbacksRef.current?.commandContext
          if (!ctx) return
          try {
            cmd.run(ctx)
          } catch (err) {
            console.error(`[slash] command "${cmd.id}" threw:`, err)
          }
        },
      })),
      // Keep the tooltip live while the user is still typing `/word-chars`.
      validFor: /^\/[\w-]*$/,
    }
  }
}
