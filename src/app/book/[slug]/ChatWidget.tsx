'use client'

import { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  time: string
}

export default function ChatWidget({ slug, businessName }: { slug: string; businessName: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // Show greeting on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'greeting',
        role: 'bot',
        content: `Hi there! 👋 Welcome to ${businessName}. How can I help you today?`,
        time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      }])
    }
  }, [isOpen, messages.length, businessName])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          slug,
          conversation_id: conversationId,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: 'bot',
          content: data.response,
          time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        }
        setMessages(prev => [...prev, botMsg])

        // Store conversation ID for context
        if (data.message?.conversation_id) {
          setConversationId(data.message.conversation_id)
        }
      } else {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'bot',
          content: "Sorry, I'm having trouble right now. Please try again or call us directly!",
          time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'bot',
        content: "Connection issue. Please try again!",
        time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      }])
    }

    setLoading(false)
  }

  const suggestions = [
    "What are your hours?",
    "What services do you offer?",
    "I'd like to book an appointment",
    "Do you accept walk-ins?",
  ]

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c37eda, #9b59b6)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(195, 126, 218, 0.4)',
          zIndex: 9999,
          transition: 'all 0.3s ease',
          transform: isOpen ? 'scale(0.9) rotate(90deg)' : 'scale(1)',
        }}
        aria-label="Chat with us"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          right: '24px',
          width: '380px',
          maxWidth: 'calc(100vw - 48px)',
          height: '520px',
          maxHeight: 'calc(100vh - 140px)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 8px 48px rgba(0,0,0,0.3)',
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          animation: 'chatSlideUp 0.3s ease-out',
          background: '#1a1525',
          border: '1px solid rgba(195, 126, 218, 0.2)',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(195, 126, 218, 0.15), rgba(155, 89, 182, 0.1))',
            borderBottom: '1px solid rgba(195, 126, 218, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #c37eda, #9b59b6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}>🤖</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>{businessName}</div>
              <div style={{ color: 'rgba(195, 126, 218, 0.8)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                AI Receptionist · Online
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #c37eda, #9b59b6)'
                    : 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  border: msg.role === 'bot' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', padding: '0 4px' }}>
                  {msg.role === 'bot' ? '🤖 ' : ''}{msg.time}
                </span>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(195, 126, 218, 0.8)',
                  fontSize: '14px',
                  display: 'flex',
                  gap: '4px',
                }}>
                  <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0s' }}>●</span>
                  <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0.2s' }}>●</span>
                  <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0.4s' }}>●</span>
                </div>
              </div>
            )}

            {/* Suggestion chips when no user messages yet */}
            {messages.length <= 1 && !loading && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); setTimeout(() => { const form = document.getElementById('chat-form') as HTMLFormElement; form?.requestSubmit(); }, 50) }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      background: 'rgba(195, 126, 218, 0.1)',
                      border: '1px solid rgba(195, 126, 218, 0.25)',
                      color: 'rgba(195, 126, 218, 0.9)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(195, 126, 218, 0.2)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(195, 126, 218, 0.1)')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form id="chat-form" onSubmit={handleSend} style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            gap: '8px',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                background: input.trim() ? 'linear-gradient(135deg, #c37eda, #9b59b6)' : 'rgba(255,255,255,0.05)',
                border: 'none',
                color: '#fff',
                cursor: input.trim() ? 'pointer' : 'default',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              Send
            </button>
          </form>

          {/* Powered by */}
          <div style={{
            padding: '6px',
            textAlign: 'center',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.3)',
          }}>
            Powered by GlowUp AI
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx global>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatDot {
          0%, 20% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </>
  )
}
