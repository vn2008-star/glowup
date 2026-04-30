'use client'

import { useState, useEffect, useMemo } from 'react'
import styles from './booking.module.css'
import ChatWidget from './ChatWidget'

/* ── Types ── */
interface ServiceInfo { id: string; name: string; category: string; description: string | null; duration_minutes: number; price: number; sort_order: number; image_url: string | null }
interface StaffInfo { id: string; name: string; specialties: string[]; schedule: Record<string, unknown> }
interface BookedSlot { staff_id: string | null; start: string; end: string }
interface BusinessInfo { name: string; slug: string; phone: string | null; logo_url: string | null; address: string | null; hours: Record<string, { open: string; close: string; closed: boolean }> | null }

const STEPS = ['Service', 'Staff', 'Date & Time', 'Your Info', 'Confirm'] as const
type Step = 0 | 1 | 2 | 3 | 4

export default function BookingClient({ slug }: { slug: string }) {
  const [step, setStep] = useState<Step>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [booked, setBooked] = useState(false)
  const [bookedTime, setBookedTime] = useState('')
  const [birthdaySaved, setBirthdaySaved] = useState(false)

  // Data from API
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [staff, setStaff] = useState<StaffInfo[]>([])
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([])

  // Selections
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffInfo | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [clientBirthday, setClientBirthday] = useState('')

  // Fetch business data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public-booking?slug=${encodeURIComponent(slug)}`)
        if (!res.ok) { setError('Business not found'); setLoading(false); return }
        const data = await res.json()
        setBusiness(data.business)
        setServices(data.services)
        setStaff(data.staff)
        setBookedSlots(data.bookedSlots)
      } catch { setError('Failed to load booking page') }
      setLoading(false)
    }
    load()
  }, [slug])

  // Group services by category
  const servicesByCategory = useMemo(() => {
    const map: Record<string, ServiceInfo[]> = {}
    services.forEach(s => {
      const cat = s.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(s)
    })
    return map
  }, [services])

  // Generate available time slots for selected date
  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedService) return []
    const date = new Date(selectedDate + 'T00:00:00')
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const hours = business?.hours?.[dayName]

    // Default hours if not set
    const openStr = hours?.open || '09:00'
    const closeStr = hours?.close || '18:00'
    if (hours?.closed) return []

    const [openH, openM] = openStr.split(':').map(Number)
    const [closeH, closeM] = closeStr.split(':').map(Number)
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM

    const slots: string[] = []
    for (let m = openMinutes; m + selectedService.duration_minutes <= closeMinutes; m += 30) {
      const h = Math.floor(m / 60)
      const min = m % 60
      const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`

      // Check if this slot conflicts with any booked appointment
      const slotStart = new Date(`${selectedDate}T${time}:00`)
      const slotEnd = new Date(slotStart.getTime() + selectedService.duration_minutes * 60 * 1000)

      const isBooked = bookedSlots.some(b => {
        // If staff is selected, only check that staff's appointments
        if (selectedStaff && b.staff_id !== selectedStaff.id) return false
        const bStart = new Date(b.start)
        const bEnd = new Date(b.end)
        return slotStart < bEnd && slotEnd > bStart
      })

      if (!isBooked) slots.push(time)
    }
    return slots
  }, [selectedDate, selectedService, selectedStaff, bookedSlots, business])

  // Get next 14 days for date picker
  const availableDates = useMemo(() => {
    const dates: { value: string; label: string; dayName: string }[] = []
    const today = new Date()
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000)
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
      const isClosed = business?.hours?.[dayName]?.closed
      if (!isClosed) {
        dates.push({
          value: d.toISOString().split('T')[0],
          label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          dayName,
        })
      }
    }
    return dates
  }, [business])

  // Submit booking
  async function handleSubmit() {
    if (!selectedService || !selectedDate || !selectedTime || !clientName) return
    setSubmitting(true)

    try {
      // Build a proper timezone-aware Date from the user's local date+time selection
      const localStart = new Date(`${selectedDate}T${selectedTime}:00`)
      const res = await fetch('/api/public-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          service_id: selectedService.id,
          staff_id: selectedStaff?.id || null,
          start_time: localStart.toISOString(),
          duration_minutes: selectedService.duration_minutes,
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          notes: clientNotes,
          client_birthday: clientBirthday || null,
        }),
      })

      if (res.ok) {
        const startDate = new Date(`${selectedDate}T${selectedTime}:00`)
        setBookedTime(startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' at ' + startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
        if (clientBirthday) setBirthdaySaved(true)
        setBooked(true)
      } else {
        alert('Booking failed. Please try again.')
      }
    } catch {
      alert('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  function formatTime(time: string) {
    const [h, m] = time.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
  }

  // ── Loading / Error States ──
  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <p>Loading booking page...</p>
      </div>
    </div>
  )

  if (error || !business) return (
    <div className={styles.page}>
      <div className={styles.errorState}>
        <h2>😔 {error || 'Business not found'}</h2>
        <p>This booking link may be invalid or the business has not set up online booking yet.</p>
      </div>
    </div>
  )

  // ── Success State ──
  if (booked) return (
    <div className={styles.page}>
      <div className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <h2>Booking Confirmed!</h2>
        <p className={styles.successBusiness}>{business.name}</p>
        <div className={styles.successDetails}>
          <div className={styles.successRow}>
            <span>Service</span>
            <strong>{selectedService?.name}</strong>
          </div>
          {selectedStaff && (
            <div className={styles.successRow}>
              <span>With</span>
              <strong>{selectedStaff.name}</strong>
            </div>
          )}
          <div className={styles.successRow}>
            <span>Date & Time</span>
            <strong>{bookedTime}</strong>
          </div>
          <div className={styles.successRow}>
            <span>Duration</span>
            <strong>{selectedService?.duration_minutes} minutes</strong>
          </div>
        </div>
        {!birthdaySaved && (
          <div className={styles.birthdayPrompt}>
            <p className={styles.birthdayPromptTitle}>🎂 When&apos;s your birthday?</p>
            <p className={styles.birthdayPromptText}>Share your birthday and we&apos;ll send you a special treat — discounts, freebies, and more!</p>
            <div className={styles.birthdayPromptForm}>
              <input type="date" value={clientBirthday} onChange={async (e) => {
                const val = e.target.value
                setClientBirthday(val)
                if (val) {
                  setBirthdaySaved(true)
                  await fetch('/api/public-booking', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug, client_email: clientEmail, client_phone: clientPhone, birthday: val }),
                  })
                }
              }} />
              <button
                className={styles.birthdayPromptBtn}
                onClick={async () => {
                  if (!clientBirthday) return
                  setBirthdaySaved(true)
                  await fetch('/api/public-booking', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug, client_email: clientEmail, client_phone: clientPhone, birthday: clientBirthday }),
                  })
                }}
                disabled={!clientBirthday}
              >
                Save Birthday 🎁
              </button>
            </div>
          </div>
        )}
        {birthdaySaved && (
          <p className={styles.birthdayConfirmed}>🎂 Birthday saved — expect a special surprise!</p>
        )}
        <p className={styles.successNote}>
          {business.phone ? `Questions? Call ${business.phone}` : 'We look forward to seeing you!'}
        </p>
      </div>
    </div>
  )

  // ── Main Booking Flow ──
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.businessBrand}>
            {business.logo_url
              ? <img src={business.logo_url} alt={business.name} className={styles.businessLogo} />
              : <div className={styles.businessLogoFallback}>{business.name[0]}</div>
            }
            <div>
              <h1 className={styles.businessName}>{business.name}</h1>
              {business.address && <p className={styles.businessAddress}>{business.address}</p>}
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className={styles.progress}>
          {STEPS.map((label, i) => (
            <div key={label} className={`${styles.progressStep} ${i === step ? styles.progressActive : ''} ${i < step ? styles.progressDone : ''}`}>
              <div className={styles.progressDot}>
                {i < step ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : i + 1}
              </div>
              <span className={styles.progressLabel}>{label}</span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className={styles.stepContent}>

          {/* ── Step 0: Choose Service ── */}
          {step === 0 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Choose a Service</h2>
              <p className={styles.stepSubtitle}>What would you like done today?</p>
              {Object.entries(servicesByCategory).map(([category, svcs]) => (
                <div key={category} className={styles.serviceCategory}>
                  <h3 className={styles.categoryName}>{category}</h3>
                  <div className={styles.serviceGrid}>
                    {svcs.map(s => (
                      <button
                        key={s.id}
                        className={`${styles.serviceCard} ${selectedService?.id === s.id ? styles.serviceSelected : ''} ${s.image_url ? styles.serviceWithImage : ''}`}
                        onClick={() => { setSelectedService(s); setStep(1) }}
                      >
                        {s.image_url && (
                          <div className={styles.serviceThumb}>
                            <img src={s.image_url} alt={s.name} />
                          </div>
                        )}
                        <div className={styles.serviceInfo}>
                          <span className={styles.serviceName}>{s.name}</span>
                          {s.description && <span className={styles.serviceDesc}>{s.description}</span>}
                          <span className={styles.serviceMeta}>{s.duration_minutes} min</span>
                        </div>
                        <span className={styles.servicePrice}>${s.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 1: Choose Staff ── */}
          {step === 1 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Choose a Stylist</h2>
              <p className={styles.stepSubtitle}>Who would you like to see?</p>
              <div className={styles.staffGrid}>
                <button
                  className={`${styles.staffCard} ${!selectedStaff ? styles.staffSelected : ''}`}
                  onClick={() => { setSelectedStaff(null); setStep(2) }}
                >
                  <div className={styles.staffAvatar}>✨</div>
                  <span className={styles.staffName}>Any Available</span>
                  <span className={styles.staffSpecialty}>First available stylist</span>
                </button>
                {staff.map(s => (
                  <button
                    key={s.id}
                    className={`${styles.staffCard} ${selectedStaff?.id === s.id ? styles.staffSelected : ''}`}
                    onClick={() => { setSelectedStaff(s); setStep(2) }}
                  >
                    <div className={styles.staffAvatar}>{s.name.split(' ').map(n => n[0]).join('')}</div>
                    <span className={styles.staffName}>{s.name}</span>
                    {s.specialties?.length > 0 && (
                      <span className={styles.staffSpecialty}>{[...new Set(s.specialties)].slice(0, 2).join(', ')}</span>
                    )}
                  </button>
                ))}
              </div>
              <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
            </div>
          )}

          {/* ── Step 2: Date & Time ── */}
          {step === 2 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Pick a Date & Time</h2>
              <p className={styles.stepSubtitle}>{selectedService?.name} • {selectedService?.duration_minutes} min{selectedStaff ? ` with ${selectedStaff.name}` : ''}</p>

              <div className={styles.dateGrid}>
                {availableDates.map(d => (
                  <button
                    key={d.value}
                    className={`${styles.dateCard} ${selectedDate === d.value ? styles.dateSelected : ''}`}
                    onClick={() => { setSelectedDate(d.value); setSelectedTime('') }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {selectedDate && (
                <>
                  <h3 className={styles.timeSectionTitle}>Available Times</h3>
                  {timeSlots.length === 0 ? (
                    <p className={styles.noSlots}>No available slots on this day. Try another date.</p>
                  ) : (
                    <div className={styles.timeGrid}>
                      {timeSlots.map(t => (
                        <button
                          key={t}
                          className={`${styles.timeSlot} ${selectedTime === t ? styles.timeSelected : ''}`}
                          onClick={() => { setSelectedTime(t); setStep(3) }}
                        >
                          {formatTime(t)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
            </div>
          )}

          {/* ── Step 3: Client Info ── */}
          {step === 3 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Your Information</h2>
              <p className={styles.stepSubtitle}>So we can confirm your appointment</p>

              <div className={styles.clientForm}>
                <div className={styles.formGroup}>
                  <label>Full Name *</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Jane Smith" required />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Phone</label>
                    <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(415) 555-1234" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Email</label>
                    <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="jane@email.com" />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label>Birthday 🎂 <span className={styles.optionalLabel}>(optional)</span></label>
                  <input type="date" value={clientBirthday} onChange={e => setClientBirthday(e.target.value)} />
                  <span className={styles.birthdayHint}>🎁 We&apos;ll surprise you with a special treat on your birthday!</span>
                </div>
                <div className={styles.formGroup}>
                  <label>Notes <span className={styles.optionalLabel}>(optional)</span></label>
                  <textarea value={clientNotes} onChange={e => setClientNotes(e.target.value)} rows={3} placeholder="Any special requests or notes for your stylist..." />
                </div>
              </div>

              <div className={styles.stepActions}>
                <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
                <button className={styles.nextBtn} onClick={() => { if (clientName.trim()) setStep(4) }} disabled={!clientName.trim()}>
                  Review Booking →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Confirm ── */}
          {step === 4 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Confirm Your Booking</h2>
              <p className={styles.stepSubtitle}>Please review your appointment details</p>

              <div className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Service</span>
                  <span className={styles.summaryValue}>{selectedService?.name}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Stylist</span>
                  <span className={styles.summaryValue}>{selectedStaff?.name || 'Any Available'}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Date</span>
                  <span className={styles.summaryValue}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Time</span>
                  <span className={styles.summaryValue}>{formatTime(selectedTime)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Duration</span>
                  <span className={styles.summaryValue}>{selectedService?.duration_minutes} min</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span className={styles.summaryLabel}>Total</span>
                  <span className={styles.summaryValue}>${selectedService?.price}</span>
                </div>
              </div>

              <div className={styles.clientSummary}>
                <p><strong>{clientName}</strong></p>
                {clientPhone && <p>{clientPhone}</p>}
                {clientEmail && <p>{clientEmail}</p>}
              </div>

              <div className={styles.stepActions}>
                <button className={styles.backBtn} onClick={() => setStep(3)}>← Back</button>
                <button className={styles.confirmBtn} onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Booking...' : '✓ Confirm Booking'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <p>Powered by <strong>GlowUp</strong></p>
        </div>
      </div>

      {/* AI Chat Widget */}
      {business && <ChatWidget slug={slug} businessName={business.name} />}
    </div>
  )
}
