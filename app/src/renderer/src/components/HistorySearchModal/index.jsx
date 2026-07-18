import { useState, useEffect, useRef, useCallback } from 'react'
import { getAll } from '../../hooks/useSharedHistory'
import { useGlobalWire } from '../../hooks/useGlobalWire'

const DEBOUNCE_MS = 400
const MAX_CANDIDATES = 40
const MAX_RESULTS = 5

// Succeeded commands only, most recent first, deduplicated — same rule
// /history already uses, kept independent so /history is never touched.
function dedupedCommands() {
  const seen = new Set()
  const result = []
  const history = getAll()
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    const cmd = typeof entry === 'string' ? entry : entry.c
    const ok = typeof entry === 'string' ? true : entry.ok
    if (ok && !seen.has(cmd)) { seen.add(cmd); result.push(cmd) }
  }
  return result
}

function localMatch(query, commands) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const matches = []
  for (const cmd of commands) {
    const lower = cmd.toLowerCase()
    if (words.every((w) => lower.includes(w))) {
      matches.push(cmd)
      if (matches.length >= MAX_RESULTS) break
    }
  }
  return matches
}

export default function HistorySearchModal({ open, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const modalRef = useRef(null)
  const debounceRef = useRef(null)
  // The query an AI request was actually sent for. A response is only ever
  // applied if this still matches the live `query` state at the moment it
  // arrives — otherwise it's stale (query changed, or modal closed/reopened
  // since it was sent) and gets silently discarded. Backend-side cancellation
  // (global_handler.go) already prevents an *overlapping* AI request from
  // ever responding at all, but not the close-then-reopen case, so this
  // frontend guard is still needed.
  const sentForQueryRef = useRef('')

  const { sendHistorySearch } = useGlobalWire({
    onHistoryMatches: (matches) => {
      if (!open || sentForQueryRef.current !== query) return
      setSearching(false)
      setResults(matches)
    },
  })

  // Reset on every open.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults([])
    setSearching(false)
    setSelectedIdx(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const focus = () => inputRef.current?.focus()
    focus()
    const raf = requestAnimationFrame(focus)
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => { setSelectedIdx(0) }, [results])

  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    setSearching(false)
    if (!query.trim()) { setResults([]); return }

    const commands = dedupedCommands().slice(0, MAX_CANDIDATES)
    const local = localMatch(query, commands)
    if (local.length > 0) { setResults(local); return }

    setResults([])
    debounceRef.current = setTimeout(() => {
      sentForQueryRef.current = query
      setSearching(true)
      sendHistorySearch(query, commands)
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [query, open, sendHistorySearch])

  const handleSelect = useCallback((cmd) => {
    onSelect(cmd)
    onClose()
  }, [onSelect, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (results[selectedIdx]) handleSelect(results[selectedIdx])
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, results, selectedIdx, onClose, handleSelect])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '15vh',
      background: 'rgba(0,0,0,0.35)',
    }}>
      <div ref={modalRef} style={{
        width: 480,
        maxWidth: '90vw',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe a command you ran…"
          style={{
            width: '100%',
            padding: '14px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: results.length > 0 || searching ? '1px solid var(--border)' : 'none',
            outline: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'var(--text-primary)',
          }}
        />
        {searching && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            Searching…
          </div>
        )}
        {!searching && results.length > 0 && (
          <div>
            {results.map((cmd, i) => (
              <div
                key={cmd + i}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => handleSelect(cmd)}
                style={{
                  padding: '8px 16px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  background: i === selectedIdx ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {cmd}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
