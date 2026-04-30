// Registry of all prompt segments — drives both the Preferences UI and segment gating in Prompt.
//
// required    — true means the user cannot disable this segment (cwd, exit indicator).
// contextual  — true means the segment only appears when detected (e.g. git, node);
//               false means it shows unconditionally when enabled (e.g. time, username).
// defaultEnabled — initial value stored in localStorage prefs.

export const SEGMENT_DEFINITIONS = [
  { id: 'cwd',         name: 'Directory',    required: true,  contextual: false, defaultEnabled: true  },
  { id: 'git',         name: 'Git',          required: false, contextual: true,  defaultEnabled: true  },
  { id: 'node',        name: 'Node.js',      required: false, contextual: true,  defaultEnabled: true  },
  { id: 'go',          name: 'Go',           required: false, contextual: true,  defaultEnabled: true  },
  { id: 'python',      name: 'Python',       required: false, contextual: true,  defaultEnabled: true  },
  { id: 'rust',        name: 'Rust',         required: false, contextual: true,  defaultEnabled: true  },
  { id: 'c',           name: 'C/C++',        required: false, contextual: true,  defaultEnabled: true  },
  { id: 'php',         name: 'PHP',          required: false, contextual: true,  defaultEnabled: true  },
  { id: 'java',        name: 'Java',         required: false, contextual: true,  defaultEnabled: true  },
  { id: 'kotlin',      name: 'Kotlin',       required: false, contextual: true,  defaultEnabled: true  },
  { id: 'haskell',     name: 'Haskell',      required: false, contextual: true,  defaultEnabled: true  },
  { id: 'docker',      name: 'Docker',       required: false, contextual: true,  defaultEnabled: true  },
  { id: 'k8s',         name: 'Kubernetes',   required: false, contextual: true,  defaultEnabled: true  },
  { id: 'conda',       name: 'Conda',        required: false, contextual: true,  defaultEnabled: true  },
]

export const SEGMENT_MAP = Object.fromEntries(SEGMENT_DEFINITIONS.map(s => [s.id, s]))

// ── Module-level reactive store ───────────────────────────────────────────────
//
// Prompt is rendered both inside PreferencesProvider (InputBar) and in
// out-of-tree xterm decoration React roots (PromptAddon). The module store
// lets those roots read the current segment preferences without React context.

let currentSegmentPrefs = Object.fromEntries(
  SEGMENT_DEFINITIONS.map(s => [s.id, s.defaultEnabled])
)
const segmentListeners = new Set()

export function getSegmentEnabled(id) {
  const def = SEGMENT_MAP[id]
  if (def?.required) return true
  return currentSegmentPrefs[id] ?? def?.defaultEnabled ?? true
}

export function setAllSegmentPrefs(prefs) {
  currentSegmentPrefs = { ...currentSegmentPrefs, ...prefs }
  segmentListeners.forEach(fn => fn())
}

export function subscribeSegmentPrefs(fn) {
  segmentListeners.add(fn)
  return () => segmentListeners.delete(fn)
}

// Snapshot of all enabled IDs — used by useSyncExternalStore's getSnapshot.
export function getSegmentPrefSnapshot() {
  return currentSegmentPrefs
}
