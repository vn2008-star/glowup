'use client'

import { renderTemplate, renderSmsTemplate, TEMPLATES, SMS_TEMPLATES, FOLLOW_UP_SEQUENCE, OUTREACH_MAILING_ADDRESS, OUTREACH_SENDER_NAME, TemplateId, SmsTemplateId } from '@/lib/outreach-templates'
import { useEffect } from 'react'

export default function OutreachPreview() {
  const templates: TemplateId[] = ['intro', ...FOLLOW_UP_SEQUENCE.map(f => f.templateId)]
  const sampleSalon = 'Luxe Nails & Spa'
  const sampleOwner = 'Sarah'
  const sampleLink = 'https://joinglowup.org/auth/signup?cref=CR-DEMO01'
  const sampleSender = OUTREACH_SENDER_NAME
  const sampleUnsub = 'https://joinglowup.org/api/outreach/unsubscribe?e=sarah%40example.com&s=demo'

  // Scroll to anchor on load
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a14',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#fff',
          textAlign: 'center',
          marginBottom: 8,
        }}>
          ✨ GlowUp Email Templates
        </h1>
        <p style={{
          textAlign: 'center',
          color: '#888',
          fontSize: 14,
          marginBottom: 16,
        }}>
          Sample salon: <strong style={{ color: '#e8a87c' }}>{sampleSalon}</strong> • Owner: <strong style={{ color: '#d4a0e8' }}>{sampleOwner}</strong>
        </p>

        {/* Quick nav */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 40,
          flexWrap: 'wrap',
        }}>
          {templates.map((id) => {
            const t = TEMPLATES[id]
            return (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  background: '#1a1a2e',
                  border: '1px solid #2a2a3e',
                  color: '#d4a0e8',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.2s',
                }}
              >
                {t.step}. {t.name}
              </a>
            )
          })}
        </div>

        {/* Templates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {templates.map((id) => {
            const t = TEMPLATES[id]
            const html = renderTemplate(id, sampleSalon, sampleOwner, sampleLink, sampleSender, sampleUnsub)
            return (
              <div
                key={id}
                id={id}
                style={{
                  background: '#12121f',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid #2a2a3e',
                  scrollMarginTop: '20px',
                }}
              >
                {/* Header */}
                <div style={{
                  padding: '16px 20px',
                  background: '#1a1a2e',
                  borderBottom: '1px solid #2a2a3e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#d4a0e8' }}>Email {t.step}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{t.description}</div>
                  </div>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: 'rgba(195, 126, 218, 0.15)',
                    color: '#d4a0e8',
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    Template ID: {id}
                  </span>
                </div>

                {/* Subject line */}
                <div style={{ padding: '12px 20px', background: '#161625', borderBottom: '1px solid #2a2a3e' }}>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>📧 Subject Line:</div>
                  <div style={{ fontSize: 14, color: '#e8a87c', fontWeight: 600 }}>{t.subjectFn(sampleSalon)}</div>
                </div>

                {/* Rendered email — in a frame so its own white page and
                    styles show as a mail app would, not inherit this dark page */}
                <iframe
                  title={`${t.name} preview`}
                  srcDoc={html}
                  sandbox=""
                  style={{ width: '100%', height: 560, border: 0, background: '#fff', display: 'block' }}
                />
              </div>
            )
          })}
        </div>

        {!OUTREACH_MAILING_ADDRESS && (
          <p style={{ marginTop: 24, color: '#f59e0b', fontSize: 13, textAlign: 'center' }}>
            The footer shows [mailing address] — sending stays blocked until it&apos;s filled in.
          </p>
        )}

        {/* Texts */}
        <h2 style={{ color: '#fff', fontSize: 20, margin: '48px 0 8px' }}>Texts</h2>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>Only for people who replied or asked to be texted. Sent from your own phone on the SMS tab.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(Object.keys(SMS_TEMPLATES) as SmsTemplateId[]).map(id => {
            const text = renderSmsTemplate(id, { salon: sampleSalon, first: sampleOwner, sender: sampleSender, link: SMS_TEMPLATES[id].link === 'preview' ? 'https://joinglowup.org/book/luxe-nails-spa' : 'https://joinglowup.org/auth/signup' })
            return (
              <div key={id} style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: 16 }}>
                <div style={{ color: '#d4a0e8', fontSize: 13, fontWeight: 700 }}>{SMS_TEMPLATES[id].name} <span style={{ color: '#666', fontWeight: 400 }}>· {text.length} characters</span></div>
                <div style={{ color: '#ddd', fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{text}</div>
              </div>
            )
          })}
        </div>

        {/* Edit instructions */}
        <div style={{
          marginTop: 48,
          padding: '20px 24px',
          background: '#1a1a2e',
          borderRadius: 12,
          border: '1px solid #2a2a3e',
        }}>
          <h3 style={{ color: '#fff', fontSize: 15, marginBottom: 8 }}>✏️ How to Edit Templates</h3>
          <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Open <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: 4, color: '#e8a87c' }}>src/lib/outreach-templates.ts</code> → the wording is in <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: 4, color: '#d4a0e8' }}>body()</code> (emails) and <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: 4, color: '#d4a0e8' }}>renderSmsTemplate()</code> (texts). Keep every claim true: no made-up numbers or deadlines.
          </p>
        </div>
      </div>
    </div>
  )
}
