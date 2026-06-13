'use client'

import { useState, useEffect, useMemo } from 'react'
import styles from './booking.module.css'
import ChatWidget from './ChatWidget'
import { formatPhone } from '@/lib/utils'
import { localToUTC, todayInTz, nowInTz, DEFAULT_TZ } from '@/lib/tz'
import { isStaffOffOnDate, isBusinessClosedOnDate } from '@/lib/schedule-utils'
import type { CustomClosedDate } from '@/lib/schedule-utils'

/* ── Types ── */
interface ServiceInfo { id: string; name: string; category: string; description: string | null; duration_minutes: number; price: number; sort_order: number; image_url: string | null }
interface StaffInfo { id: string; name: string; specialties: string[]; schedule: Record<string, unknown>; service_durations: Record<string, number> }
interface BookedSlot { staff_id: string | null; start: string; end: string }
interface BusinessInfo { name: string; slug: string; phone: string | null; logo_url: string | null; address: string | null; timezone: string; hours: Record<string, { open: string; close: string; closed: boolean }> | null; advanceBookingDays?: number; closedHolidays?: string[]; customClosedDates?: CustomClosedDate[] }

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
  const [selectedServices, setSelectedServices] = useState<ServiceInfo[]>([])
  const [staffByService, setStaffByService] = useState<Record<string, StaffInfo | null>>({})
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [clientBirthday, setClientBirthday] = useState('')

  // Helper: get staff assigned to a specific service (null = Any Available)
  const getStaffForService = (serviceId: string): StaffInfo | null => staffByService[serviceId] ?? null

  // Helper: are all services assigned to the same staff?
  const allSameStaff = useMemo(() => {
    if (selectedServices.length === 0) return true
    const firstId = staffByService[selectedServices[0].id]?.id || null
    return selectedServices.every(s => (staffByService[s.id]?.id || null) === firstId)
  }, [selectedServices, staffByService])

  // The "primary" staff for slot generation (used when all same staff)
  const primaryStaff = useMemo(() => {
    if (selectedServices.length === 0) return null
    return staffByService[selectedServices[0].id] ?? null
  }, [selectedServices, staffByService])

  // Computed cart totals
  const totalDuration = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      const st = staffByService[s.id]
      if (st?.service_durations?.[s.id]) return sum + st.service_durations[s.id]
      return sum + s.duration_minutes
    }, 0)
  }, [selectedServices, staffByService])

  const totalPrice = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + s.price, 0)
  }, [selectedServices])

  // Effective duration used for time slot calculation (total of all services)
  const effectiveDuration = totalDuration

  // Subtitle helper for staff display
  const staffSubtitle = useMemo(() => {
    if (selectedServices.length === 0) return ''
    if (allSameStaff) return primaryStaff ? ` with ${primaryStaff.name}` : ''
    const names = [...new Set(selectedServices.map(s => staffByService[s.id]?.name || 'Any').filter(Boolean))]
    return ` with ${names.join(' & ')}`
  }, [selectedServices, staffByService, allSameStaff, primaryStaff])

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

  // Re-fetch booked slots when entering date/time step to prevent stale data
  useEffect(() => {
    if (step !== 2) return
    async function refreshSlots() {
      try {
        const res = await fetch(`/api/public-booking?slug=${encodeURIComponent(slug)}`)
        if (!res.ok) return
        const data = await res.json()
        setBookedSlots(data.bookedSlots)
      } catch { /* keep existing data */ }
    }
    refreshSlots()
  }, [step, slug])

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
  // Salon timezone — all time operations should use this, not the browser's timezone
  const salonTz = business?.timezone || DEFAULT_TZ

  const timeSlots = useMemo(() => {
    if (!selectedDate || selectedServices.length === 0 || !effectiveDuration) return []
    const date = new Date(selectedDate + 'T00:00:00')
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const hours = business?.hours?.[dayName]

    if (hours?.closed) return []

    // Check if ANY assigned staff is off this day (if all same staff, check primary)
    // For per-service staff, we check each individually below
    const openStr = hours?.open || '09:00'
    const closeStr = hours?.close || '18:00'
    const [openH, openM] = openStr.split(':').map(Number)
    const [closeH, closeM] = closeStr.split(':').map(Number)
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM

    // Build per-service windows for a given start time (in minutes from midnight)
    function buildWindows(startMinute: number) {
      const wins: { service: ServiceInfo; staffMember: StaffInfo | null; startMin: number; endMin: number }[] = []
      let cursor = startMinute
      for (const svc of selectedServices) {
        const st = staffByService[svc.id] ?? null
        const dur = st?.service_durations?.[svc.id] || svc.duration_minutes
        wins.push({ service: svc, staffMember: st, startMin: cursor, endMin: cursor + dur })
        cursor += dur
      }
      return wins
    }

    // Check if a set of windows has no booking conflicts
    function isAvailable(candidateStartMin: number) {
      const windows = buildWindows(candidateStartMin)
      const lastEnd = windows[windows.length - 1].endMin
      if (lastEnd > closeMinutes) return false

      for (const w of windows) {
        // Check staff off day
        if (w.staffMember && isStaffOffOnDate(w.staffMember.schedule as Record<string, unknown>, selectedDate)) return false

        // Check staff schedule (custom open/close or off)
        if (w.staffMember) {
          const stSched = w.staffMember.schedule?.[dayName] as { off?: boolean; open?: string; close?: string } | undefined
          if (stSched?.off) return false
          // Check within staff open/close
          if (stSched?.open) {
            const [soH, soM] = stSched.open.split(':').map(Number)
            if (w.startMin < soH * 60 + soM) return false
          }
          if (stSched?.close) {
            const [scH, scM] = stSched.close.split(':').map(Number)
            if (w.endMin > scH * 60 + scM) return false
          }
        }

        // Check booked slot conflicts for this service's window
        const wStartUTC = localToUTC(selectedDate, `${String(Math.floor(w.startMin / 60)).padStart(2, '0')}:${String(w.startMin % 60).padStart(2, '0')}`, salonTz).getTime()
        const wEndUTC = localToUTC(selectedDate, `${String(Math.floor(w.endMin / 60)).padStart(2, '0')}:${String(w.endMin % 60).padStart(2, '0')}`, salonTz).getTime()

        const hasConflict = bookedSlots.some(b => {
          // Only check bookings for this specific staff member
          if (w.staffMember && b.staff_id !== w.staffMember.id) return false
          if (!w.staffMember) return false // "Any Available" — skip conflict check (simplified)
          const bStartMs = new Date(b.start).getTime()
          const bEndMs = new Date(b.end).getTime()
          return wStartUTC < bEndMs && wEndUTC > bStartMs
        })
        if (hasConflict) return false
      }
      return true
    }

    const slots: string[] = []

    // Determine candidate start times
    // Use custom slots from the first service's staff if available, otherwise 30-min increments
    const firstStaff = staffByService[selectedServices[0].id] ?? null
    const firstStaffSched = firstStaff?.schedule?.[dayName] as
      { open?: string; close?: string; useSlots?: boolean; slots?: { start: string; end: string }[] } | undefined

    const useCustomSlots = firstStaffSched?.useSlots && firstStaffSched.slots?.length
    // Also gather custom slots from all staff if "Any Available" is selected for first service
    const allCustomSlots: string[] = []

    if (useCustomSlots) {
      for (const sl of firstStaffSched!.slots!) {
        allCustomSlots.push(sl.start)
      }
    } else if (!firstStaff) {
      // "Any Available" for first service — gather all custom slot start times from all staff
      for (const s of staff) {
        if (isStaffOffOnDate(s.schedule as Record<string, unknown>, selectedDate)) continue
        const sSched = s.schedule?.[dayName] as typeof firstStaffSched
        if (sSched?.useSlots && sSched.slots?.length) {
          for (const sl of sSched.slots) {
            if (!allCustomSlots.includes(sl.start)) allCustomSlots.push(sl.start)
          }
        }
      }
    }

    if (allCustomSlots.length > 0) {
      // Use custom slot start times as candidates
      for (const time of allCustomSlots) {
        const [h, m] = time.split(':').map(Number)
        if (isAvailable(h * 60 + m)) slots.push(time)
      }
      slots.sort()
    } else {
      // No custom slots — generate 30-min increment candidates
      const effOpen = firstStaffSched?.open || openStr
      const effClose = firstStaffSched?.close || closeStr
      const [eOpenH, eOpenM] = effOpen.split(':').map(Number)
      const [eCloseH, eCloseM] = effClose.split(':').map(Number)
      const effOpenMin = eOpenH * 60 + eOpenM
      const effCloseMin = eCloseH * 60 + eCloseM

      for (let m = effOpenMin; m + effectiveDuration <= effCloseMin; m += 30) {
        const h = Math.floor(m / 60)
        const min = m % 60
        const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        if (isAvailable(m)) slots.push(time)
      }
    }

    // Filter out past time slots if the selected date is today (in the salon's timezone)
    const salonNow = nowInTz(salonTz)
    const isToday = selectedDate === salonNow.dateStr
    const filtered = isToday
      ? slots.filter(t => {
          const [h, m] = t.split(':').map(Number)
          return h > salonNow.hour || (h === salonNow.hour && m > salonNow.minute)
        })
      : slots
    return filtered
  }, [selectedDate, selectedServices, staffByService, bookedSlots, business, effectiveDuration, salonTz, staff])

  // Check if a specific date is available for booking
  const isDateAvailable = useMemo(() => {
    const maxDays = business?.advanceBookingDays || 30
    // Use salon timezone for "today"
    const todayStr = todayInTz(salonTz)
    const todayDate = new Date(todayStr + 'T00:00:00')
    todayDate.setHours(0, 0, 0, 0)
    const maxDate = new Date(todayDate.getTime() + maxDays * 24 * 60 * 60 * 1000)

    return (dateStr: string) => {
      const d = new Date(dateStr + 'T00:00:00')
      if (d < todayDate || d > maxDate) return false
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
      if (business?.hours?.[dayName]?.closed) return false
      // Business-wide closed days (holidays + custom dates)
      if (isBusinessClosedOnDate(
        business?.closedHolidays || [],
        business?.customClosedDates || [],
        dateStr,
      )) return false
      // Check if any assigned staff is off on this day
      for (const svc of selectedServices) {
        const st = staffByService[svc.id]
        if (st && isStaffOffOnDate(st.schedule as Record<string, unknown>, dateStr)) return false
      }
      return true
    }
  }, [business, staffByService, selectedServices, salonTz])

  // Generate calendar grid for a given month
  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth
    const firstDay = new Date(year, month, 1)
    const startDow = firstDay.getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: (string | null)[] = []
    // Leading blanks
    for (let i = 0; i < startDow; i++) cells.push(null)
    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push(dateStr)
    }
    return cells
  }, [calendarMonth])

  // Submit booking
  async function handleSubmit() {
    if (selectedServices.length === 0 || !selectedDate || !selectedTime || !clientName || !clientPhone.trim()) return
    setSubmitting(true)

    try {
      // Convert salon-local date+time to UTC using the salon's timezone
      const utcStart = localToUTC(selectedDate, selectedTime, salonTz)

      // Build per-service items with effective durations and per-service staff
      const serviceItems = selectedServices.map(s => {
        const st = staffByService[s.id] ?? null
        return {
          service_id: s.id,
          staff_id: st?.id || null,
          duration_minutes: st?.service_durations?.[s.id] || s.duration_minutes,
        }
      })

      const res = await fetch('/api/public-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          services: serviceItems,
          start_time: utcStart.toISOString(),
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          notes: clientNotes,
          client_birthday: clientBirthday || null,
        }),
      })

      if (res.ok) {
        // Display confirmation in the salon's timezone so the client sees the correct local time
        const confirmDate = new Date(selectedDate + 'T12:00:00') // just for the date portion
        const dateDisplay = confirmDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        const [h, m] = selectedTime.split(':').map(Number)
        const ampm = h >= 12 ? 'PM' : 'AM'
        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
        const timeDisplay = `${h12}:${String(m).padStart(2, '0')} ${ampm}`
        setBookedTime(`${dateDisplay} at ${timeDisplay}`)
        if (clientBirthday) setBirthdaySaved(true)
        setBooked(true)
      } else if (res.status === 409) {
        // Slot was taken — refresh availability and go back to time picker
        alert('Sorry, that time slot was just booked by someone else. Please choose another time.')
        try {
          const refreshRes = await fetch(`/api/public-booking?slug=${encodeURIComponent(slug)}`)
          if (refreshRes.ok) {
            const data = await refreshRes.json()
            setBookedSlots(data.bookedSlots)
          }
        } catch { /* keep existing data */ }
        setSelectedTime('')
        setStep(2)
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
          {selectedServices.map((s, i) => {
            const st = staffByService[s.id]
            return (
              <div key={i} className={styles.successRow}>
                <span>{s.name}{st ? ` with ${st.name}` : ''}</span>
                <strong>{(st?.service_durations?.[s.id] || s.duration_minutes) + ' min'}</strong>
              </div>
            )
          })}

          <div className={styles.successRow}>
            <span>Date & Time</span>
            <strong>{bookedTime}</strong>
          </div>
          <div className={styles.successRow}>
            <span>Total Duration</span>
            <strong>{totalDuration} minutes</strong>
          </div>
          {selectedServices.length > 1 && (
            <div className={styles.successRow}>
              <span>Total</span>
              <strong>${totalPrice}</strong>
            </div>
          )}
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
        <button
          className={styles.bookAnotherBtn}
          onClick={() => {
            setBooked(false)
            setSelectedServices([])
            setStaffByService({})
            setSelectedDate('')
            setSelectedTime('')
            setClientNotes('')
            setBookedTime('')
            setStep(0)
          }}
        >
          📅 Book Another Appointment
        </button>

        {/* Ambassador Nudge */}
        <a href="https://glowup-jade.vercel.app/auth/signup" className={styles.ambassadorCard} target="_blank" rel="noopener noreferrer">
          <span className={styles.ambassadorIcon}>✨</span>
          <div>
            <strong>Love easy online booking?</strong>
            <p>Get GlowUp free for your salon — smart booking, automated reminders, and more.</p>
          </div>
          <span className={styles.ambassadorArrow}>→</span>
        </a>
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

          {/* ── Step 0: Choose Service(s) ── */}
          {step === 0 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Choose Your Services</h2>
              <p className={styles.stepSubtitle}>Select one or more services for your visit</p>
              {Object.entries(servicesByCategory).map(([category, svcs]) => (
                <div key={category} className={styles.serviceCategory}>
                  <h3 className={styles.categoryName}>{category}</h3>
                  <div className={styles.serviceGrid}>
                    {svcs.map(s => {
                      const isInCart = selectedServices.some(sel => sel.id === s.id)
                      return (
                        <button
                          key={s.id}
                          className={`${styles.serviceCard} ${isInCart ? styles.serviceSelected : ''} ${s.image_url ? styles.serviceWithImage : ''}`}
                          onClick={() => {
                            setSelectedServices(prev =>
                              isInCart ? prev.filter(sel => sel.id !== s.id) : [...prev, s]
                            )
                          }}
                        >
                          {isInCart && <span className={styles.serviceCheck}>✓</span>}
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
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Floating Cart Bar */}
              {selectedServices.length > 0 && (
                <div className={styles.cartBar}>
                  <div className={styles.cartInfo}>
                    <span className={styles.cartBadge}>{selectedServices.length}</span>
                    <span className={styles.cartText}>
                      {selectedServices.length === 1 ? '1 service' : `${selectedServices.length} services`} · {totalDuration} min
                    </span>
                  </div>
                  <div className={styles.cartRight}>
                    <span className={styles.cartTotal}>${totalPrice}</span>
                    <button
                      className={styles.cartContinue}
                      onClick={() => {
                        if (staff.length === 1) {
                          // Auto-assign single staff to all services
                          const map: Record<string, StaffInfo | null> = {}
                          selectedServices.forEach(s => { map[s.id] = staff[0] })
                          setStaffByService(map)
                          setStep(2)
                        } else { setStep(1) }
                      }}
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Choose Staff ── */}
          {step === 1 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Choose Your Stylists</h2>
              <p className={styles.stepSubtitle}>Pick a stylist for each service</p>

              {selectedServices.map(svc => {
                const currentStaff = getStaffForService(svc.id)
                return (
                  <div key={svc.id} className={styles.staffSection}>
                    <h3 className={styles.staffSectionTitle}>{svc.name} <span className={styles.staffSectionMeta}>{svc.duration_minutes} min</span></h3>
                    <div className={styles.staffGrid}>
                      <button
                        className={`${styles.staffCard} ${!currentStaff ? styles.staffSelected : ''}`}
                        onClick={() => setStaffByService(prev => ({ ...prev, [svc.id]: null }))}
                      >
                        <div className={styles.staffAvatar}>✨</div>
                        <span className={styles.staffName}>Any Available</span>
                      </button>
                      {staff.map(s => (
                        <button
                          key={s.id}
                          className={`${styles.staffCard} ${currentStaff?.id === s.id ? styles.staffSelected : ''}`}
                          onClick={() => setStaffByService(prev => ({ ...prev, [svc.id]: s }))}
                        >
                          <div className={styles.staffAvatar}>{s.name.split(' ').map(n => n[0]).join('')}</div>
                          <span className={styles.staffName}>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              <div className={styles.stepActions}>
                <button className={styles.backBtn} onClick={() => setStep(0)}>← Back</button>
                <button className={styles.nextBtn} onClick={() => setStep(2)}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 2: Date & Time ── */}
          {step === 2 && (
            <div className={styles.stepPanel}>
              <h2 className={styles.stepTitle}>Pick a Date & Time</h2>
              <p className={styles.stepSubtitle}>{selectedServices.map(s => s.name).join(', ')} • {totalDuration} min{staffSubtitle}</p>

              {/* Calendar */}
              <div className={styles.calendar}>
                <div className={styles.calendarHeader}>
                  <button
                    className={styles.calendarNav}
                    onClick={() => setCalendarMonth(prev => {
                      const d = new Date(prev.year, prev.month - 1, 1)
                      return { year: d.getFullYear(), month: d.getMonth() }
                    })}
                    disabled={calendarMonth.year === new Date().getFullYear() && calendarMonth.month === new Date().getMonth()}
                  >
                    ‹
                  </button>
                  <span className={styles.calendarMonthLabel}>
                    {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    className={styles.calendarNav}
                    onClick={() => setCalendarMonth(prev => {
                      const d = new Date(prev.year, prev.month + 1, 1)
                      return { year: d.getFullYear(), month: d.getMonth() }
                    })}
                  >
                    ›
                  </button>
                </div>
                <div className={styles.calendarWeekdays}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className={styles.calendarGrid}>
                  {calendarDays.map((dateStr, i) => {
                    if (!dateStr) return <span key={`blank-${i}`} />
                    const day = new Date(dateStr + 'T00:00:00').getDate()
                    const available = isDateAvailable(dateStr)
                    const isSelected = selectedDate === dateStr
                    const isToday = dateStr === new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
                    return (
                      <button
                        key={dateStr}
                        className={`${styles.calendarDay} ${isSelected ? styles.calendarDaySelected : ''} ${!available ? styles.calendarDayDisabled : ''} ${isToday ? styles.calendarDayToday : ''}`}
                        disabled={!available}
                        onClick={() => { setSelectedDate(dateStr); setSelectedTime('') }}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
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
                    <label>Phone *</label>
                    <input type="tel" value={clientPhone} onChange={e => setClientPhone(formatPhone(e.target.value))} placeholder="(415) 555-1234" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Email <span className={styles.optionalLabel}>(optional)</span></label>
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
                <button className={styles.nextBtn} onClick={() => { if (clientName.trim() && clientPhone.trim()) setStep(4) }} disabled={!clientName.trim() || !clientPhone.trim()}>
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
                {/* Individual services with per-service staff */}
                {selectedServices.map((s, i) => {
                  const st = staffByService[s.id]
                  return (
                    <div key={i} className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>{s.name}{st ? ` · ${st.name}` : ''}</span>
                      <span className={styles.summaryValue}>
                        {st?.service_durations?.[s.id] || s.duration_minutes} min · ${s.price}
                      </span>
                    </div>
                  )
                })}
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
                  <span className={styles.summaryLabel}>Total Duration</span>
                  <span className={styles.summaryValue}>{totalDuration} min</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span className={styles.summaryLabel}>Total</span>
                  <span className={styles.summaryValue}>${totalPrice}</span>
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
          <a href="https://glowup-jade.vercel.app/auth/signup" target="_blank" rel="noopener noreferrer" className={styles.footerCta}>
            Powered by <strong>GlowUp</strong> — <span className={styles.footerCtaHighlight}>Get it free for your salon →</span>
          </a>
        </div>
      </div>

      {/* AI Chat Widget */}
      {business && <ChatWidget slug={slug} businessName={business.name} />}
    </div>
  )
}
