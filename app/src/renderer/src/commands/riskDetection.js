// Destructive-command detection — a synchronous, zero-dependency check run on
// every submitted command before it reaches the shell. Must stay instant: no
// I/O, no async. New patterns only need to be added to PATTERNS below.

export function detectRisk(trimmed) { // returns null | { id, label, staticMessage }
  for (const p of PATTERNS) {
    if (p.test(trimmed)) return { id: p.id, label: p.label, staticMessage: p.staticMessage(trimmed) }
  }
  return null
}

const PATTERNS = [
  {
    id: 'rm-recursive',
    label: 'Recursive delete',
    // Flags on `rm -r` alone, not just `-rf`: on macOS, `rm -r` only prompts
    // for write-protected files (which `-f` would additionally suppress) —
    // for the common case of ordinary writable files it deletes an entire
    // directory tree silently, exactly like `-rf`.
    //
    // `rm` must be an actual command invocation (start of string, or right
    // after a separator/subshell/`sudo`) — not just the word "rm" appearing
    // as a subcommand of another CLI (e.g. `aws s3 rm ... --recursive`,
    // `gsutil rm -r ...`), which would otherwise false-match on that other
    // command's own --recursive/-r flag.
    test: (c) => /(^|[;&|(`]|\n)\s*(sudo\s+)?rm\b/.test(c) && /(-[a-zA-Z]*[rR][a-zA-Z]*\b|--recursive\b)/.test(c),
    staticMessage: (c) => `This will permanently delete files/directories with no way to undo it: ${c}`,
  },
  {
    id: 'git-push-force',
    label: 'Force push',
    test: (c) => /\bgit\s+push\b.*(--force\b|--force-with-lease\b|(?<!\S)-f(?!\S))/.test(c),
    staticMessage: () => 'This overwrites remote history — commits other people have based work on may be lost.',
  },
  {
    id: 'git-reset-hard',
    label: 'Hard reset',
    test: (c) => /\bgit\s+reset\s+--hard\b/.test(c),
    staticMessage: () => 'This discards all uncommitted local changes permanently.',
  },
  {
    id: 'git-clean-fd',
    label: 'Force clean',
    test: (c) => /\bgit\s+clean\b.*-\w*[fd]\w*[fd]?\b/.test(c),
    staticMessage: () => 'This deletes untracked files/directories from the working tree with no undo.',
  },
  {
    id: 'git-branch-delete-remote',
    label: 'Delete remote branch',
    test: (c) => /\bgit\s+push\b.*(--delete\b|:\S+)/.test(c) || /\bgit\s+branch\s+-D\b/.test(c),
    staticMessage: (c) => `This deletes a branch (${c.includes('-D') ? 'locally' : 'on the remote'}) — harder to recover than a normal delete.`,
  },
  {
    id: 'sql-drop-truncate',
    label: 'Destructive SQL',
    test: (c) => /\b(DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN|TRUNCATE(\s+TABLE)?)\b/i.test(c),
    staticMessage: (c) => {
      const m = c.match(/\b(DROP\s+\w+|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN|TRUNCATE)\b/i)
      return `This permanently destroys data/schema: matches "${m ? m[0] : 'DROP/TRUNCATE'}".`
    },
  },
  {
    // Naive text scan, not a real SQL parser — a WHERE clause belonging to a
    // different statement in the same multi-statement command can mask a
    // genuinely unsafe DELETE (false negative). Good enough for the common
    // single-statement case; not exhaustive.
    id: 'sql-delete-no-where',
    label: 'DELETE without WHERE',
    test: (c) => /\bDELETE\s+FROM\s+\S+/i.test(c) && !/\bWHERE\b/i.test(c),
    staticMessage: (c) => `This deletes every row in the table with no filter — matches: ${c}`,
  },
  {
    id: 'sql-update-no-where',
    label: 'UPDATE without WHERE',
    test: (c) => /\bUPDATE\s+\S+\s+SET\b/i.test(c) && !/\bWHERE\b/i.test(c),
    staticMessage: (c) => `This overwrites every row in the table with no filter — matches: ${c}`,
  },
  {
    id: 'mongo-destructive',
    label: 'MongoDB destructive operation',
    test: (c) => /\.dropDatabase\s*\(\s*\)/.test(c) || /\bdb\.\w+\.drop\s*\(\s*\)/.test(c) || /\.deleteMany\s*\(\s*\{\s*\}\s*\)/.test(c),
    staticMessage: (c) => `This permanently removes a database/collection or all documents in it: ${c}`,
  },
  {
    id: 'redis-flush',
    label: 'Redis flush',
    test: (c) => /\bFLUSHALL\b/i.test(c) || /\bFLUSHDB\b/i.test(c),
    staticMessage: () => 'This permanently erases all keys in the Redis database (or all databases).',
  },
  {
    id: 'dd-device',
    label: 'Raw disk write',
    test: (c) => /\bdd\b.*\bof=\/dev\//.test(c),
    staticMessage: () => 'This writes raw data directly to a device/disk — can destroy partitions or all data on it.',
  },
  {
    id: 'chmod-chown-root',
    label: 'Recursive permission change on root path',
    test: (c) => /\b(chmod|chown)\b/.test(c) && /-\w*R\w*/.test(c) && /(\s\/(\s|$)|\s\/\*|\/(bin|etc|usr|System|Library)\b)/.test(c),
    staticMessage: (c) => `This recursively changes permissions/ownership on a system-level path, which can break the OS: ${c}`,
  },
  {
    id: 'kill-all',
    label: 'Kill all processes',
    test: (c) => /\bkill\s+-9\s+-1\b/.test(c),
    staticMessage: () => 'This sends SIGKILL to every process you own — terminates your entire session, unsaved work included.',
  },
  {
    id: 'docker-prune-force',
    label: 'Force Docker prune',
    test: (c) => /\bdocker\s+(system|container|image|volume)?\s*prune\b.*(-\w*f\w*\b|--force\b)/.test(c),
    staticMessage: () => 'This removes stopped containers/unused images/volumes without Docker\'s own confirmation prompt.',
  },
  {
    id: 'docker-volume-rm',
    label: 'Remove Docker volume',
    test: (c) => /\bdocker\s+volume\s+rm\b/.test(c) || /\bdocker\s+rm\b.*-v\b/.test(c),
    staticMessage: () => 'This deletes a Docker volume\'s data permanently — any data stored in it is gone.',
  },
  {
    id: 'terraform-destroy',
    label: 'Terraform destroy',
    test: (c) => /\bterraform\s+destroy\b/.test(c),
    staticMessage: (c) => /-auto-approve\b/.test(c)
      ? 'This tears down real infrastructure with no interactive confirmation (-auto-approve).'
      : 'This tears down real infrastructure — Terraform will ask to confirm, but review carefully.',
  },
  {
    id: 'kubectl-delete-broad',
    label: 'Broad kubectl delete',
    test: (c) => /\bkubectl\s+delete\b.*\b(namespace|ns|pvc|crd)\b/.test(c) || /\bkubectl\s+delete\b.*(--all\b|-A\b|--all-namespaces\b|--force\b)/.test(c),
    staticMessage: (c) => `This deletes a namespace, CRD, persistent volume claim, or an entire class of resources: ${c}`,
  },
  {
    id: 'kubectl-drain',
    label: 'Drain node',
    test: (c) => /\bkubectl\s+drain\b/.test(c),
    staticMessage: (c) => `This evicts all pods from a node, disrupting whatever is running there: ${c}`,
  },
  {
    id: 'kubectl-replace-force',
    label: 'Force replace resource',
    test: (c) => /\bkubectl\s+replace\b.*--force\b/.test(c),
    staticMessage: () => 'This deletes and recreates the resource — brief downtime and loss of resource history.',
  },
  {
    id: 'mkfs',
    label: 'Format filesystem',
    test: (c) => /\bmkfs(\.\w+)?\b/.test(c),
    staticMessage: (c) => `This formats a filesystem, erasing everything on it: ${c}`,
  },

  // ── Filesystem deletion variants (beyond plain rm) ──────────────────────
  {
    id: 'find-delete',
    label: 'find -delete',
    test: (c) => /\bfind\b.*-delete\b/.test(c),
    staticMessage: (c) => `This permanently deletes every file find matches, with no confirmation: ${c}`,
  },
  {
    id: 'find-exec-rm',
    label: 'find -exec rm',
    test: (c) => /\bfind\b.*-exec\s+rm\b/.test(c),
    staticMessage: (c) => `This permanently deletes every file find matches, with no confirmation: ${c}`,
  },
  {
    id: 'xargs-rm',
    label: 'xargs rm',
    test: (c) => /\bxargs\b.*\brm\b/.test(c),
    staticMessage: (c) => `This deletes every file piped in, with no confirmation: ${c}`,
  },
  {
    id: 'unlink',
    label: 'Unlink file',
    test: (c) => /\bunlink\b/.test(c),
    staticMessage: (c) => `This permanently removes a file with no confirmation: ${c}`,
  },
  {
    id: 'shred',
    label: 'Shred file',
    test: (c) => /\bshred\b/.test(c),
    staticMessage: (c) => `This overwrites and destroys a file so it cannot be recovered, even with data-recovery tools: ${c}`,
  },

  // ── Dangerous redirection — only guarded for sensitive targets; ordinary
  // `>` redirection is too common in everyday shell use to flag broadly. ──
  {
    id: 'redirect-device',
    label: 'Write to raw device',
    test: (c) => />\s*\/dev\/(disk|rdisk|sd|nvme|hd)\w*/.test(c),
    staticMessage: (c) => `This writes directly to a disk device — can destroy partitions or all data on it: ${c}`,
  },
  {
    id: 'redirect-system-file',
    label: 'Overwrite system file',
    test: (c) => />\s*\/etc\/(passwd|shadow|sudoers|hosts|fstab)\b/.test(c),
    staticMessage: (c) => `This overwrites a critical system configuration file, which can break logins or the OS: ${c}`,
  },

  // ── Git destructive operations ──────────────────────────────────────────
  {
    // `git restore --staged <path>` alone only unstages (reversible, doesn't
    // touch the working tree) — not flagged. Anything that touches the
    // working tree (no --staged, or --staged with --worktree) is.
    id: 'git-discard-changes',
    label: 'Discard file changes',
    test: (c) => {
      if (/\bgit\s+checkout\s+--\s+\S/.test(c)) return true
      if (!/\bgit\s+restore\b/.test(c)) return false
      const staged = /--staged\b/.test(c)
      const worktree = /--worktree\b/.test(c)
      return !staged || worktree
    },
    staticMessage: (c) => `This discards uncommitted changes to a file with no undo: ${c}`,
  },
  {
    id: 'git-stash-drop-clear',
    label: 'Drop stashed changes',
    test: (c) => /\bgit\s+stash\s+(drop|clear)\b/.test(c),
    staticMessage: (c) => `This permanently deletes stashed changes: ${c}`,
  },
  {
    id: 'git-reflog-expire',
    label: 'Expire reflog',
    test: (c) => /\bgit\s+reflog\s+expire\b/.test(c),
    staticMessage: () => 'This removes reflog entries, closing off a safety net for recovering lost commits.',
  },
  {
    id: 'git-gc-prune',
    label: 'Aggressively prune git objects',
    test: (c) => /\bgit\s+gc\b.*--prune=now\b/.test(c),
    staticMessage: () => 'This immediately deletes unreachable git objects — any dangling/lost commits become unrecoverable.',
  },

  // ── Cloud storage deletion ───────────────────────────────────────────────
  {
    id: 'cloud-storage-bulk-delete',
    label: 'Bulk cloud storage delete',
    test: (c) =>
      (/\baws\s+s3\s+rm\b/.test(c) && /--recursive\b/.test(c)) ||
      (/\baws\s+s3\s+sync\b/.test(c) && /--delete\b/.test(c)) ||
      (/\bgsutil\s+rm\b/.test(c) && /-\w*r\w*\b/.test(c)) ||
      (/\bgcloud\s+storage\s+rm\b/.test(c) && /--recursive\b/.test(c)) ||
      /\baz\s+storage\s+blob\s+delete-batch\b/.test(c),
    staticMessage: (c) => `This bulk-deletes objects in cloud storage, with no undo: ${c}`,
  },

  // ── Infrastructure destruction ───────────────────────────────────────────
  {
    // Best-effort: `terraform apply <planfile>` doesn't say "destroy" on its
    // own — this only catches the common convention of naming a saved
    // destroy plan something like "destroy.tfplan". Genuine destroy plans
    // with arbitrary filenames will slip through.
    id: 'terraform-apply-destroy-plan',
    label: 'Apply a destroy plan',
    test: (c) => /\bterraform\s+apply\b/.test(c) && /destroy/i.test(c),
    staticMessage: (c) => `This looks like it applies a saved destroy plan, tearing down infrastructure: ${c}`,
  },
  {
    id: 'pulumi-destroy',
    label: 'Pulumi destroy',
    test: (c) => /\bpulumi\s+destroy\b/.test(c),
    staticMessage: () => 'This tears down all resources managed by this Pulumi stack.',
  },
  {
    id: 'cdk-destroy',
    label: 'CDK destroy',
    test: (c) => /\bcdk\s+destroy\b/.test(c),
    staticMessage: () => 'This tears down all resources in this CDK stack.',
  },
  {
    id: 'helm-uninstall',
    label: 'Helm uninstall',
    test: (c) => /\bhelm\s+(uninstall|delete)\b/.test(c),
    staticMessage: (c) => `This removes a Helm release and its resources from the cluster: ${c}`,
  },
  {
    id: 'docker-compose-down-volumes',
    label: 'Compose down with volumes',
    test: (c) => /\bdocker\s+compose\s+down\b/.test(c) && /(-v\b|--volumes\b)/.test(c),
    staticMessage: () => 'This stops the stack and deletes its volumes — any data stored in them is gone.',
  },

  // ── System-level destructive commands ────────────────────────────────────
  {
    id: 'diskutil-erase',
    label: 'Erase disk/volume',
    test: (c) => /\bdiskutil\s+erase(Disk|Volume)\b/.test(c),
    staticMessage: (c) => `This erases a disk or volume, permanently destroying everything on it: ${c}`,
  },
  {
    id: 'systemctl-disable',
    label: 'Disable service',
    test: (c) => /\bsystemctl\s+disable\b/.test(c),
    staticMessage: (c) => `This disables a system service from starting on boot: ${c}`,
  },
  {
    id: 'launchctl-bootout',
    label: 'Unload launch service',
    test: (c) => /\blaunchctl\s+bootout\b/.test(c),
    staticMessage: (c) => `This unloads a launchd service, which can stop a background process from running: ${c}`,
  },
  {
    id: 'system-power',
    label: 'Shutdown/reboot',
    test: (c) => /\b(shutdown|reboot|halt)\b/.test(c),
    staticMessage: (c) => `This powers off or restarts the machine, ending every running process immediately: ${c}`,
  },
  {
    id: 'user-account-mgmt',
    label: 'User account change',
    test: (c) => /\b(userdel|passwd)\b/.test(c) || (/\bdscl\b/.test(c) && /-delete\b/.test(c)),
    staticMessage: (c) => `This changes or removes a user account/password: ${c}`,
  },
]
