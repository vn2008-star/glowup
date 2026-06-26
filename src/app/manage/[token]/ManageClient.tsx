"use client";

import { useState, useEffect, useCallback } from "react";
import { localeDateStr } from "@/lib/utils";
import styles from "./manage.module.css";

interface AppointmentData {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  service: { id: string; name: string; duration_minutes: number; price: number } | null;
  staff: { id: string; name: string } | null;
  client: { first_name: string; last_name: string; email: string | null; phone: string | null } | null;
}

interface BusinessData {
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  timezone: string;
  hours: Record<string, { open: string; close: string }> | null;
}

type ViewState = "details" | "cancel-confirm" | "reschedule" | "cancelled" | "rescheduled";

export default function ManageClient({ token }: { token: string }) {
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>("details");
  const [actionLoading, setActionLoading] = useState(false);

  // Reschedule state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(new Date());

  // Fetch appointment details
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/manage-appointment?token=${token}`);
        if (!res.ok) {
          setError("Appointment not found or link has expired.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAppointment(data.appointment);
        setBusiness(data.business);

        // If already cancelled, show that state
        if (data.appointment?.status === "cancelled") {
          setView("cancelled");
        }
      } catch {
        setError("Unable to load appointment details.");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  // Cancel appointment
  async function handleCancel() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/manage-appointment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "cancel" }),
      });
      if (res.ok) {
        setView("cancelled");
        if (appointment) setAppointment({ ...appointment, status: "cancelled" });
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel");
      }
    } catch {
      alert("Network error. Please try again.");
    }
    setActionLoading(false);
  }

  // Reschedule appointment
  async function handleReschedule() {
    if (!selectedDate || !selectedTime) return;
    setActionLoading(true);
    try {
      const newStartTime = `${selectedDate}T${selectedTime}:00`;
      const res = await fetch("/api/manage-appointment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "reschedule", new_start_time: newStartTime }),
      });
      if (res.ok) {
        const data = await res.json();
        if (appointment) {
          setAppointment({
            ...appointment,
            start_time: data.new_start_time,
            end_time: data.new_end_time,
          });
        }
        setView("rescheduled");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to reschedule");
      }
    } catch {
      alert("Network error. Please try again.");
    }
    setActionLoading(false);
  }

  // Format date/time
  function formatDate(iso: string) {
    const d = new Date(iso);
    return localeDateStr(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  // Calendar helpers for reschedule
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfWeek(year: number, month: number) {
    return new Date(year, month, 1).getDay();
  }

  // Default business hours if none configured (Mon-Sat 9am-7pm)
  const DEFAULT_HOURS: Record<string, { open: string; close: string }> = {
    monday: { open: "09:00", close: "19:00" },
    tuesday: { open: "09:00", close: "19:00" },
    wednesday: { open: "09:00", close: "19:00" },
    thursday: { open: "09:00", close: "19:00" },
    friday: { open: "09:00", close: "19:00" },
    saturday: { open: "09:00", close: "19:00" },
    sunday: { open: "10:00", close: "16:00" },
  };
  // Normalize keys to lowercase (settings saves "Monday", calendar looks up "monday")
  // Also respect the `closed` flag from settings — if closed, exclude that day
  const effectiveHours: Record<string, { open: string; close: string }> = (() => {
    const raw = business?.hours || DEFAULT_HOURS;
    const normalized: Record<string, { open: string; close: string }> = {};
    for (const [key, val] of Object.entries(raw)) {
      const entry = val as { open?: string; close?: string; closed?: boolean };
      if (entry.closed) continue; // skip closed days
      if (entry.open && entry.close) {
        normalized[key.toLowerCase()] = { open: entry.open, close: entry.close };
      }
    }
    return normalized;
  })();

  // Generate available time slots for a date
  const generateTimeSlots = useCallback((dateStr: string) => {
    const dayOfWeek = localeDateStr(new Date(dateStr + "T12:00:00"), { weekday: "long" }).toLowerCase();
    const dayHours = effectiveHours[dayOfWeek];
    if (!dayHours || !dayHours.open || !dayHours.close) return [];

    const [openH, openM] = dayHours.open.split(":").map(Number);
    const [closeH, closeM] = dayHours.close.split(":").map(Number);
    const openMinutes = openH * 60 + (openM || 0);
    const closeMinutes = closeH * 60 + (closeM || 0);
    const duration = appointment?.service?.duration_minutes || 60;

    const slots: string[] = [];
    for (let m = openMinutes; m + duration <= closeMinutes; m += 30) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

      // Skip past times for today
      if (dateStr === toDateStr(new Date())) {
        const now = new Date();
        if (h < now.getHours() || (h === now.getHours() && min <= now.getMinutes())) continue;
      }

      slots.push(timeStr);
    }
    return slots;
  }, [effectiveHours, appointment]);

  function toDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatTimeSlot(time: string) {
    const [h, m] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  const isPast = appointment ? new Date(appointment.start_time) < new Date() : false;
  const canModify = appointment && !isPast && appointment.status !== "cancelled" && appointment.status !== "completed";

  // ── Render ──
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={`${styles.card} ${styles.loading}`}>
            <div className={styles.spinner} />
            <span>Loading appointment...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={`${styles.card} ${styles.error}`}>
            <h2>😕 Appointment Not Found</h2>
            <p>{error || "This link may have expired or is invalid."}</p>
          </div>
        </div>
      </div>
    );
  }

  const statusClass = {
    confirmed: styles.statusConfirmed,
    pending: styles.statusPending,
    cancelled: styles.statusCancelled,
    completed: styles.statusCompleted,
  }[appointment.status] || styles.statusPending;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        {business && (
          <div className={styles.header}>
            <div className={styles.businessBrand}>
              {business.logo_url ? (
                <img src={business.logo_url} alt={business.name} className={styles.businessLogo} />
              ) : (
                <div className={styles.businessLogoFallback}>{business.name[0]}</div>
              )}
              <div>
                <div className={styles.businessName}>{business.name}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Cancelled Success ── */}
        {view === "cancelled" && (
          <div className={`${styles.card} ${styles.successCard}`}>
            <div className={styles.successIcon}>✅</div>
            <div className={styles.successTitle}>Appointment Cancelled</div>
            <p className={styles.successMessage}>
              Your {appointment.service?.name || "appointment"} has been cancelled.
              {business?.name && ` ${business.name} has been notified.`}
            </p>
            {business?.slug && (
              <a href={`/book/${business.slug}`} className={styles.bookAgainBtn}>
                Book Again
              </a>
            )}
          </div>
        )}

        {/* ── Rescheduled Success ── */}
        {view === "rescheduled" && (
          <div className={`${styles.card} ${styles.successCard}`}>
            <div className={styles.successIcon}>🔄</div>
            <div className={styles.successTitle}>Appointment Rescheduled!</div>
            <p className={styles.successMessage}>
              Your new appointment is on <strong style={{ color: "#f0f0f5" }}>{formatDate(appointment.start_time)}</strong> at{" "}
              <strong style={{ color: "#f0f0f5" }}>{formatTime(appointment.start_time)}</strong>.
              {business?.name && ` ${business.name} has been notified.`}
            </p>
            <div className={styles.details} style={{ marginBottom: 0 }}>
              <div className={styles.detailRow}>
                <span className={styles.detailIcon}>📋</span>
                <span className={styles.detailLabel}>Service</span>
                <span className={styles.detailValue}>{appointment.service?.name || "—"}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailIcon}>📅</span>
                <span className={styles.detailLabel}>Date</span>
                <span className={styles.detailValue}>{formatDate(appointment.start_time)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailIcon}>🕐</span>
                <span className={styles.detailLabel}>Time</span>
                <span className={styles.detailValue}>{formatTime(appointment.start_time)}</span>
              </div>
              {appointment.staff && (
                <div className={styles.detailRow}>
                  <span className={styles.detailIcon}>💇</span>
                  <span className={styles.detailLabel}>With</span>
                  <span className={styles.detailValue}>{appointment.staff.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Reschedule View ── */}
        {view === "reschedule" && (
          <div className={styles.card}>
            <div className={styles.reschedulePanel}>
              <button className={styles.rescheduleBack} onClick={() => { setView("details"); setSelectedDate(null); setSelectedTime(null); }}>
                ← Back to appointment
              </button>
              <h2 className={styles.cardTitle}>Reschedule Appointment</h2>
              <p className={styles.cardSubtitle}>Choose a new date and time for your {appointment.service?.name || "appointment"}.</p>

              {/* Calendar */}
              <div className={styles.calendar}>
                <div className={styles.calendarHeader}>
                  <button className={styles.calendarNav} onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                    disabled={calMonth.getMonth() === today.getMonth() && calMonth.getFullYear() === today.getFullYear()}>‹</button>
                  <span className={styles.calendarMonthLabel}>
                    {localeDateStr(calMonth, { month: "long", year: "numeric" })}
                  </span>
                  <button className={styles.calendarNav} onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}>›</button>
                </div>

                <div className={styles.calendarWeekdays}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <span key={d}>{d}</span>)}
                </div>

                <div className={styles.calendarGrid}>
                  {/* Empty cells before first day */}
                  {Array.from({ length: getFirstDayOfWeek(calMonth.getFullYear(), calMonth.getMonth()) }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {/* Day cells */}
                  {Array.from({ length: getDaysInMonth(calMonth.getFullYear(), calMonth.getMonth()) }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dateObj = new Date(dateStr + "T12:00:00");
                    const isPastDay = dateObj < today;
                    const isToday = toDateStr(new Date()) === dateStr;
                    const isSelected = selectedDate === dateStr;

                    // Check if day has business hours
                    const dayName = localeDateStr(dateObj, { weekday: "long" }).toLowerCase();
                    const dayHoursEntry = effectiveHours[dayName];
                    const hasHours = !!dayHoursEntry?.open;

                    return (
                      <button
                        key={day}
                        className={`${styles.calendarDay} ${isToday ? styles.calendarDayToday : ""} ${isSelected ? styles.calendarDaySelected : ""} ${isPastDay || !hasHours ? styles.calendarDayDisabled : ""}`}
                        disabled={isPastDay || !hasHours}
                        onClick={() => { setSelectedDate(dateStr); setSelectedTime(null); }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              {selectedDate && (() => {
                const slots = generateTimeSlots(selectedDate);
                return slots.length > 0 ? (
                  <>
                    <div className={styles.timeSectionTitle}>Available Times</div>
                    <div className={styles.timeGrid}>
                      {slots.map(time => (
                        <button
                          key={time}
                          className={`${styles.timeSlot} ${selectedTime === time ? styles.timeSelected : ""}`}
                          onClick={() => setSelectedTime(time)}
                        >
                          {formatTimeSlot(time)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className={styles.noSlots}>No available times on this date.</p>
                );
              })()}

              {selectedDate && selectedTime && (
                <button
                  className={styles.confirmReschedule}
                  onClick={handleReschedule}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Rescheduling..." : `Confirm — ${formatTimeSlot(selectedTime)} on ${localeDateStr(new Date(selectedDate + "T12:00:00"), { month: "short", day: "numeric" })}`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Default Details View ── */}
        {(view === "details" || view === "cancel-confirm") && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Your Appointment</h2>
            <p className={styles.cardSubtitle}>
              {canModify ? "View, reschedule, or cancel your appointment below." : "View your appointment details below."}
            </p>

            {/* Status Badge */}
            <div style={{ marginBottom: "1rem" }}>
              <span className={`${styles.statusBadge} ${statusClass}`}>
                {appointment.status === "confirmed" ? "✓ Confirmed" :
                 appointment.status === "cancelled" ? "✗ Cancelled" :
                 appointment.status === "completed" ? "✓ Completed" :
                 "⏳ Pending"}
              </span>
            </div>

            {/* Appointment Details */}
            <div className={styles.details}>
              <div className={styles.detailRow}>
                <span className={styles.detailIcon}>📋</span>
                <span className={styles.detailLabel}>Service</span>
                <span className={styles.detailValue}>{appointment.service?.name || "—"}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailIcon}>📅</span>
                <span className={styles.detailLabel}>Date</span>
                <span className={styles.detailValue}>{formatDate(appointment.start_time)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailIcon}>🕐</span>
                <span className={styles.detailLabel}>Time</span>
                <span className={styles.detailValue}>{formatTime(appointment.start_time)} — {formatTime(appointment.end_time)}</span>
              </div>
              {appointment.staff && (
                <div className={styles.detailRow}>
                  <span className={styles.detailIcon}>💇</span>
                  <span className={styles.detailLabel}>With</span>
                  <span className={styles.detailValue}>{appointment.staff.name}</span>
                </div>
              )}
              {business?.address && (
                <div className={styles.detailRow}>
                  <span className={styles.detailIcon}>📍</span>
                  <span className={styles.detailLabel}>Location</span>
                  <span className={styles.detailValue}>{business.address}</span>
                </div>
              )}
              {appointment.service?.price != null && (
                <div className={styles.detailRow}>
                  <span className={styles.detailIcon}>💰</span>
                  <span className={styles.detailLabel}>Price</span>
                  <span className={styles.detailValue} style={{ color: "#e8a87c" }}>${appointment.service.price}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {canModify && view === "details" && (
              <div className={styles.actions}>
                <button className={styles.rescheduleBtn} onClick={() => setView("reschedule")}>
                  🔄 Reschedule
                </button>
                <button className={styles.cancelBtn} onClick={() => setView("cancel-confirm")}>
                  ✗ Cancel
                </button>
              </div>
            )}

            {/* Cancel Confirmation */}
            {view === "cancel-confirm" && (
              <div className={styles.confirmDialog}>
                <p>
                  Are you sure you want to <strong>cancel</strong> your{" "}
                  {appointment.service?.name || "appointment"} on {formatDate(appointment.start_time)}?
                </p>
                <div className={styles.confirmActions}>
                  <button className={styles.confirmYes} onClick={handleCancel} disabled={actionLoading}>
                    {actionLoading ? "Cancelling..." : "Yes, Cancel"}
                  </button>
                  <button className={styles.confirmNo} onClick={() => setView("details")}>
                    Keep Appointment
                  </button>
                </div>
              </div>
            )}

            {/* Past appointment message */}
            {isPast && appointment.status !== "cancelled" && (
              <p style={{ color: "#8b8b9e", fontSize: "0.85rem", textAlign: "center", marginTop: "1rem" }}>
                This appointment has already passed.
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <a href="/" className={styles.footerCta}>
            Powered by <strong>GlowUp</strong>
          </a>
        </div>
      </div>
    </div>
  );
}
