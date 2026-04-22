// Slash command registry.
//
// Adding a new command is a one-line change: append an entry below.
// Each entry is `{ id, title, description, section, run(ctx) }`.
//
// If the new command needs a capability the per-pane `commandContext` doesn't
// yet provide, add one method to the context builder in TerminalPane.
//
// Commands run in-app only — they never reach the shell and never enter
// shared command history.

export const ALL_COMMANDS = [
  {
    id: 'split-right',
    title: 'Split right',
    description: 'Open a new pane to the right of the current one',
    section: 'Pane',
    run: (ctx) => ctx.splitPane('horizontal'),
  },
  {
    id: 'split-down',
    title: 'Split down',
    description: 'Open a new pane below the current one',
    section: 'Pane',
    run: (ctx) => ctx.splitPane('vertical'),
  },
  {
    id: 'close-pane',
    title: 'Close pane',
    description: 'Close the current pane',
    section: 'Pane',
    run: (ctx) => ctx.closePane(),
  },
  {
    id: 'new-tab',
    title: 'New tab',
    description: 'Open a new terminal tab',
    section: 'Tab',
    run: (ctx) => ctx.newTab(),
  },
  {
    id: 'toggle-tab-position',
    title: 'Toggle tab position',
    description: 'Flip the tab bar between top and left',
    section: 'Appearance',
    run: (ctx) => ctx.toggleTabPosition(),
  },
  {
    id: 'clear-scrollback',
    title: 'Clear scrollback',
    description: 'Clear the terminal scrollback buffer',
    section: 'Terminal',
    run: (ctx) => ctx.clearScrollback(),
  },
  {
    id: 'copy-last-output',
    title: 'Copy last output',
    description: "Copy the previous command's output to the clipboard",
    section: 'Terminal',
    run: (ctx) => ctx.copyLastOutput(),
  },
]

const COMMANDS_BY_ID = new Map(ALL_COMMANDS.map((c) => [c.id, c]))

export function getCommand(id) {
  return COMMANDS_BY_ID.get(id) ?? null
}

// Case-insensitive startsWith filter on id and title. Empty prefix returns
// all commands in registry order.
export function filterByPrefix(prefix) {
  if (!prefix) return ALL_COMMANDS
  const p = prefix.toLowerCase()
  return ALL_COMMANDS.filter(
    (c) => c.id.toLowerCase().startsWith(p) || c.title.toLowerCase().startsWith(p),
  )
}
