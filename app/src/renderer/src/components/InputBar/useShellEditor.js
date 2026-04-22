import { useEffect, useRef } from 'react'
import { EditorView, keymap, ViewPlugin, WidgetType, Decoration } from '@codemirror/view'
import { EditorState, StateEffect, RangeSet } from '@codemirror/state'
import { defaultKeymap, insertNewlineAndIndent } from '@codemirror/commands'
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { tags as t } from '@lezer/highlight'
import { autocompletion } from '@codemirror/autocomplete'
import { SHELL_COLORS } from '../../utils/tokenizeShell'
import { makeSlashCommandSource } from '../../commands/completionSource'
import { tryExecuteSlashCommand } from '../../commands/executor'

const shellLanguage = StreamLanguage.define(shell)

// Auto-height plugin — makes the editor grow with content like a textarea.
const autoHeightPlugin = ViewPlugin.define((view) => {
  function measure() {
    const h = view.contentDOM.offsetHeight
    if (h > 0) view.dom.style.height = h + 'px'
  }
  measure()
  return { update: measure }
})

function buildTheme(cssVar) {
  return EditorView.theme({
    '&': {
      background: 'transparent',
      color: cssVar('--text-primary'),
      fontFamily: cssVar('--font-mono'),
      fontSize: cssVar('--font-size-mono'),
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'hidden', lineHeight: '1.2' },
    '.cm-content': {
      padding: '5px 10px',
      caretColor: cssVar('--accent'),
      minHeight: `calc(${cssVar('--font-size-mono')} * 1.2)`,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: cssVar('--accent'),
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      background: cssVar('--accent') + '44',
    },
    '.cm-activeLine': { background: 'transparent' },
    '.cm-gutters': { display: 'none' },
  }, { dark: true })
}

function buildHighlightStyle(cssVar) {
  return syntaxHighlighting(HighlightStyle.define([
    { tag: t.keyword,                        color: cssVar('--accent') },
    { tag: t.string,                         color: SHELL_COLORS.string },
    { tag: t.comment,                        color: cssVar('--text-muted'), fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation],      color: cssVar('--text-secondary') },
    { tag: t.variableName,                   color: SHELL_COLORS.variable },
    { tag: t.atom,                           color: cssVar('--text-secondary') },
    { tag: t.number,                         color: '#de935f' },
    { tag: t.special(t.name),               color: cssVar('--accent') },
    { tag: t.name,                           color: cssVar('--text-primary') },
  ]))
}

// ─── Ghost text ───────────────────────────────────────────────────────────────

const ghostCycleEffect = StateEffect.define()

class GhostWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }

  toDOM() {
    const span = document.createElement('span')
    span.textContent = this.text
    span.setAttribute('aria-hidden', 'true')
    span.style.cssText = 'color:var(--text-muted);opacity:0.4;pointer-events:none;user-select:none;'
    return span
  }

  eq(other) {
    return other.text === this.text
  }
}

function makeGhostPlugin(callbacksRef) {
  class GhostTextPlugin {
    constructor(view) {
      this.suggestion = null
      this.matchIndex = 0
      this.decorations = Decoration.none
      this._recompute(view)
    }

    update(update) {
      let cycled = false
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(ghostCycleEffect)) {
            this._cycle(e.value, update.view)
            cycled = true
          }
        }
      }
      if (!cycled && (update.docChanged || update.selectionSet)) {
        this._recompute(update.view)
      }
    }

    _getMatches(prefix) {
      const history = callbacksRef.current.getHistory?.() ?? []
      const seen = new Set()
      const result = []
      for (let i = history.length - 1; i >= 0; i--) {
        const cmd = history[i]
        if (cmd.startsWith(prefix) && cmd !== prefix && !seen.has(cmd)) {
          seen.add(cmd)
          result.push(cmd)
        }
      }
      return result
    }

    _recompute(view) {
      const doc = view.state.doc.toString()
      if (!doc.trim()) { this._clear(); return }
      // Don't offer ghost suggestions while the user is walking history;
      // otherwise a fetched entry picks up an unwanted grey tail.
      if (callbacksRef.current.isNavigatingHistory?.()) { this._clear(); return }
      const matches = this._getMatches(doc)
      if (matches.length === 0) { this._clear(); return }
      this.suggestion = matches[0]
      this.matchIndex = 0
      this._buildDecoration(view, doc)
    }

    _cycle(direction, view) {
      const doc = view.state.doc.toString()
      const matches = this._getMatches(doc)
      if (matches.length === 0) { this._clear(); return }

      if (direction === 'up') {
        this.matchIndex = Math.min(this.matchIndex + 1, matches.length - 1)
      } else {
        if (this.matchIndex <= 0) { this._clear(); return }
        this.matchIndex--
      }

      this.suggestion = matches[this.matchIndex]
      this._buildDecoration(view, doc)
    }

    _buildDecoration(view, doc) {
      const suffix = this.suggestion.slice(doc.length)
      if (!suffix) { this.decorations = Decoration.none; return }
      const cursorPos = view.state.selection.main.head
      const widget = new GhostWidget(suffix)
      this.decorations = RangeSet.of([
        Decoration.widget({ widget, side: 1 }).range(cursorPos),
      ])
    }

    _clear() {
      this.suggestion = null
      this.matchIndex = 0
      this.decorations = Decoration.none
    }

    accept(view) {
      if (!this.suggestion) return false
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: this.suggestion },
        selection: { anchor: this.suggestion.length },
      })
      this._clear()
      return true
    }
  }

  return ViewPlugin.fromClass(GhostTextPlugin, { decorations: (v) => v.decorations })
}

// ─── Editor setup ─────────────────────────────────────────────────────────────

/**
 * useShellEditor — manages the CodeMirror 6 EditorView lifecycle.
 *
 * @param {{ onSubmit, onNavigateHistory, getHistory }} callbacksRef
 * @returns {{ editorContainerRef, viewRef }}
 */
export function useShellEditor(callbacksRef) {
  const editorContainerRef = useRef(null)
  const viewRef = useRef(null)

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const style = getComputedStyle(document.documentElement)
    const cssVar = (name) => style.getPropertyValue(name).trim()

    const ghostPlugin = makeGhostPlugin(callbacksRef)
    const slashSource = makeSlashCommandSource(callbacksRef)

    const submitKeymap = keymap.of([
      {
        key: 'Enter',
        run(view) {
          const text = view.state.doc.toString()
          if (!text.trim()) return true

          // Slash-commands short-circuit: if the line resolves to a registered
          // in-app command, run it and clear the input WITHOUT calling onSubmit.
          // Skipping onSubmit is also what keeps the line out of shared history.
          const ctx = callbacksRef.current.commandContext
          if (ctx && tryExecuteSlashCommand(text, ctx)) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
            return true
          }

          callbacksRef.current.onSubmit?.(text)
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
          return true
        },
      },
      {
        key: 'Shift-Enter',
        run: insertNewlineAndIndent,
      },
      {
        key: 'ArrowUp',
        run(view) {
          const doc = view.state.doc.toString()
          const head = view.state.selection.main.head
          if (view.state.doc.lineAt(head).number !== 1) return false

          // Keep walking history once navigation has started, even though the
          // doc is now non-empty. Only fall back to ghost cycling when the
          // user is NOT mid-history-navigation.
          const inHistoryNav = callbacksRef.current.isNavigatingHistory?.() ?? false
          if (!inHistoryNav && doc.trim()) {
            view.dispatch({ effects: ghostCycleEffect.of('up') })
            return true
          }

          const next = callbacksRef.current.onNavigateHistory?.('up', doc)
          if (next == null) return true
          view.dispatch({
            changes: { from: 0, to: doc.length, insert: next },
            selection: { anchor: next.length },
          })
          return true
        },
      },
      {
        key: 'ArrowDown',
        run(view) {
          const doc = view.state.doc.toString()
          const head = view.state.selection.main.head
          if (view.state.doc.lineAt(head).number !== view.state.doc.lines) return false

          const inHistoryNav = callbacksRef.current.isNavigatingHistory?.() ?? false
          if (!inHistoryNav && doc.trim()) {
            view.dispatch({ effects: ghostCycleEffect.of('down') })
            return true
          }

          const next = callbacksRef.current.onNavigateHistory?.('down', doc)
          if (next == null) return true
          view.dispatch({
            changes: { from: 0, to: doc.length, insert: next },
            selection: { anchor: next.length },
          })
          return true
        },
      },
      {
        key: 'Tab',
        run(view) {
          const plugin = view.plugin(ghostPlugin)
          if (plugin?.suggestion) return plugin.accept(view)
          return false
        },
      },
      {
        key: 'ArrowRight',
        run(view) {
          const { head } = view.state.selection.main
          if (head !== view.state.doc.length) return false
          const plugin = view.plugin(ghostPlugin)
          if (plugin?.suggestion) return plugin.accept(view)
          return false
        },
      },
    ])

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          shellLanguage,
          buildHighlightStyle(cssVar),
          buildTheme(cssVar),
          EditorView.lineWrapping,
          autoHeightPlugin,
          // Slash-command completions. `activateOnTyping` ensures the popup
          // opens as soon as the user types `/` in an empty doc; the source
          // itself gates everything else (line 1, starts with `/`, etc.).
          autocompletion({
            override: [slashSource],
            activateOnTyping: true,
            closeOnBlur: true,
            icons: false,
          }),
          submitKeymap,
          keymap.of(defaultKeymap),
          ghostPlugin,
        ],
      }),
      parent: container,
    })

    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  return { editorContainerRef, viewRef }
}
