import { useRef, useEffect } from 'react';
import AnalysisLoadingBar from '../AnalysisPanel/LoadingBar';

export default function NLCommandPanel({ query, command, loading, error, onAccept, onCancel, onRetry }) {
  const acceptRef = useRef(null);

  // Auto-focus Accept button when command arrives so Enter works immediately
  useEffect(() => {
    if (command && !loading && !error) {
      acceptRef.current?.focus();
    }
  }, [command, loading, error]);

  // Global keyboard: Enter = accept, Esc = cancel while panel is mounted
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && command && !loading && !error) {
        e.preventDefault();
        onAccept(command);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [command, loading, error, onAccept, onCancel]);

  return (
    <div style={{
      borderTop: '1px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 25%, transparent)',
      borderLeft: '5px solid var(--accent, var(--tab-accent))',
      background: 'color-mix(in srgb, var(--accent, var(--tab-accent)) 8%, var(--bg-surface))',
      animation: 'nlPanelIn 0.18s ease-out',
    }}>
      <style>{`
        @keyframes nlPanelIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
.nl-accept-btn:hover { opacity: 0.88; }
        .nl-accept-btn:focus-visible {
          outline: 2px solid var(--accent, var(--tab-accent));
          outline-offset: 2px;
        }
        .nl-cancel-btn:hover { border-color: var(--text-muted) !important; color: var(--text-secondary) !important; }
        .nl-cancel-btn:focus-visible {
          outline: 2px solid var(--border);
          outline-offset: 2px;
        }
      `}</style>

      {/* Header — hidden while loading; AnalysisLoadingBar takes its place */}
      {!loading && <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px 0',
      }}>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--accent, var(--tab-accent))',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.8,
        }}>
          <svg width="12" height="12" viewBox="0 0 512 512" style={{ flexShrink: 0, overflow: 'visible' }}>
            <defs>
              <clipPath id="np-cube-clip">
                <path d="M 185,96 L 414,96 Q 434,96 434,116 L 434,334 Q 434,354 416.9,364.4 L 348.1,406.6 Q 331,417 311,417 L 98,417 Q 78,417 78,397 L 78,179 Q 78,159 95.1,148.6 L 177.6,98.1 Q 181,96 185,96 Z"/>
              </clipPath>
            </defs>
            <g clipPath="url(#np-cube-clip)">
              <polygon points="78,159 181,96 434,96 331,159" fill="currentColor" opacity="0.95"/>
              <polygon points="331,159 434,96 434,354 331,417" fill="currentColor" opacity="0.55"/>
              <polygon points="78,159 331,159 331,417 78,417" fill="currentColor" opacity="0.15"/>
              <polyline points="126,247 172,288 126,330" fill="none" stroke="currentColor" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
              <rect x="186" y="310" width="83" height="16" rx="4" fill="currentColor" opacity="0.7"/>
            </g>
          </svg>
          {loading ? 'Translating…' : error ? 'Translation Failed' : 'Command Ready'}
        </span>
        <button
          onClick={onCancel}
          aria-label="Cancel"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 2px',
            opacity: 0.5,
            transition: 'opacity 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
        >
          ×
        </button>
      </div>}

      {/* Query — prominent */}
      {!loading && (
        <div style={{
          padding: '6px 14px 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary)',
          lineHeight: 1.5,
        }}>
          {query}
        </div>
      )}

      {/* State body */}
      <div style={{ padding: loading ? '0' : '10px 14px 0' }}>
        {loading && (
          <AnalysisLoadingBar message="Translating…" />
        )}

        {!loading && command && !error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 30%, var(--border))',
            borderRadius: 6,
            padding: '8px 12px',
          }}>
            <span style={{
              color: 'var(--accent, var(--tab-accent))',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              opacity: 0.6,
              flexShrink: 0,
            }}>❯</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--text-primary)',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}>
              {command}
            </span>
          </div>
        )}

        {!loading && error && (
          <div style={{
            color: '#e57373',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Actions — keyboard hint style, no chrome */}
      {!loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 14px 10px',
        }}>
          {command && !error && (
            <button
              ref={acceptRef}
              onClick={() => onAccept(command)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'none',
                border: 'none',
                padding: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--accent, var(--tab-accent))',
                cursor: 'pointer',
                opacity: 0.9,
                transition: 'opacity 0.12s',
                outline: 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.9'}
              onFocus={e => e.currentTarget.style.opacity = '1'}
              onBlur={e => e.currentTarget.style.opacity = '0.9'}
            >
              <Kbd accent>↵</Kbd>
              accept
            </button>
          )}
          {error && (
            <button
              onClick={onRetry}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'none',
                border: 'none',
                padding: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                opacity: 0.7,
                transition: 'opacity 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
            >
              ↺ retry
            </button>
          )}
          <button
            onClick={onCancel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'none',
              border: 'none',
              padding: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              opacity: 0.75,
              transition: 'opacity 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.75'}
          >
            <Kbd>Esc</Kbd>
            cancel
          </button>
        </div>
      )}
    </div>
  );
}

function Kbd({ children, accent }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 600,
      lineHeight: 1,
      padding: '2px 5px',
      borderRadius: 3,
      background: accent
        ? 'color-mix(in srgb, var(--accent, var(--tab-accent)) 20%, transparent)'
        : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
      border: accent
        ? '1px solid color-mix(in srgb, var(--accent, var(--tab-accent)) 40%, transparent)'
        : '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
      color: 'inherit',
      minWidth: 16,
    }}>
      {children}
    </span>
  );
}
