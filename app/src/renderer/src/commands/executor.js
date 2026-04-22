// Slash-command executor.
//
// Called from the InputBar's Enter keybinding BEFORE handing off to onSubmit.
// If the line resolves to a registered slash command, it runs in-app and
// returns true so the caller can clear the input without submitting.
// Otherwise returns false and the line proceeds to the shell as usual.
//
// Because this short-circuits before onSubmit, slash commands never enter
// useSharedHistory — the history push lives on the shell-exit-code path.

import { getCommand } from './registry'

export function tryExecuteSlashCommand(line, ctx) {
  if (!ctx) return false

  const trimmed = line.trim()
  if (!trimmed.startsWith('/')) return false
  // Multi-line slash input (via Shift+Enter) is out of scope — pass through
  // to the shell rather than guess which line is the command.
  if (trimmed.includes('\n')) return false

  const id = trimmed.slice(1)
  const cmd = getCommand(id)
  if (!cmd) return false

  try {
    cmd.run(ctx)
  } catch (err) {
    // Surface the failure but still report the line as handled — we don't
    // want a broken command to leak `/foo` into the shell.
    console.error(`[slash] command "${id}" threw:`, err)
  }
  return true
}
