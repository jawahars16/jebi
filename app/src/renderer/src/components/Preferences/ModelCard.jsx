import { useState } from 'react'
import Tooltip from '../Tooltip'

function formatSpeed(bps) { return (bps / 1e6).toFixed(1) + ' MB/s' }
function formatETA(bytesLeft, speedBps) {
  if (!speedBps) return '–'
  const secs = bytesLeft / speedBps
  if (secs < 60) return `${Math.round(secs)}s`
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
}

export default function ModelCard({ model, isActive, onActivate, onDownload, onCancel, onDelete, downloadProgress, isLast }) {
  const isDownloading = !!downloadProgress
  const isRecommended = model.quality === 'Recommended'
  const [dlHover, setDlHover] = useState(false)
  const [useHover, setUseHover] = useState(false)

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    background: isActive ? 'color-mix(in srgb, var(--brand) 5%, transparent)' : 'transparent',
  }

  const badge = model.quality && (
    <span style={{
      fontSize: 10,
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      padding: '1px 7px',
      borderRadius: 100,
      background: isRecommended
        ? 'color-mix(in srgb, var(--brand) 15%, transparent)'
        : 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
      color: isRecommended ? 'var(--brand)' : 'var(--text-muted)',
      border: isRecommended
        ? '1px solid color-mix(in srgb, var(--brand) 35%, transparent)'
        : '1px solid color-mix(in srgb, var(--text-muted) 25%, transparent)',
      flexShrink: 0,
    }}>
      {model.quality}
    </span>
  )

  const info = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 'var(--font-size-ui)', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
          {model.name}
        </span>
        {badge}
      </div>
      {model.description && (
        <div style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 1 }}>
          {model.description}
        </div>
      )}
    </div>
  )

  // ── Downloading state ────────────────────────────────────────────────────
  if (isDownloading) {
    const { bytesReceived, totalBytes, speedBps } = downloadProgress
    const pct = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0
    return (
      <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {info}
          <button
            onClick={onCancel}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-ui)',
              fontFamily: 'var(--font-ui)',
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        </div>
        <div style={{ height: 2, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', marginTop: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--brand)', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
          {pct}% · {formatSpeed(speedBps)} · {formatETA(totalBytes - bytesReceived, speedBps)} left
        </div>
      </div>
    )
  }

  // ── Active ───────────────────────────────────────────────────────────────
  if (isActive) {
    return (
      <div style={rowStyle}>
        {info}
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 'var(--font-size-ui)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--brand)',
          flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block' }} />
          Active
        </span>
      </div>
    )
  }

  // ── Downloaded, not active ────────────────────────────────────────────────
  if (model.downloaded) {
    return (
      <div style={rowStyle}>
        {info}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Tooltip text="Set as active model">
            <button
              onClick={onActivate}
              onMouseEnter={() => setUseHover(true)}
              onMouseLeave={() => setUseHover(false)}
              style={{
                padding: '3px 10px',
                borderRadius: 4,
                border: `1px solid ${useHover ? 'var(--text-muted)' : 'var(--border)'}`,
                background: useHover ? 'var(--accent-glow)' : 'var(--bg-elevated)',
                color: useHover ? 'var(--text-primary)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-ui)',
                fontFamily: 'var(--font-ui)',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
            >
              Use
            </button>
          </Tooltip>
          <Tooltip text="Remove model file from disk">
            <button
              onClick={onDelete}
              style={{
                padding: '3px 6px',
                borderRadius: 4,
                border: '1px solid transparent',
                background: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1,
                opacity: 0.5,
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              ⊗
            </button>
          </Tooltip>
        </div>
      </div>
    )
  }

  // ── Not downloaded ────────────────────────────────────────────────────────
  return (
    <div style={rowStyle}>
      {info}
      <button
        onClick={onDownload}
        onMouseEnter={() => setDlHover(true)}
        onMouseLeave={() => setDlHover(false)}
        style={{
          padding: '3px 10px',
          borderRadius: 4,
          border: `1px solid ${dlHover ? 'var(--text-muted)' : 'var(--border)'}`,
          background: dlHover ? 'var(--bg-elevated)' : 'none',
          color: dlHover ? 'var(--text-secondary)' : 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 'var(--font-size-ui)',
          fontFamily: 'var(--font-ui)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          transition: 'color 150ms ease, border-color 150ms ease, background 150ms ease',
        }}
      >
        <span style={{ fontSize: 11 }}>↓</span>
        Download
      </button>
    </div>
  )
}
