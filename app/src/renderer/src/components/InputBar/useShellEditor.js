import { useEffect, useRef } from 'react'
import { EditorView, keymap, ViewPlugin, WidgetType, Decoration, placeholder } from '@codemirror/view'
import { EditorState, StateEffect, StateField, RangeSet, Compartment, Prec } from '@codemirror/state'
import { defaultKeymap, insertNewlineAndIndent } from '@codemirror/commands'
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { tags as t } from '@lezer/highlight'
import {
  autocompletion,
  startCompletion,
  acceptCompletion,
  completionStatus,
} from '@codemirror/autocomplete'
import { SHELL_COLORS } from '../../utils/tokenizeShell'
import { makeFilePathSource } from '../../commands/filePathSource'
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

function buildTheme(dark) {
  return EditorView.theme({
    '&': {
      background: 'transparent',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-mono)',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'hidden', lineHeight: '1.2' },
    '.cm-content': {
      padding: '5px 5px',
      caretColor: 'var(--accent)',
      minHeight: 'calc(var(--font-size-mono) * 1.2)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      background: 'color-mix(in srgb, var(--accent) 30%, transparent)',
    },
    '.cm-activeLine': { background: 'transparent' },
    '.cm-gutters': { display: 'none' },
    '.cm-placeholder': {
      color: 'var(--text-muted)',
      opacity: '0.4',
      fontStyle: 'italic',
      pointerEvents: 'none',
    },

    // Autocomplete dropdown — matches the active theme via CSS vars.
    '.cm-tooltip.cm-tooltip-autocomplete': {
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-mono)',
      padding: '4px',
      overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      maxHeight: '14em',
      fontFamily: 'var(--font-mono)',
      padding: 0,
      margin: 0,
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--border) transparent',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul::-webkit-scrollbar': {
      width: '3px',
      height: '3px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul::-webkit-scrollbar-thumb': {
      background: 'var(--border)',
      borderRadius: '2px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 8px',
      borderRadius: '4px',
      color: 'var(--text-primary)',
      lineHeight: '1.3',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'var(--accent)',
      color: 'var(--on-accent)',
    },
    '.cm-completionLabel': { color: 'inherit' },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      color: 'var(--accent)',
      fontWeight: 600,
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText': {
      color: 'var(--on-accent)',
    },
    '.cm-completionDetail': {
      color: 'var(--text-muted)',
      fontStyle: 'normal',
      marginLeft: 'auto',
      paddingLeft: '12px',
      fontSize: '0.85em',
    },
    '.cm-file-icon': {
      width: '14px',
      height: '14px',
      flexShrink: 0,
      objectFit: 'contain',
    },
  }, { dark })
}

function buildHighlightStyle() {
  return syntaxHighlighting(HighlightStyle.define([
    { tag: t.keyword,                        color: 'var(--syntax-keyword)' },
    { tag: t.string,                         color: 'var(--syntax-string)' },
    { tag: t.comment,                        color: 'var(--text-muted)', fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation],      color: 'var(--text-secondary)' },
    { tag: t.variableName,                   color: 'var(--syntax-variable)' },
    { tag: t.atom,                           color: 'var(--text-secondary)' },
    { tag: t.number,                         color: 'var(--syntax-number)' },
    { tag: t.special(t.name),               color: 'var(--syntax-keyword)' },
    { tag: t.name,                           color: 'var(--text-primary)' },
  ]))
}

// ─── Ghost text ───────────────────────────────────────────────────────────────

const ghostCycleEffect = StateEffect.define()
export const ghostSuggestionsEffect = StateEffect.define()
export const ghostResultEffect = StateEffect.define()

class GhostWidget extends WidgetType {
  constructor(text) {
    super()
    this.text = text
  }

  toDOM() {
    const span = document.createElement('span')
    span.textContent = this.text
    span.setAttribute('aria-hidden', 'true')
    span.style.cssText = 'color:var(--text-secondary);opacity:0;pointer-events:none;user-select:none;transition:opacity 150ms ease-in;'
    requestAnimationFrame(() => { span.style.opacity = '0.65' })
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
      this.aiGhost = null   // current AI-sourced suggestion; null = none
      this.decorations = Decoration.none
      this._recompute(view)
    }

    update(update) {
      let cycled = false
      let suggestionsChanged = false
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(ghostCycleEffect)) {
            this._cycle(e.value, update.view)
            cycled = true
          }
          if (e.is(ghostSuggestionsEffect)) {
            suggestionsChanged = true
          }
          if (e.is(ghostResultEffect)) {
            const suggestion = e.value
            const doc = update.view.state.doc.toString()
            // Only store if non-empty and consistent with current input
            if (suggestion && suggestion.startsWith(doc) && suggestion !== doc) {
              this.aiGhost = suggestion
            }
            // Recompute immediately so the replacement is visible without waiting for next keystroke
            this._recompute(update.view)
          }
        }
      }
      if (!cycled && (update.docChanged || update.selectionSet || suggestionsChanged)) {
        this._recompute(update.view)
      }
    }

    _getMatches(prefix) {
      const history = callbacksRef.current.getHistory?.() ?? []
      const seen = new Set()
      const result = []
      for (let i = history.length - 1; i >= 0; i--) {
        const cmd = history[i]?.c
        if (typeof cmd === 'string' && cmd.startsWith(prefix) && cmd !== prefix && !seen.has(cmd)) {
          seen.add(cmd)
          result.push(cmd)
        }
      }
      return result
    }

    _recompute(view) {
      const doc = view.state.doc.toString()
      if (!doc.trim()) {
        this.aiGhost = null  // clear stale AI ghost when input is emptied
        const aiSuggestions = callbacksRef.current.aiSuggestions ?? []
        if (aiSuggestions.length > 0) {
          this.suggestion = aiSuggestions[0]
          this.matchIndex = 0
          this._buildDecoration(view, doc)
          return
        }
        this._clear()
        return
      }
      // Don't offer ghost suggestions while the user is walking history;
      // otherwise a fetched entry picks up an unwanted grey tail.
      if (callbacksRef.current.isNavigatingHistory?.()) { this._clear(); return }

      // AI ghost takes priority when it matches the current prefix.
      if (this.aiGhost && this.aiGhost.startsWith(doc) && this.aiGhost !== doc) {
        this.suggestion = this.aiGhost
        this.matchIndex = 0
        this._buildDecoration(view, doc)
        return
      }
      // AI ghost is stale (user typed past it or backspaced) — discard it.
      this.aiGhost = null

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
      const text = this.suggestion
      if (!text) return false
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
      })
      this.aiGhost = null
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
const nlPlaceholderCompartment = new Compartment()
const NL_PLACEHOLDER_TEXT = 'Describe what you want to do — get a ready-to-run command'

export function useShellEditor(callbacksRef) {
  const editorContainerRef = useRef(null)
  const viewRef = useRef(null)
  const ghostDebounceRef = useRef(null)   // debounce timer for AI ghost query

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const style = getComputedStyle(document.documentElement)
    const bgBase = style.getPropertyValue('--bg-base').trim()
    const h = bgBase.replace('#', '')
    const lum = h.length === 6
      ? (parseInt(h.slice(0,2),16)*299 + parseInt(h.slice(2,4),16)*587 + parseInt(h.slice(4,6),16)*114) / 1000
      : 0
    const isDark = lum <= 140

    const ghostPlugin = makeGhostPlugin(callbacksRef)
    const filePathSource = makeFilePathSource(callbacksRef)
    const valueChangeListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString()
        callbacksRef.current.onValueChange?.(doc)

        // AI ghost debounce — fire query 300ms after user stops typing.
        clearTimeout(ghostDebounceRef.current)
        if (doc.trim() && !callbacksRef.current.nlMode) {
          ghostDebounceRef.current = setTimeout(() => {
            const history = callbacksRef.current.getHistory?.() ?? []
            callbacksRef.current.onGhostQuery?.(doc, history)
          }, 300)
        }
      }
    })

    const submitKeymap = keymap.of([
      {
        key: 'Enter',
        run(view) {
          let text = view.state.doc.toString()
          if (!text.trim()) {
            return true
          }

          // NL mode: if active, route to AI instead of the shell
          if (callbacksRef.current.nlMode) {
            const query = text.trim()
            if (query) {
              callbacksRef.current.onNLSubmit?.(query)
              view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
            }
            return true
          }

          // Slash-commands short-circuit: if the line resolves to a registered
          // in-app command, run it and clear the input WITHOUT calling onSubmit.
          // Skipping onSubmit is also what keeps the line out of shared history.
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
      {
        key: 'Shift-Enter',
        run: insertNewlineAndIndent,
      },
      {
        key: 'Escape',
        run(view) {
          callbacksRef.current.onDismissExplanation?.()
          callbacksRef.current.onDismissSuggestions?.()
          callbacksRef.current.onNLModeChange?.(false)
          if (view.state.doc.length === 0) return false
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
          callbacksRef.current.resetNavigation?.()
          return true
        },
      },
      {
        key: 'Ctrl-d',
        run() {
          callbacksRef.current.onDismissExplanation?.()
          return false // let the event propagate normally
        },
      },
      {
        key: 'Ctrl-c',
        run(view) {
          callbacksRef.current.onDismissExplanation?.()
          if (view.state.doc.length === 0) return false
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
          callbacksRef.current.resetNavigation?.()
          return true
        },
      },
      {
        key: 'ArrowUp',
        run(view) {
          const doc = view.state.doc.toString()
          const head = view.state.selection.main.head
          if (view.state.doc.lineAt(head).number !== 1) return false

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
        // Tab precedence (first match wins):
        //   1. popup open                   → accept highlighted item
        //   2. doc start (no chars)         → noop (first token is a command)
        //   3. preceding char is space      → open file dropdown (cwd)
        //   4. current word contains '/'    → open file dropdown (parent dir)
        //   5. word is an argument (not cmd)→ open file dropdown (cwd, filtered)
        //   6. mid-word with ghost text     → accept ghost text
        //   7. otherwise                    → noop
        key: 'Tab',
        run(view) {
          if (completionStatus(view.state) != null) {
            acceptCompletion(view)
            return true
          }

          const { head } = view.state.selection.main
          if (head === 0) {
            // If input is empty and suggestions exist, fill in the first one
            const suggestions = callbacksRef.current.aiSuggestions
            if (suggestions?.length > 0) {
              view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: suggestions[0] } })
            }
            return true // consume Tab — never let it blur the input
          }

          const before = view.state.sliceDoc(Math.max(0, head - 1), head)
          if (/\s/.test(before)) {
            startCompletion(view)
            return true
          }

          const lineFrom = view.state.doc.lineAt(head).from
          const wordSoFar = view.state.sliceDoc(lineFrom, head).match(/\S*$/)?.[0] ?? ''
          if (wordSoFar.includes('/')) {
            startCompletion(view)
            return true
          }

          // Relative path argument without a slash (e.g. `cd ter`): open the
          // file picker filtered by the partial name. Guard: only when the
          // word doesn't start at the beginning of the line, so we don't
          // accidentally open the picker for the command token itself.
          if (wordSoFar && head - wordSoFar.length > lineFrom) {
            startCompletion(view)
            return true
          }

          const plugin = view.plugin(ghostPlugin)
          if (plugin?.suggestion) return plugin.accept(view)
          return true // consume Tab — never let it blur the input
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
          buildHighlightStyle(),
          buildTheme(isDark),
          EditorView.lineWrapping,
          nlPlaceholderCompartment.of([]),
          autoHeightPlugin,
          // Slash-command + file-path completions.
          //   - slashSource: gates on doc starting with '/'; activates on typing.
          //   - filePathSource: gates on context.explicit (Tab-only). Will not
          //     spontaneously open while typing — protects Up/Down history nav.
          autocompletion({
            override: [filePathSource],
            activateOnTyping: true,
            closeOnBlur: true,
            icons: false,
            addToOptions: [{
              // Render a 14×14 icon before the label for completions that
              // carry an iconUrl (file-path entries). Slash commands have
              // no iconUrl → render nothing for them.
              render(completion) {
                if (!completion.iconUrl) return null
                const img = document.createElement('img')
                img.src = completion.iconUrl
                img.className = 'cm-file-icon'
                img.alt = ''
                return img
              },
              position: 20,
            }],
          }),
          Prec.highest(submitKeymap),
          keymap.of(defaultKeymap),
          ghostPlugin,
          valueChangeListener,
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

  const setNlPlaceholder = (active) => {
    viewRef.current?.dispatch({
      effects: nlPlaceholderCompartment.reconfigure(
        active ? placeholder(NL_PLACEHOLDER_TEXT) : []
      )
    })
  }

  return { editorContainerRef, viewRef, setNlPlaceholder }
}
