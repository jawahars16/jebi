import { useState } from 'react'
import FolderIcon from '../../icons/FolderIcon'
import ClipboardIcon from '../../icons/ClipboardIcon'

// Prompt — prompt header rendered in xterm decorations and InputBar.
// Used in two places:
//   1. xterm Decoration above each command's output  →  row 1: elements, rows 2+: command lines
//   2. InputBar first line                           →  row 1: elements only (textarea is row 2)
//
// rowHeight: matches the xterm cell height so each row aligns to a terminal row.
// Total component height must equal (1 + commandLines.length) * rowHeight.
export default function Prompt({ command, cwd, exitCode, rowHeight = 28, onCopy }) {
  const [copied, setCopied] = useState(false)
  const hasError = exitCode > 0
  const commandLines = command ? command.split('\n') : []
  const rowStyle = { height: `${rowHeight}px`, minHeight: `${rowHeight}px` }

  function handleCopy(e) {
    e.stopPropagation()
    onCopy?.()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="flex flex-col select-none w-full font-[var(--font-mono)] bg-[var(--bg-surface)]"
      style={{ fontSize: 'var(--font-size-mono)', overflow: 'hidden' }}
    >
      {/* Row 1: prompt elements */}
      <div
        className="flex items-center w-full gap-1"
        style={{ ...rowStyle, overflow: 'hidden' }}
      >
        <div
          className="flex items-center gap-1 px-2"
          style={{
            backgroundColor: hasError ? 'var(--error)' : 'var(--accent)',
            fontWeight: 'bold',
            flexShrink: 0,
          }}
        >
          {cwd && (
            <>
              <FolderIcon />
              <span style={{ color: 'white' }}>{shortenPath(cwd)}</span>
            </>
          )}
        </div>
        <div className="flex-1 h-px bg-gray-300/15" />
        {onCopy && (
          <button
            onClick={handleCopy}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
            onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: copied ? 'var(--accent)' : 'var(--text-muted)',
              flexShrink: 0,
              transition: 'color 0.15s',
              marginRight: '20px',
            }}
            title="Copy command and output"
          >
            {copied
              ? <span style={{ fontSize: '11px', fontWeight: 'bold' }}>✓</span>
              : <ClipboardIcon size={11} color="currentColor" />
            }
          </button>
        )}
      </div>

      {/* Rows 2+: one row per command line (xterm decoration only) */}
      {commandLines.map((line, i) => (
        <div key={i} className="flex items-center px-3 mt-1" style={rowStyle}>
          <span style={{ color: hasError ? 'var(--error)' : 'var(--accent)', fontWeight: 'bold' }}>
            {line}
          </span>
        </div>
      ))}
    </div>
  )
}

function shortenPath(p) {
  const home = '/Users/'
  const parts = p.split('/')
  if (p.startsWith(home) && parts.length >= 3) {
    return '~/' + parts.slice(3).join('/')
  }
  return p
}


