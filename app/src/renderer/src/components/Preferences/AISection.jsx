import { useState, useEffect, useCallback } from 'react'
import { usePreferences } from '../../hooks/usePreferences'
import { Toggle, ToggleRow } from './Toggle'
import ModelCard from './ModelCard'

export default function AISection() {
  const { prefs, setAiExplainErrors, setAiDirectoryContext, setAiCommandSuggestions, setAiOutputAnalysis } = usePreferences()
  const [models, setModels] = useState([])
  const [downloadProgress, setDownloadProgress] = useState({})
  const [saving, setSaving] = useState(false)
  const [aiEnabled, setAiEnabledState] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [category, setCategory] = useState('balanced')

  useEffect(() => {
    window.electron.ai.getConfig().then(cfg => {
      if (cfg) setAiEnabledState(cfg.enabled !== false)
      const activeModelPath = cfg?.provider !== 'ollama' ? (cfg?.model ?? null) : null
      return window.electron.ai.listModels(activeModelPath)
    }).then(setModels).catch(console.error)
  }, [])

  useEffect(() => {
    const unsubProgress = window.electron.ai.onProgress(({ modelId, bytesReceived, totalBytes, speedBps }) => {
      setDownloadProgress(prev => ({ ...prev, [modelId]: { bytesReceived, totalBytes, speedBps } }))
    })
    const unsubComplete = window.electron.ai.onComplete(({ modelId, path }) => {
      setDownloadProgress(prev => { const n = { ...prev }; delete n[modelId]; return n })
      setModels(prev => prev.map(m => m.id === modelId ? { ...m, downloaded: true, path } : m))
    })
    const unsubError = window.electron.ai.onError(({ modelId }) => {
      setDownloadProgress(prev => { const n = { ...prev }; delete n[modelId]; return n })
    })
    return () => { unsubProgress(); unsubComplete(); unsubError() }
  }, [])

  const handleDownload = useCallback((modelId) => {
    window.electron.ai.startDownload(modelId)
  }, [])

  const handleCancel = useCallback((modelId) => {
    window.electron.ai.cancelDownload(modelId)
    setDownloadProgress(prev => { const n = { ...prev }; delete n[modelId]; return n })
  }, [])

  const handleDelete = useCallback(async (modelId) => {
    await window.electron.ai.deleteModel(modelId)
    setModels(prev => prev.map(m => m.id === modelId ? { ...m, downloaded: false } : m))
  }, [])

  const handleActivate = useCallback(async (model) => {
    setSaving(true)
    await window.electron.ai.saveConfig({
      provider: 'llama-server', model: model.path,
      endpointURL: 'http://localhost:11434', enabled: aiEnabled,
    })
    setModels(prev => prev.map(m => ({ ...m, active: m.id === model.id })))
    setSaving(false)
  }, [aiEnabled])

  const handleToggleAi = useCallback(async (val) => {
    setAiEnabledState(val)
    const cfg = await window.electron.ai.getConfig()
    await window.electron.ai.saveConfig({ ...(cfg ?? {}), enabled: val })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Global AI toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0 16px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-ui)', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
            Enable AI
          </div>
          <div style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 2 }}>
            AI-powered suggestions, error explanations, and /ask chat.
          </div>
        </div>
        <Toggle checked={aiEnabled} onChange={handleToggleAi} />
      </div>

      {/* Model list — dimmed when AI is off */}
      <div style={{ opacity: aiEnabled ? 1 : 0.4, pointerEvents: aiEnabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
        {models.length === 0 && (
          <div style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)', padding: '8px 0', fontFamily: 'var(--font-ui)' }}>
            Loading…
          </div>
        )}

        {/* Category tab switch */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[
            { id: 'fast', label: 'Fast' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'smart', label: 'Smart' },
          ].map(tab => {
            const active = category === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setCategory(tab.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                  background: active ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'none',
                  color: active ? 'var(--brand)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--font-size-ui)',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'border-color 150ms ease, background 150ms ease, color 150ms ease',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 4 }}>
          {models.filter(m => (m.category ?? 'balanced') === category).map((model, i, arr) => (
            <ModelCard
              key={model.id}
              model={model}
              isActive={!!model.active}
              isLast={i === arr.length - 1}
              onActivate={() => handleActivate(model)}
              onDownload={() => handleDownload(model.id)}
              onCancel={() => handleCancel(model.id)}
              onDelete={() => handleDelete(model.id)}
              downloadProgress={downloadProgress[model.id] ?? null}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', marginTop: 8, lineHeight: 1.5, opacity: 0.7 }}>
          Smaller models respond faster; larger models give richer answers. Switch anytime to find your balance.
        </div>
        {saving && (
          <div style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)', marginTop: 8, fontFamily: 'var(--font-ui)' }}>
            Applying… reconnecting shortly
          </div>
        )}

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
            fontSize: 'var(--font-size-ui)', padding: '12px 0 4px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 10, transform: showAdvanced ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
          Advanced
        </button>

        {showAdvanced && (
          <div style={{ marginTop: 4 }}>
            <ToggleRow
              label="Command suggestions"
              description="Show AI-suggested next commands after each run."
              checked={prefs.aiCommandSuggestions ?? true}
              onChange={setAiCommandSuggestions}
            />
            <ToggleRow
              label="Explain command errors"
              description="Show an AI explanation banner when a command exits with an error."
              checked={prefs.aiExplainErrors}
              onChange={setAiExplainErrors}
            />
            <ToggleRow
              label="Directory context"
              description="Show an AI summary when switching into a new directory."
              checked={prefs.aiDirectoryContext}
              onChange={setAiDirectoryContext}
            />
            <ToggleRow
              label="Output analysis"
              description="Automatically show an AI panel with extracted errors, metrics and insights after large command output."
              checked={prefs.aiOutputAnalysis ?? false}
              onChange={setAiOutputAnalysis}
            />
          </div>
        )}
      </div>
    </div>
  )
}
