import { useState, useEffect, useRef } from 'react'
import logoUrl from '../../assets/jebi-logo.svg'
import { useUpdateStatus, checkForUpdates } from '../../hooks/useUpdateStatus'

const styles = `
  @keyframes jebi-spin { to { transform: rotate(360deg); } }
  .jebi-check-btn:hover:not(:disabled) { background: var(--bg-surface) !important; }
  .jebi-update-btn:hover:not(:disabled) { opacity: 0.85 !important; }
`

export default function AboutSection() {
  const year = new Date().getFullYear()
  const updateStatus = useUpdateStatus()
  const [checked, setChecked] = useState(updateStatus.available)
  const [installing, setInstalling] = useState(false)
  const [logs, setLogs] = useState([])
  const [installDone, setInstallDone] = useState(null) // null | { success }
  const logRef = useRef(null)

  useEffect(() => {
    const offLog = window.electron.update.onInstallLog((line) => {
      setLogs(prev => [...prev, line])
    })
    const offDone = window.electron.update.onInstallDone((result) => {
      setInstalling(false)
      setInstallDone(result)
    })
    return () => { offLog?.(); offDone?.() }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function handleCheck() {
    setChecked(true)
    await checkForUpdates()
  }

  function handleInstall() {
    setInstalling(true)
    setLogs([])
    setInstallDone(null)
    window.electron.update.install()
  }

  const showResult = checked && !updateStatus.checking

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '24px 4px' }}>
      <style>{styles}</style>

      {/* Logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <img src={logoUrl} style={{ width: 72, height: 72, flexShrink: 0 }} alt="jebi" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
            {__APP_NAME__}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
            Version {__APP_VERSION__}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)', opacity: 0.4, marginTop: 1 }}>
            © {year} All Rights Reserved.
          </div>
        </div>
      </div>

      {/* Update section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          className="jebi-check-btn"
          onClick={handleCheck}
          disabled={updateStatus.checking || installing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
            fontSize: 12, fontWeight: 500,
            cursor: (updateStatus.checking || installing) ? 'default' : 'pointer',
            opacity: (updateStatus.checking || installing) ? 0.6 : 1,
            alignSelf: 'flex-start', transition: 'background 0.15s',
          }}
        >
          {updateStatus.checking
            ? <span style={{ width: 11, height: 11, border: '1.5px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'jebi-spin 0.7s linear infinite' }} />
            : <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span>
          }
          {updateStatus.checking ? 'Checking…' : 'Check for updates'}
        </button>

        {showResult && !updateStatus.error && !updateStatus.available && !installing && !installDone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            You're up to date.
          </div>
        )}

        {showResult && updateStatus.error && (
          <p style={{ margin: 0, fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
            Update check failed. Try again.
          </p>
        )}

        {showResult && !updateStatus.error && updateStatus.available && !installing && !installDone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)' }}>
                  v{updateStatus.latestVersion} is available
                </span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
                  (current: v{updateStatus.currentVersion})
                </span>
              </div>
              <button
                className="jebi-update-btn"
                onClick={handleInstall}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 6,
                  border: 'none', background: 'var(--accent)',
                  color: '#fff', fontFamily: 'var(--font-ui)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'opacity 0.15s', flexShrink: 0,
                }}
              >
                ↑ Update now
              </button>
            </div>
          </div>
        )}

        {/* Manual install instructions — jebi wasn't installed via Homebrew */}
        {installDone?.success && installDone.manual && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              jebi wasn't installed via Homebrew on this Mac, so it can't be upgraded with <code style={{ fontFamily: 'var(--font-mono)' }}>brew upgrade</code>. Install the update manually instead:
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <li>Download the latest version below</li>
              <li>Open the downloaded file and drag jebi into Applications, replacing the old copy</li>
              <li>Quit and relaunch jebi</li>
            </ol>
            <button
              onClick={() => window.electron.openExternal(installDone.downloadUrl)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6,
                border: 'none', background: 'var(--accent)',
                color: '#fff', fontFamily: 'var(--font-ui)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              ↓ Download latest version
            </button>
          </div>
        )}

        {/* Install log — Homebrew path only */}
        {(installing || (installDone && !installDone.manual)) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              ref={logRef}
              style={{
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '10px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text-secondary)', lineHeight: 1.6,
                maxHeight: 160, overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}
            >
              {logs.length === 0 && installing && <span style={{ opacity: 0.5 }}>Running brew upgrade --cask jebi…</span>}
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>

            {installing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, border: '1.5px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'jebi-spin 0.7s linear infinite' }} />
                Installing…
              </div>
            )}

            {installDone?.success && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontFamily: 'var(--font-ui)', color: '#22c55e' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                Update installed. Quit and relaunch jebi to apply.
              </div>
            )}

            {installDone && !installDone.success && (
              <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--error)' }}>
                Update failed. Check the log above or try running <code style={{ fontFamily: 'var(--font-mono)' }}>brew upgrade --cask jebi</code> manually.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
