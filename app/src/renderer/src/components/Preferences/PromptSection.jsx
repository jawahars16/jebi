import { usePreferences } from '../../hooks/usePreferences'
import { SEGMENT_DEFINITIONS } from '../../preferences/segments'

const sectionLabel = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '12px',
  fontFamily: 'var(--font-ui)',
}

const sectionDescription = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-ui)',
  marginBottom: '10px',
  lineHeight: 1.5,
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        border: 'none',
        background: disabled
          ? 'var(--border)'
          : checked
          ? 'var(--accent)'
          : 'var(--bg-elevated)',
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
        outline: 'none',
        boxShadow: checked && !disabled ? '0 0 0 1px var(--accent)' : '0 0 0 1px var(--border)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: disabled ? 'var(--text-muted)' : 'white',
          transition: 'left 0.15s',
        }}
      />
    </button>
  )
}

function LockIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="var(--text-muted)" style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M11.5 6V4.5a3.5 3.5 0 1 0-7 0V6H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1.5zM5.5 4.5a2.5 2.5 0 0 1 5 0V6h-5V4.5zM8 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
  )
}

function SegmentRow({ segment, enabled, onToggle }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontFamily: 'var(--font-ui)', color: segment.required ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 500 }}>
          {segment.name}
        </div>
        {segment.contextual && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 2 }}>
            Shows automatically when detected
          </div>
        )}
      </div>
      {segment.required ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <LockIcon />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Always on</span>
        </div>
      ) : (
        <ToggleSwitch checked={enabled} onChange={onToggle} />
      )}
    </div>
  )
}

const REQUIRED = SEGMENT_DEFINITIONS.filter(s => s.required)
const CONTEXTUAL = SEGMENT_DEFINITIONS.filter(s => !s.required && s.contextual)
const OPTIONAL = SEGMENT_DEFINITIONS.filter(s => !s.required && !s.contextual)

export default function PromptSection() {
  const { prefs, setSegmentEnabled } = usePreferences()
  const segs = prefs.promptSegments ?? {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      <div>
        <div style={sectionLabel}>Always Visible</div>
        <div style={sectionDescription}>These segments are always shown and cannot be removed.</div>
        {REQUIRED.map(s => (
          <SegmentRow key={s.id} segment={s} enabled={true} onToggle={() => {}} />
        ))}
        {/* Exit indicator is implicit — mention it */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontFamily: 'var(--font-ui)', color: 'var(--text-muted)', fontWeight: 500 }}>Exit indicator (❯)</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <LockIcon />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>Always on</span>
          </div>
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Context-Aware</div>
        <div style={sectionDescription}>These segments appear automatically when a matching project is detected in the current directory.</div>
        {CONTEXTUAL.map(s => (
          <SegmentRow
            key={s.id}
            segment={s}
            enabled={segs[s.id] ?? s.defaultEnabled}
            onToggle={(v) => setSegmentEnabled(s.id, v)}
          />
        ))}
      </div>

      <div>
        <div style={sectionLabel}>Optional</div>
        <div style={sectionDescription}>These segments are always visible when enabled, regardless of context.</div>
        {OPTIONAL.map(s => (
          <SegmentRow
            key={s.id}
            segment={s}
            enabled={segs[s.id] ?? s.defaultEnabled}
            onToggle={(v) => setSegmentEnabled(s.id, v)}
          />
        ))}
      </div>

    </div>
  )
}
