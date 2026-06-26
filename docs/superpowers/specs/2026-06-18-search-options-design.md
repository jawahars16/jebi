# Search Options: Regex, Whole Word, Case Sensitivity

**Date:** 2026-06-18  
**Status:** Approved

## Problem

The Cmd+F search bar in each terminal pane only supports plain text search with case sensitivity hardcoded to `false`. xterm's `SearchAddon` already supports `caseSensitive`, `wholeWord`, and `regex` options — they just aren't exposed in the UI.

## Design

### State

Three boolean state variables added to `OutputArea`:

- `caseSensitive` (default: `false`)
- `wholeWord` (default: `false`)
- `regex` (default: `false`)

### `searchOpts()` update

The existing `searchOpts(accent)` function gains three parameters and passes them through to the xterm search options:

```js
function searchOpts(accent, { caseSensitive, wholeWord, regex } = {}) {
  return { caseSensitive, wholeWord, regex, decorations: { ... } }
}
```

All call sites pass the current toggle state.

### UI: Toggle buttons

Three icon toggle buttons added to the right of the search input, before the ↑↓ close buttons:

| Button | Icon | Option |
|--------|------|--------|
| Case   | `Aa` | `caseSensitive` |
| Word   | `W`  | `wholeWord` |
| Regex  | `.*` | `regex` |

Active state: accent-tinted background + accent text color.  
Inactive state: transparent background + muted text color.

### Constraints

- **Whole word is disabled while regex is on** — xterm's SearchAddon doesn't support both simultaneously. The `W` button is visually dimmed and non-interactive when `regex` is active.
- **Invalid regex handling** — when `regex` is on, `findNext`/`findPrevious` calls are wrapped in a try/catch. On `SyntaxError`, the input border turns red to signal an invalid pattern; no crash.

### Scope

All changes are self-contained in `app/src/renderer/src/components/OutputArea/index.jsx`. No new files, no new components.

## Out of scope

- Persisting toggle state across sessions (localStorage)
- Highlighting all matches simultaneously in an overview ruler beyond what xterm's decoration API already provides
