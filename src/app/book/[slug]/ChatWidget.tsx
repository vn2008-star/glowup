'use client'

import { useState, useRef, useEffect } from 'react'
import styles from './ChatWidget.module.css'

interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  time: string
}

const now = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function ChatWidget({ slug, businessName, greeting }: { slug: string; businessName: string; greeting?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 250)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Show greeting on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'greeting',
        role: 'bot',
        content: greeting || `Hi there! Welcome to ${businessName}. How can I help you today?`,
        time: now(),
      }])
    }
  }, [isOpen, messages.length, businessName, greeting])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: input.trim(), time: now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content, slug, conversation_id: conversationId }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages(prev => [...prev, { id: `bot-${Date.now()}`, role: 'bot', content: data.response, time: now() }])
        // Store conversation ID for context (server creates one on first message)
        if (data.conversation_id) setConversationId(data.conversation_id)
      } else {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'bot',
          content: "Sorry, I'm having trouble right now. Please try again or call us directly.",
          time: now(),
        }])
      }
    } catch {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'bot', content: 'Connection issue. Please try again.', time: now() }])
    }

    setLoading(false)
  }

  const suggestions = [
    'What are your hours?',
    'What services do you offer?',
    "I'd like to book an appointment",
    'Do you accept walk-ins?',
  ]

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Chat with us'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        )}
      </button>

      {isOpen && (
        <div className={styles.panel} role="dialog" aria-label={`Chat with ${businessName}`}>
          <div className={styles.header}>
            <div className={styles.avatar} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
            </div>
            <div>
              <div className={styles.headerName}>{businessName}</div>
              <div className={styles.headerStatus}><span className={styles.dot} aria-hidden="true" />AI receptionist · Online</div>
            </div>
          </div>

          <div className={styles.messages} aria-live="polite">
            {messages.map(msg => (
              <div key={msg.id} className={`${styles.row} ${msg.role === 'user' ? styles.rowUser : ''}`}>
                <div className={styles.bubble}>{msg.content}</div>
                <span className={styles.time}>{msg.time}</span>
              </div>
            ))}

            {loading && (
              <div className={styles.row}>
                <div className={`${styles.bubble} ${styles.typing}`} aria-label="Typing"><span>●</span><span>●</span><span>●</span></div>
              </div>
            )}

            {messages.length <= 1 && !loading && (
              <div className={styles.chips}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.chip}
                    onClick={() => { setInput(s); setTimeout(() => formRef.current?.requestSubmit(), 50) }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form ref={formRef} onSubmit={handleSend} className={styles.form}>
            <input
              ref={inputRef}
              type="text"
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything…"
              disabled={loading}
              aria-label="Your message"
            />
            <button type="submit" className={styles.send} disabled={!input.trim() || loading} aria-label="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </form>

          <div className={styles.credit}>Powered by GlowUp AI</div>
        </div>
      )}
    </>
  )
}
