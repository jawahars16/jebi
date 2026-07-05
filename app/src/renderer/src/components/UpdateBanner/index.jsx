export default function UpdateBanner({ latestVersion, onDismiss, onUpgrade }) {
  return (
    <div
      style={{
        position: 'relative',
        margin: 0,
        borderTop: '1px solid color-mix(in srgb, var(--tab-accent) 30%, transparent)',
        borderLeft: '5px solid var(--tab-accent)',
        background: 'color-mix(in srgb, var(--tab-accent) 7%, var(--bg-surface))',
        animation: 'bannerSlideIn 0.2s ease-out',
      }}
    >
      <style>{`
        @keyframes bannerSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px 0',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--tab-accent)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          Update available
        </span>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 2px',
            opacity: 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.target.style.opacity = 1}
          onMouseLeave={e => e.target.style.opacity = 0.6}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-mono)',
        color: 'var(--text-primary)',
      }}>
        <span>
          Version <strong>{latestVersion}</strong> is ready to install.
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: '1px solid color-mix(in srgb, var(--tab-accent) 40%, transparent)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '3px 10px',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 0.7}
            onMouseLeave={e => e.currentTarget.style.opacity = 1}
          >
            Later
          </button>
          <button
            onClick={onUpgrade}
            style={{
              background: 'var(--tab-accent)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#fff',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 0.8}
            onMouseLeave={e => e.currentTarget.style.opacity = 1}
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  )
}
