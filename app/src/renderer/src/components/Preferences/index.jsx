import { useEffect, useState } from 'react'
import AppearanceSection from './AppearanceSection'
import AISection from './AISection'
import PromptSection from './PromptSection'

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'prompt',     label: 'Prompt' },
  { id: 'ai',         label: 'AI' },
]

export default function PreferencesModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('appearance')

  useEffect(() => {
    if (!isOpen) return
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
          width: '560px',
          height: '680px',
          maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 80px)',
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
          }}>
            Preferences
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '18px',
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close preferences"
          >
            ✕
          </button>
        </div>

        {/* Tab strip */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          padding: '0 20px',
          flexShrink: 0,
          gap: 4,
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 12px',
                fontSize: '13px',
                fontFamily: 'var(--font-ui)',
                fontWeight: 500,
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border) transparent',
        }}>
          {activeTab === 'appearance' && <AppearanceSection />}
          {activeTab === 'prompt'     && <PromptSection />}
          {activeTab === 'ai'         && <AISection />}
        </div>
      </div>
    </>
  )
}
