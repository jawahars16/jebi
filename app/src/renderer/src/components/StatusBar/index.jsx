import { useAIStatus } from '../../hooks/useAIStatus'
import { useStatusMessage } from '../../hooks/useStatusMessage'
import { useUpdateStatus } from '../../hooks/useUpdateStatus'

const updateArrowStyle = `
  @keyframes jebi-arrow-bounce {
    0%, 100% { transform: translateY(1px); }
    50%       { transform: translateY(-2px); }
  }
`

export default function StatusBar({ onOpenAISettings, onOpenUpdate }) {
  const aiStatus = useAIStatus()
  const message = useStatusMessage()
  const updateStatus = useUpdateStatus()
  const version = updateStatus.currentVersion || __APP_VERSION__

  if (aiStatus.status === 'unknown' && !message && !version) return null

  const available = aiStatus.status === 'available'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '3px 10px',
      background: 'var(--bg-base)',
      borderTop: '1px solid var(--border)',
      fontSize: '11px',
      gap: 6,
      minHeight: 24,
    }}>
      <style>{updateArrowStyle}</style>

      {/* Version chip — left */}
      {updateStatus.available ? (
        <button
          onClick={onOpenUpdate}
          title={`v${updateStatus.latestVersion} available — click to update`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', flexShrink: 0, userSelect: 'none',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-primary)', opacity: 0.9 }}>
            v{version}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%',
            background: '#f59e0b',
            fontSize: 9, fontWeight: 700, color: '#000',
            lineHeight: 1, flexShrink: 0, overflow: 'hidden',
          }}>
            <span style={{ display: 'inline-block', animation: 'jebi-arrow-bounce 1.2s ease-in-out infinite' }}>↑</span>
          </span>
        </button>
      ) : (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px',
          color: 'var(--text-muted)', opacity: 0.6,
          flexShrink: 0, userSelect: 'none',
        }}>
          v{version}
        </span>
      )}

      {/* Transient message — center */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        opacity: message ? 0.8 : 0,
        transition: 'opacity 0.2s ease',
        whiteSpace: 'nowrap',
      }}>
        {message ?? ''}
      </span>

      {/* AI chip — right */}
      {aiStatus.status !== 'unknown' && (
        <button
          onClick={available ? undefined : () => onOpenAISettings?.()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            cursor: available ? 'default' : 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            color: available ? 'var(--text-muted)' : '#f59e0b',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            opacity: available ? 0.7 : 1,
            flexShrink: 0,
          }}
          title={available ? `AI: ${aiStatus.provider}` : 'AI features need setup — click to configure'}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: available ? '#22c55e' : '#f59e0b',
            display: 'inline-block',
            flexShrink: 0,
          }} />
          {available ? 'AI' : 'AI: setup'}
        </button>
      )}
    </div>
  )
}
