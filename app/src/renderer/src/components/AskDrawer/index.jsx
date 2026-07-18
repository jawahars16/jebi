import { useState, useEffect, useRef } from 'react'
import { useAIStatus } from '../../hooks/useAIStatus'
import { useGlobalWire } from '../../hooks/useGlobalWire'

const CONTEXT_WINDOW = 6 // last 6 messages (3 pairs) sent to backend

const FALLBACK_SUGGESTIONS = [
  'What does this error output mean?',
  'Suggest a command to check what\'s running here',
  'What\'s in my current directory?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-ui)',
        color: 'var(--text-muted)',
        opacity: 0.7,
        marginBottom: 4,
        paddingLeft: isUser ? 0 : 2,
        paddingRight: isUser ? 2 : 0,
      }}>
        {isUser ? 'You' : 'jebi'}
      </span>
      <div style={{
        maxWidth: '92%',
        padding: '7px 11px',
        borderRadius: isUser ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
        background: isUser
          ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
          : msg.error
            ? 'color-mix(in srgb, #f87171 10%, transparent)'
            : 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
        border: isUser
          ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
          : msg.error
            ? '1px solid color-mix(in srgb, #f87171 25%, transparent)'
            : '1px solid color-mix(in srgb, var(--text-muted) 15%, transparent)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-mono)',
        color: msg.error ? '#f87171' : 'var(--text-primary)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content || (msg.streaming ? '' : '…')}
        {msg.streaming && (
          <span style={{ display: 'inline-block', width: 8, height: 13, background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'ask-cursor-blink 1s step-end infinite' }} />
        )}
      </div>
    </div>
  )
}

function SuggestionChip({ text, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        marginBottom: 6,
        borderRadius: 6,
        border: '1px solid color-mix(in srgb, var(--text-muted) 20%, transparent)',
        background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-ui)',
        cursor: 'pointer',
      }}
    >
      {text}
    </button>
  )
}

export default function AskDrawer({ open, sessions, activeSessionId, onClose }) {
  const aiStatus = useAIStatus()
  const aiAvailable = aiStatus.status === 'available'
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState(FALLBACK_SUGGESTIONS)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const inputFocusedRef = useRef(false)
  const drawerRef = useRef(null)

  const { sendAskGlobal, sendAskSuggest, connected } = useGlobalWire({
    onChunk: (token) => {
      setMessages((prev) => {
        const msgs = [...prev]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          msgs[msgs.length - 1] = { ...last, content: last.content + token }
        }
        return msgs
      })
    },
    onDone: () => {
      setMessages((prev) => {
        const msgs = [...prev]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          msgs[msgs.length - 1] = { ...last, streaming: false }
        }
        return msgs
      })
    },
    onError: (err) => {
      setMessages((prev) => {
        const msgs = [...prev]
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          msgs[msgs.length - 1] = { role: 'assistant', content: err || 'AI not available', error: true }
        } else {
          msgs.push({ role: 'assistant', content: err || 'AI not available', error: true })
        }
        return msgs
      })
    },
    onSuggestions: (prompts) => {
      if (Array.isArray(prompts) && prompts.length === 3) setSuggestions(prompts)
    },
  })

  const isStreaming = messages.some((m) => m.streaming)

  // Fetch fresh suggestions whenever the drawer opens on an empty conversation.
  useEffect(() => {
    if (open && messages.length === 0) {
      setSuggestions(FALLBACK_SUGGESTIONS)
      sendAskSuggest(sessions)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (inputFocusedRef.current && document.activeElement !== inputRef.current) {
      inputRef.current?.focus()
    }
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Claim focus at several points in time — other panes schedule their own
  // refocus via setTimeout(0) when a slash command runs, which can otherwise
  // win the race and steal focus back from the drawer right after it opens.
  useEffect(() => {
    if (!open) return
    const focus = () => inputRef.current?.focus()
    focus()
    const raf = requestAnimationFrame(focus)
    const t = setTimeout(focus, 50)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [open])

  useEffect(() => {
    const onKey = (e) => {
      if (!open) return
      if (e.key === 'Escape' && !isStreaming) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !isStreaming) {
        e.preventDefault()
        e.stopPropagation()
        setMessages([])
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, isStreaming, onClose])

  // Clicking anywhere outside the drawer closes it.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [open, onClose])

  const sendQuery = (q) => {
    if (!q || isStreaming) return
    const completed = messages.filter((m) => !m.streaming && !m.error)
    const history = completed
      .slice(-CONTEXT_WINDOW)
      .map(({ role, content }) => ({ role, content }))
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: q },
      { role: 'assistant', content: '', streaming: true },
    ])
    sendAskGlobal(history, q, sessions)
  }

  const handleSend = () => {
    const q = input.trim()
    if (!q) return
    setInput('')
    sendQuery(q)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <style>{`
        @keyframes ask-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes ask-drawer-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div ref={drawerRef} style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        right: 0,
        width: 380,
        minWidth: 320,
        display: open ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
        zIndex: 200,
        animation: open ? 'ask-drawer-slide-in 180ms ease-out' : 'none',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 12px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-mono)', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            Ask AI
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-ui)',
            color: 'var(--text-muted)',
            border: '1px solid color-mix(in srgb, var(--text-muted) 30%, transparent)',
            borderRadius: 10,
            padding: '1px 7px',
          }}>
            ⌀ read-only
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'relative',
              zIndex: 1,
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 14,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>

        {/* Messages / unavailable state */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px' }}>
          {!connected ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              textAlign: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-mono)', color: 'var(--text-muted)' }}>
                Reconnecting…
              </span>
            </div>
          ) : !aiAvailable ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 22 }}>✦</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                No AI model available
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-ui)', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 260 }}>
                Download a model in{' '}
                <span style={{ color: 'var(--accent)' }}>Preferences → AI</span>
                {' '}to enable AI features.
              </span>
            </div>
          ) : (
            <>
              {messages.length === 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-mono)',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                    marginBottom: 14,
                  }}>
                    Ask about any of your open sessions — directories, commands, or errors.
                    Read-only: it never reads or writes files, and never executes anything.
                  </div>
                  {suggestions.map((s, i) => (
                    <SuggestionChip key={i} text={s} onClick={() => sendQuery(s)} />
                  ))}
                </div>
              )}
              {messages.map((msg, i) => (
                <Message key={i} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Clear conversation — reserves its row height even when hidden, so
            toggling it never shifts the input box's position. */}
        {connected && aiAvailable && (
          <div style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '6px 12px 0',
            visibility: messages.length > 0 ? 'visible' : 'hidden',
          }}>
            <button
              type="button"
              onClick={() => setMessages([])}
              disabled={isStreaming}
              title="Clear conversation (⌘K)"
              style={{
                background: 'var(--accent)',
                border: 'none',
                padding: '2px 10px',
                borderRadius: 4,
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-ui)',
                marginBottom: 8,
                marginRight: -4,
                cursor: isStreaming ? 'default' : 'pointer',
                opacity: isStreaming ? 0.4 : 0.8,
              }}
            >
              clear ⌘K
            </button>
          </div>
        )}

        {/* Input */}
        {connected && aiAvailable && (
        <div style={{
          padding: '8px 12px',
          flexShrink: 0,
          borderTop: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { inputFocusedRef.current = true }}
            onBlur={() => { inputFocusedRef.current = false }}
            placeholder="Ask a question… (Enter to send)"
            rows={3}
            disabled={isStreaming}
            style={{
              flex: 1,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-mono)',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              padding: 0,
              overflowY: 'hidden',
            }}
            onInput={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: 'none',
              background: input.trim() && !isStreaming ? 'var(--accent)' : 'color-mix(in srgb, var(--text-muted) 20%, transparent)',
              color: input.trim() && !isStreaming ? '#fff' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-ui)',
              cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            {isStreaming ? '…' : '↵'}
          </button>
        </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '4px 12px',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-ui)',
          opacity: 0.6,
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid color-mix(in srgb, var(--text-muted) 20%, transparent)',
          background: 'color-mix(in srgb, var(--text-muted) 5%, transparent)',
        }}>
          <span>↵ send · Esc close</span>
          <span>AI · may be inaccurate</span>
        </div>
      </div>
    </>
  )
}
