# Search Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add case-sensitivity, whole-word, and regex toggle buttons to the Cmd+F search bar in the terminal pane.

**Architecture:** All changes are self-contained in `OutputArea/index.jsx`. Three new boolean state variables feed into an updated `searchOpts()` function. The existing search bar JSX gains three icon toggle buttons. Invalid regex is caught and signals via a red input border.

**Tech Stack:** React (hooks), xterm.js `SearchAddon` (`findNext`/`findPrevious` already support `caseSensitive`, `wholeWord`, `regex` options natively).

## Global Constraints

- All changes in `app/src/renderer/src/components/OutputArea/index.jsx` only — no new files.
- Follow existing inline style pattern (no Tailwind classes inside the search bar overlay).
- xterm `SearchAddon` does not support `wholeWord` + `regex` simultaneously — `wholeWord` must be disabled when `regex` is active.
- Do not persist toggle state to localStorage.

---

### Task 1: Update `searchOpts` and add toggle state

**Files:**
- Modify: `app/src/renderer/src/components/OutputArea/index.jsx`

**Interfaces:**
- Produces: `searchOpts(accent, { caseSensitive, wholeWord, regex })` — used by all `findNext`/`findPrevious` call sites in the same file.

- [ ] **Step 1: Update `searchOpts` to accept options**

Replace the existing `searchOpts` function (lines ~25-37):

```js
function searchOpts(accent, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
  return {
    caseSensitive,
    wholeWord,
    regex,
    decorations: {
      matchBackground:               accent + '30',
      matchBorder:                   accent + '90',
      matchOverviewRuler:            accent + '90',
      activeMatchBackground:         accent + '70',
      activeMatchBorder:             accent,
      activeMatchColorOverviewRuler: accent,
    },
  };
}
```

- [ ] **Step 2: Add three state variables after the existing search state**

After the line `const [searchQuery, setSearchQuery] = useState('');` add:

```js
const [caseSensitive, setCaseSensitive] = useState(false);
const [wholeWord, setWholeWord] = useState(false);
const [useRegex, setUseRegex] = useState(false);
const [regexError, setRegexError] = useState(false);
```

(`useRegex` avoids shadowing the DOM `regex` name; `regexError` drives the red input border.)

- [ ] **Step 3: Update every `searchOpts()` call site to pass the toggle state**

There are four call sites in the search bar JSX and one in the Escape handler. Replace every `searchOpts(tabAccentRef.current)` with:

```js
searchOpts(tabAccentRef.current, { caseSensitive, wholeWord: wholeWord && !useRegex, regex: useRegex })
```

The four locations are:
1. `onChange` → `findNext(..., { ...opts, incremental: true })`
2. `onKeyDown` Enter → `findPrevious(..., opts)` and `findNext(..., opts)`
3. `onClick` ↑ button → `findPrevious(...)`
4. `onClick` ↓ button → `findNext(...)`

- [ ] **Step 4: Wrap findNext / findPrevious calls in try/catch for invalid regex**

Create a helper just above the `searchOpen &&` JSX block:

```js
function safeFind(fn, query, opts) {
  try {
    setRegexError(false);
    fn(query, opts);
  } catch {
    setRegexError(true);
  }
}
```

Then replace every direct `searchAddonRef.current?.findNext(...)` / `findPrevious(...)` call with:

```js
safeFind(
  searchAddonRef.current.findNext.bind(searchAddonRef.current),
  query,
  opts
)
// or findPrevious respectively
```

Also reset `regexError` in the Escape handler and on close button click:

```js
setRegexError(false);
```

- [ ] **Step 5: Manual smoke test**

Run `make dev`. Open a terminal pane, run `ls -la`, press Cmd+F, type a query — confirm search still works with no console errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/src/components/OutputArea/index.jsx
git commit -m "refactor: update searchOpts to accept caseSensitive/wholeWord/regex options"
```

---

### Task 2: Add toggle buttons to the search bar UI

**Files:**
- Modify: `app/src/renderer/src/components/OutputArea/index.jsx`

**Interfaces:**
- Consumes: `caseSensitive`, `wholeWord`, `useRegex`, `regexError` state; `setCaseSensitive`, `setWholeWord`, `setUseRegex` setters; updated `searchOpts`.

- [ ] **Step 1: Add a toggle button helper inside the `searchOpen &&` block**

Inside the `{searchOpen && (...)}` block, define a small inline helper before the `<input>` (or keep it as a variable in the component body just above the return — either works). Since JSX doesn't support function declarations inline, add this just above the `return (` statement:

```js
function SearchToggle({ label, title, active, disabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={title}
      style={{
        background: active ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 60%, transparent)' : 'transparent'}`,
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-muted)' : active ? 'var(--accent)' : 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
        padding: '1px 5px',
        lineHeight: '16px',
        opacity: disabled ? 0.4 : 1,
        userSelect: 'none',
      }}
    >
      {label}
    </button>
  );
}
```

Place it outside `OutputArea` (module-level), since it has no dependency on component state.

- [ ] **Step 2: Wire `regexError` to the input border**

Update the `<input>` style to add a conditional border color:

```js
style={{
  background: 'transparent',
  border: 'none',
  borderBottom: regexError ? '1px solid #f87171' : '1px solid transparent',
  outline: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-ui)',
  color: regexError ? '#f87171' : 'var(--text-primary)',
  width: 180,
}}
```

- [ ] **Step 3: Add the three toggle buttons to the search bar**

Insert the three `<SearchToggle>` elements between the `<input>` and the existing `↑` button, with a thin separator:

```jsx
{/* separator */}
<div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />

<SearchToggle
  label="Aa"
  title="Match case"
  active={caseSensitive}
  onToggle={() => setCaseSensitive(v => !v)}
/>
<SearchToggle
  label="W"
  title="Whole word (disabled in regex mode)"
  active={wholeWord && !useRegex}
  disabled={useRegex}
  onToggle={() => !useRegex && setWholeWord(v => !v)}
/>
<SearchToggle
  label=".*"
  title="Use regular expression"
  active={useRegex}
  onToggle={() => { setUseRegex(v => !v); setRegexError(false); }}
/>

{/* separator */}
<div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
```

- [ ] **Step 4: Re-run search on toggle change**

When a toggle fires, the current query needs to be re-searched. Add a `useEffect` that re-runs `findNext` whenever the toggle state changes while the search bar is open:

```js
useEffect(() => {
  if (!searchOpen || !searchQuery) return;
  const opts = searchOpts(tabAccentRef.current, {
    caseSensitive,
    wholeWord: wholeWord && !useRegex,
    regex: useRegex,
  });
  try {
    setRegexError(false);
    searchAddonRef.current?.findNext(searchQuery, { ...opts, incremental: true });
  } catch {
    setRegexError(true);
  }
}, [caseSensitive, wholeWord, useRegex]);
```

Place this after the existing `searchOpen` focus effect.

- [ ] **Step 5: Reset toggles when search closes**

In the Escape handler and the close button `onClick`, also reset the error state (already done in Task 1). Optionally reset the toggles — per design they persist within the session, so **do not** reset `caseSensitive`, `wholeWord`, `useRegex` on close.

- [ ] **Step 6: Manual test**

Run `make dev`. Test the following scenarios:
1. Cmd+F → type `ls` → toggle `Aa` → confirm case-sensitive match changes
2. Toggle `.*` → type `l.` → confirm regex match works; `W` button dims
3. Type an invalid regex `[` → confirm input turns red, no crash
4. Fix the regex → confirm red clears, search resumes
5. Toggle `W` with regex off → confirm whole-word match works
6. Press Escape → bar closes, typing in terminal works normally

- [ ] **Step 7: Commit**

```bash
git add app/src/renderer/src/components/OutputArea/index.jsx
git commit -m "feat: add case, whole-word, and regex toggles to terminal search"
```
