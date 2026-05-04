import { renderTemplate, TEMPLATES, TemplateId } from '@/lib/outreach-templates'

export default function OutreachPreview() {
  const templates: TemplateId[] = ['feature_showcase', 'success_story', 'limited_offer', 'follow_up']
  const sampleSalon = 'Luxe Nails & Spa'
  const sampleOwner = 'Sarah'
  const sampleLink = 'https://glowup-jade.vercel.app/auth/signup?cref=CR-DEMO01'
  const sampleSender = 'James from GlowUp'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a14',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#fff',
          textAlign: 'center',
          marginBottom: 8,
        }}>
          ✨ GlowUp Email Templates Preview
        </h1>
        <p style={{
          textAlign: 'center',
          color: '#888',
          fontSize: 14,
          marginBottom: 48,
        }}>
          Sample salon: <strong style={{ color: '#e8a87c' }}>{sampleSalon}</strong> • Owner: <strong style={{ color: '#d4a0e8' }}>{sampleOwner}</strong>
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(540px, 1fr))',
          gap: 32,
        }}>
          {templates.map((id) => {
            const t = TEMPLATES[id]
            const html = renderTemplate(id, sampleSalon, sampleOwner, sampleLink, sampleSender)
            return (
              <div key={id} style={{ background: '#12121f', borderRadius: 16, overflow: 'hidden', border: '1px solid #2a2a3e' }}>
                <div style={{
                  padding: '16px 20px',
                  background: '#1a1a2e',
                  borderBottom: '1px solid #2a2a3e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{t.description}</div>
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: '#1a1a28', borderBottom: '1px solid #2a2a3e' }}>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>Subject Line:</div>
                  <div style={{ fontSize: 13, color: '#e8a87c', fontWeight: 600 }}>{t.subjectFn(sampleSalon)}</div>
                </div>
                <div
                  style={{ padding: 16 }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
