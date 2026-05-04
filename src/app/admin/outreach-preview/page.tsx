'use client'

import { renderTemplate, TEMPLATES, TemplateId } from '@/lib/outreach-templates'
import { useEffect } from 'react'

export default function OutreachPreview() {
  const templates: TemplateId[] = ['feature_showcase', 'success_story', 'limited_offer', 'follow_up']
  const sampleSalon = 'Luxe Nails & Spa'
  const sampleOwner = 'Sarah'
  const sampleLink = 'https://glowup-jade.vercel.app/auth/signup?cref=CR-DEMO01'
  const sampleSender = 'James from GlowUp'

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
                {t.icon} {t.name}
              </a>
            )
          })}
        </div>

        {/* Templates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {templates.map((id) => {
            const t = TEMPLATES[id]
            const html = renderTemplate(id, sampleSalon, sampleOwner, sampleLink, sampleSender)
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
                  <span style={{ fontSize: 24 }}>{t.icon}</span>
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

                {/* Rendered email */}
                <div
                  style={{ padding: 20 }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
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
            Open <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: 4, color: '#e8a87c' }}>src/lib/outreach-templates.ts</code> → find the <code style={{ background: '#2a2a3e', padding: '2px 6px', borderRadius: 4, color: '#d4a0e8' }}>case &apos;template_id&apos;</code> block → edit the HTML → refresh this page to see changes.
          </p>
        </div>
      </div>
    </div>
  )
}
