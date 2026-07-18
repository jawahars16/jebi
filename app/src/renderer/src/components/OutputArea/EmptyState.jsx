import { useState } from 'react'

// Auto-discovers all SVGs in assets/undraw/ — add files there to expand the pool.
const svgModules = import.meta.glob('../../assets/undraw/*.svg', { eager: true })
const ILLUSTRATIONS = Object.entries(svgModules).map(([, mod]) => mod.default)

const QUIPS = [
  "Every bug is just a feature in disguise.",
  "It works on my machine.",
  "Shipping is a feature.",
  "You didn't break it. You discovered an edge case.",
  "Step 1: Coffee. Step 2: Figure out the rest.",
  "First, solve the problem. Then, write the code.",
  "The best code is no code at all.",
  "It's not a bug — it's an undocumented feature.",
  "Any sufficiently advanced bug is indistinguishable from a feature.",
  "Works in prod. Don't touch it.",
  "sudo make me a sandwich.",
  "Have you tried turning it off and on again?",
  "It's always DNS.",
  "There are only two hard things: naming things and off-by-one errors.",
  "git blame someone else.",
  "Stack Overflow is just external memory.",
  "Move fast. Break things. Revert faster.",
  "99 little bugs in the code. Fix one. 127 little bugs in the code.",
  "Real programmers count from zero.",
  "In case of fire: git commit, git push, leave building.",
  "Documentation? The code IS the documentation.",
  "To understand recursion, you must first understand recursion.",
]

const ALL_TIPS = [
  { key: '⌘K',    label: 'Clear the screen' },
  { key: '⌘F',    label: 'Search scrollback' },
  { key: '⌘J',    label: 'Describe a command you ran to find it in history' },
  { key: 'Tab',   label: 'Complete file paths and history' },
  { key: '↑ ↓',  label: 'Browse command history' },
  { key: '/',     label: 'Open command palette' },
  { key: 'Esc',  label: 'Dismiss AI explanation' },
  { label: 'Type /ask to chat with AI about your session' },
  { label: 'Click a segment pill to run its command' },
  { label: '/run shows Makefile and npm scripts — pick one to run' },
  { label: 'AI explains failed commands automatically' },
  { label: '3 next-command suggestions appear after each run' },
  { label: '/ls lists files — click any to preview or edit' },
  { label: '/ports shows listening ports — click to inspect or kill' },
  { label: 'Add custom /commands in Preferences → Commands' },
  { label: 'Split panes from the tab context menu' },
  { label: 'Tab-completes file paths after a space or /' },
  { label: 'Each tab has its own accent color — try the tab menu' },
  { label: 'Click the folder pill to open the directory in Finder' },
]

function pickRandom(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}

function KeyBadge({ label }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 36,
      padding: '1px 5px',
      borderRadius: 3,
      border: '1px solid color-mix(in srgb, var(--text-muted) 30%, transparent)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function TipRow({ tip }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: 'var(--text-muted)',
    }}>
      <span style={{ minWidth: 46, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        {tip.key ? <KeyBadge label={tip.key} /> : null}
      </span>
      <span style={{ opacity: 0.7 }}>{tip.label}</span>
    </div>
  )
}

export default function EmptyState() {
  const [src] = useState(() =>
    ILLUSTRATIONS.length > 0
      ? ILLUSTRATIONS[Math.floor(Math.random() * ILLUSTRATIONS.length)]
      : null
  )
  const [quip] = useState(() => QUIPS[Math.floor(Math.random() * QUIPS.length)])
  const [tips] = useState(() => pickRandom(ALL_TIPS, 5))

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 1,
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 360,
        maxHeight: '100%',
        overflow: 'hidden',
        marginBottom: 40,
      }}>
        {src && (
          <img
            src={src}
            alt=""
            style={{ width: 140, opacity: 0.2, marginBottom: 12, userSelect: 'none', flexShrink: 0 }}
          />
        )}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-muted)',
          opacity: 0.5,
          fontStyle: 'italic',
          marginBottom: 16,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {quip}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'stretch', overflow: 'hidden' }}>
          {tips.map((tip, i) => <TipRow key={i} tip={tip} />)}
        </div>
      </div>
    </div>
  )
}
