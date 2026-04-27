"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./calendar.module.css";
import type { Appointment, Client, Service, Staff } from "@/lib/types";

type FullAppointment = Appointment & { client?: Client; service?: Service; staff_member?: Staff };

const HOURS = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];
const SLOT_HEIGHT = 64;
const WORK_START = 9;
const WORK_END = 18; // 6 PM

export default function CalendarPage() {
  const { tenant } = useTenant();
  const [view, setView] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<FullAppointment[]>([]);
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFillCampaign, setShowFillCampaign] = useState(false);
  const [campaignMsg, setCampaignMsg] = useState("");
  const [campaignSending, setCampaignSending] = useState(false);
  const [campaignSent, setCampaignSent] = useState(false);
  const [selectedCampaignStaff, setSelectedCampaignStaff] = useState<string[]>([]);
  const [formData, setFormData] = useState({ client_id: "", service_id: "", staff_id: "", start_time: "", notes: "" });

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const dateStr = selectedDate.toISOString().split("T")[0];

    if (view === "day") {
      const [aptsRes, staffRes, svcRes, clientRes] = await Promise.all([
        queryData<FullAppointment[]>("appointments.list", { date: dateStr }),
        queryData<Staff[]>("staff.list"),
        queryData<Service[]>("services.list"),
        queryData<Client[]>("clients.list"),
      ]);
      setAppointments(aptsRes.data || []);
      setStaffMembers(staffRes.data || []);
      setServices(svcRes.data || []);
      setClients(clientRes.data || []);
    } else {
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      const [aptsRes, staffRes] = await Promise.all([
        queryData<FullAppointment[]>("appointments.list", {
          startDate: startOfWeek.toISOString(),
          endDate: endOfWeek.toISOString(),
        }),
        queryData<Staff[]>("staff.list"),
      ]);
      setAppointments(aptsRes.data || []);
      setStaffMembers(staffRes.data || []);
    }

    setLoading(false);
  }, [tenant, selectedDate, view]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getSlotPosition(startTime: string) {
    const date = new Date(startTime);
    const hourDecimal = date.getHours() + date.getMinutes() / 60;
    return (hourDecimal - 9) * SLOT_HEIGHT + 40; // offset for header
  }

  function getSlotHeight(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(hours * SLOT_HEIGHT, 32);
  }

  async function handleAddAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.start_time || !formData.service_id) return;

    const service = services.find(s => s.id === formData.service_id);
    const start = new Date(formData.start_time);
    const end = new Date(start.getTime() + (service?.duration_minutes || 60) * 60 * 1000);

    const { data } = await queryData<FullAppointment>("appointments.add", {
      client_id: formData.client_id || null,
      service_id: formData.service_id,
      staff_id: formData.staff_id || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "confirmed",
      total_price: service?.price || 0,
      notes: formData.notes || null,
    });

    if (data) {
      setAppointments(prev => [...prev, data]);
      setShowModal(false);
      setFormData({ client_id: "", service_id: "", staff_id: "", start_time: "", notes: "" });
    }
  }

  const dateLabel = (() => {
    if (view === "week") {
      const ws = new Date(selectedDate);
      ws.setDate(ws.getDate() - ws.getDay() + 1); // Monday
      const we = new Date(ws);
      we.setDate(we.getDate() + 6); // Sunday
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(ws)} – ${fmt(we)}, ${we.getFullYear()}`;
    }
    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  })();

  // ── Open Slot Detection ──
  function getOpenSlots(staffId: string) {
    const staffApts = appointments
      .filter(a => staffId === "unassigned" ? !a.staff_id : a.staff_id === staffId)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const slots: { start: number; end: number }[] = [];
    let cursor = WORK_START;

    for (const apt of staffApts) {
      const aptStart = new Date(apt.start_time).getHours() + new Date(apt.start_time).getMinutes() / 60;
      const aptEnd = new Date(apt.end_time).getHours() + new Date(apt.end_time).getMinutes() / 60;
      if (aptStart > cursor) {
        slots.push({ start: cursor, end: aptStart });
      }
      cursor = Math.max(cursor, aptEnd);
    }
    if (cursor < WORK_END) {
      slots.push({ start: cursor, end: WORK_END });
    }
    return slots;
  }

  function getUtilization(staffId: string) {
    const staffApts = appointments.filter(a =>
      staffId === "unassigned" ? !a.staff_id : a.staff_id === staffId
    );
    let bookedHours = 0;
    for (const apt of staffApts) {
      const start = new Date(apt.start_time);
      const end = new Date(apt.end_time);
      bookedHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }
    return Math.round((bookedHours / (WORK_END - WORK_START)) * 100);
  }

  function handleOpenSlotClick(staffId: string, hour: number) {
    const dateStr = selectedDate.toISOString().split("T")[0];
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    setFormData({
      client_id: "",
      service_id: "",
      staff_id: staffId === "unassigned" ? "" : staffId,
      start_time: `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      notes: "",
    });
    // Load services + clients if not loaded
    if (services.length === 0 || clients.length === 0) {
      Promise.all([
        queryData<Service[]>("services.list"),
        queryData<Client[]>("clients.list"),
      ]).then(([svcRes, clientRes]) => {
        setServices((svcRes.data || []).filter(s => s.is_active));
        setClients(clientRes.data || []);
      });
    }
    setShowModal(true);
  }

  function formatHour(h: number) {
    const hour = Math.floor(h);
    const min = Math.round((h - hour) * 60);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  }

  // Get week data for week view
  const weekStart = new Date(selectedDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Calendar</h1>
          <p>{dateLabel}</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.navBtns}>
            <button className="btn btn-ghost" onClick={() => changeDate(view === "week" ? -7 : -1)}>←</button>
            <button className="btn btn-ghost" onClick={() => setSelectedDate(new Date())}>Today</button>
            <button className="btn btn-ghost" onClick={() => changeDate(view === "week" ? 7 : 1)}>→</button>
          </div>
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === "day" ? styles.activeView : ""}`} onClick={() => setView("day")}>Day</button>
            <button className={`${styles.viewBtn} ${view === "week" ? styles.activeView : ""}`} onClick={() => setView("week")}>Week</button>
          </div>
          <button className="btn btn-primary" onClick={() => {
            const dateStr = selectedDate.toISOString().split("T")[0];
            setFormData({ ...formData, start_time: `${dateStr}T09:00` });
            setShowModal(true);
          }}>+ New Appointment</button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading calendar...</div>
      ) : view === "day" ? (
        <div className={styles.dayView}>
          {/* ── Availability Summary Bar ── */}
          <div className={styles.availSummary}>
            <div className={styles.availHeader}>
              <h3 className={styles.availTitle}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Staff Availability
              </h3>
              <button
                className={`btn ${styles.fillCampaignBtn}`}
                onClick={() => {
                  // Pre-select all staff
                  const allIds = staffMembers.map(s => s.id);
                  setSelectedCampaignStaff(allIds);
                  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                  const allOpen = staffMembers.map(s => {
                    const slots = getOpenSlots(s.id);
                    return slots.map(sl => `${s.name}: ${formatHour(sl.start)}–${formatHour(sl.end)}`).join(", ");
                  }).filter(Boolean).join("\n");
                  setCampaignMsg(`Hey {name}! 🌟 We have last-minute openings ${dateLabel}! Book now and get 10% off.\n\nAvailable slots:\n${allOpen}\n\nBook now → {booking_link}`);
                  setCampaignSent(false);
                  setShowFillCampaign(true);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Fill My Openings
              </button>
            </div>
            <div className={styles.availBars}>
              {(staffMembers.length > 0 ? staffMembers : [{ id: "unassigned", name: "Unassigned" } as Staff]).map((staff) => {
                const util = getUtilization(staff.id);
                const openSlots = getOpenSlots(staff.id);
                const openHours = openSlots.reduce((sum, s) => sum + (s.end - s.start), 0);
                return (
                  <div key={staff.id} className={styles.availItem}>
                    <div className={styles.availInfo}>
                      <span className={styles.availName}>{staff.name}</span>
                      <span className={styles.availPct}>{util}% booked</span>
                    </div>
                    <div className={styles.availBarTrack}>
                      <div
                        className={`${styles.availBarFill} ${util >= 80 ? styles.availHigh : util >= 40 ? styles.availMed : styles.availLow}`}
                        style={{ width: `${util}%` }}
                      />
                    </div>
                    <span className={styles.availOpen}>{openHours.toFixed(1)}h open</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Staff Columns ── */}
          <div className={styles.techColumns} style={{ gridTemplateColumns: `repeat(${Math.max(staffMembers.length, 1)}, 1fr)` }}>
            {(staffMembers.length > 0 ? staffMembers : [{ id: "unassigned", name: "Unassigned" } as Staff]).map((staff) => {
              const staffApts = appointments.filter(a =>
                staff.id === "unassigned" ? !a.staff_id : a.staff_id === staff.id
              );
              const openSlots = getOpenSlots(staff.id);
              const util = getUtilization(staff.id);
              return (
                <div key={staff.id} className={styles.techColumn}>
                  <div className={styles.techHeader}>
                    <div className={styles.techAvatar}>{staff.name[0]}</div>
                    <div className={styles.techMeta}>
                      <span>{staff.name}</span>
                      <span className={`${styles.techUtil} ${util >= 80 ? styles.utilHigh : util >= 40 ? styles.utilMed : styles.utilLow}`}>
                        {util}% booked
                      </span>
                    </div>
                  </div>
                  <div className={styles.timeGrid}>
                    {HOURS.map((h) => (
                      <div key={h} className={styles.timeSlot}>
                        <span className={styles.timeLabel}>{h}</span>
                        <div className={styles.slotLine} />
                      </div>
                    ))}
                    {/* Open slot highlights */}
                    {openSlots.map((slot, i) => (
                      <div
                        key={`open-${i}`}
                        className={styles.openSlot}
                        style={{
                          top: `${(slot.start - WORK_START) * SLOT_HEIGHT + 40}px`,
                          height: `${(slot.end - slot.start) * SLOT_HEIGHT}px`,
                        }}
                        onClick={() => handleOpenSlotClick(staff.id, slot.start)}
                        title={`Open: ${formatHour(slot.start)} – ${formatHour(slot.end)} • Click to fill`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Fill Slot</span>
                        <small>{formatHour(slot.start)} – {formatHour(slot.end)}</small>
                      </div>
                    ))}
                    {/* Appointment blocks */}
                    {staffApts.map((apt) => (
                      <div
                        key={apt.id}
                        className={styles.appointment}
                        style={{
                          top: `${getSlotPosition(apt.start_time)}px`,
                          height: `${getSlotHeight(apt.start_time, apt.end_time)}px`,
                          borderLeftColor: apt.status === "confirmed" ? "var(--color-primary)" : apt.status === "completed" ? "var(--color-success)" : "var(--color-warning)",
                        }}
                      >
                        <span className={styles.aptClient}>
                          {apt.client ? `${apt.client.first_name} ${apt.client.last_name || ""}` : "Walk-in"}
                        </span>
                        <span className={styles.aptService}>{apt.service?.name || "Service"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.weekView}>
          <div className={styles.weekGrid}>
            {weekDays.map((day) => {
              const dayStr = day.toISOString().split("T")[0];
              const dayApts = appointments.filter(a => a.start_time.startsWith(dayStr));
              const isToday = dayStr === new Date().toISOString().split("T")[0];
              return (
                <div key={dayStr} className={`${styles.weekDay} ${isToday ? styles.todayCol : ""}`}>
                  <div className={styles.weekDayHeader}>
                    <span className={styles.weekDayName}>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
                    <span className={`${styles.weekDate} ${isToday ? styles.todayDate : ""}`}>{day.getDate()}</span>
                  </div>
                  <div className={styles.weekBookingCount}>
                    <span className={styles.bookingNum}>{dayApts.length}</span>
                    <span className={styles.bookingLabel}>bookings</span>
                  </div>
                  <div className={styles.weekSlots}>
                    {dayApts.map((apt, j) => (
                      <div key={apt.id} className={styles.weekSlot} style={{ background: j % 2 === 0 ? "var(--color-primary-100)" : "rgba(212, 160, 232, 0.2)" }}>
                        <small>{apt.client ? apt.client.first_name : "Walk-in"}</small>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Appointment Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>New Appointment</h2>
            <form onSubmit={handleAddAppointment}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className="label">Client</label>
                  <select className="input" value={formData.client_id} onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}>
                    <option value="">Walk-in</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ""}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Service *</label>
                  <select className="input" value={formData.service_id} onChange={(e) => setFormData({ ...formData, service_id: e.target.value })} required>
                    <option value="">Select service...</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price} ({s.duration_minutes}min)</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Staff</label>
                  <select className="input" value={formData.staff_id} onChange={(e) => setFormData({ ...formData, staff_id: e.target.value })}>
                    <option value="">Any available</option>
                    {staffMembers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Date & Time *</label>
                  <input className="input" type="datetime-local" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} required />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Book Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Fill My Openings Campaign Modal ── */}
      {showFillCampaign && (
        <div className={styles.modalOverlay} onClick={() => setShowFillCampaign(false)}>
          <div className={`${styles.modal} ${styles.campaignModal}`} onClick={(e) => e.stopPropagation()}>
            {campaignSent ? (
              <div className={styles.campaignSuccess}>
                <div className={styles.successIcon}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </div>
                <h2>Campaign Sent! 🎉</h2>
                <p>Your &ldquo;Fill My Openings&rdquo; blast has been queued for delivery to your recent clients.</p>
                <button className="btn btn-primary" onClick={() => setShowFillCampaign(false)}>Close</button>
              </div>
            ) : (
              <>
                <div className={styles.campaignHeader}>
                  <div className={styles.campaignIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </div>
                  <div>
                    <h2>Fill My Openings</h2>
                    <p className={styles.campaignSubtitle}>Send a last-minute promo to clients with available slots</p>
                  </div>
                </div>

                {/* Staff Selector */}
                <div className={styles.campaignSlots}>
                  <div className={styles.staffSelectorHeader}>
                    <h4>Select Staff</h4>
                    <button
                      type="button"
                      className={styles.selectAllBtn}
                      onClick={() => {
                        if (selectedCampaignStaff.length === staffMembers.length) {
                          setSelectedCampaignStaff([]);
                        } else {
                          setSelectedCampaignStaff(staffMembers.map(s => s.id));
                        }
                      }}
                    >
                      {selectedCampaignStaff.length === staffMembers.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <div className={styles.staffCheckboxes}>
                    {staffMembers.map((staff) => {
                      const isSelected = selectedCampaignStaff.includes(staff.id);
                      const openSlots = getOpenSlots(staff.id);
                      const openHours = openSlots.reduce((sum, s) => sum + (s.end - s.start), 0);
                      return (
                        <label
                          key={staff.id}
                          className={`${styles.staffCheckbox} ${isSelected ? styles.staffChecked : ""}`}
                          onClick={() => {
                            setSelectedCampaignStaff(prev =>
                              prev.includes(staff.id)
                                ? prev.filter(id => id !== staff.id)
                                : [...prev, staff.id]
                            );
                          }}
                        >
                          <div className={styles.staffCheckIcon}>
                            {isSelected ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : (
                              <div className={styles.uncheckedBox} />
                            )}
                          </div>
                          <div className={styles.staffCheckAvatar}>{staff.name[0]}</div>
                          <div className={styles.staffCheckInfo}>
                            <span className={styles.staffCheckName}>{staff.name}</span>
                            <span className={styles.staffCheckSlots}>
                              {openSlots.length} open slot{openSlots.length !== 1 ? "s" : ""} · {openHours.toFixed(1)}h
                            </span>
                          </div>
                        </label>
                      );
                    })}
                    {staffMembers.length === 0 && (
                      <span className={styles.noSlots}>No staff members configured</span>
                    )}
                  </div>
                </div>

                {/* Open Slots Preview (filtered) */}
                {selectedCampaignStaff.length > 0 && (
                  <div className={styles.campaignSlots}>
                    <h4>Open Slots to Advertise</h4>
                    <div className={styles.slotChips}>
                      {staffMembers.filter(s => selectedCampaignStaff.includes(s.id)).map((staff) => {
                        const openSlots = getOpenSlots(staff.id);
                        return openSlots.map((slot, i) => (
                          <div key={`${staff.id}-${i}`} className={styles.slotChip}>
                            <strong>{staff.name}</strong>
                            <span>{formatHour(slot.start)} – {formatHour(slot.end)}</span>
                          </div>
                        ));
                      })}
                    </div>
                  </div>
                )}

                {/* Message Editor */}
                <div className={styles.formGroup}>
                  <label className="label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Message Preview
                  </label>
                  <textarea
                    className="input"
                    rows={12}
                    value={campaignMsg}
                    onChange={(e) => setCampaignMsg(e.target.value)}
                    style={{ fontFamily: "monospace", fontSize: "13px", lineHeight: "1.5" }}
                  />
                  <small style={{ color: "var(--text-tertiary)", marginTop: "4px" }}>
                    Use {"{name}"} for client name, {"{booking_link}"} for online booking link
                  </small>
                </div>

                {/* Channel Selection */}
                <div className={styles.campaignChannels}>
                  <label className={`${styles.channelOption} ${styles.channelActive}`}>
                    <input type="checkbox" defaultChecked />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    SMS
                  </label>
                  <label className={styles.channelOption}>
                    <input type="checkbox" defaultChecked />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    Email
                  </label>
                </div>

                {/* Target Audience */}
                <div className={styles.campaignAudience}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <span>Sending to <strong>{clients.length || "all"}</strong> clients who visited in the last 90 days</span>
                </div>

                <div className={styles.modalActions}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowFillCampaign(false)}>Cancel</button>
                  <button
                    className={`btn btn-primary ${styles.sendBtn}`}
                    disabled={campaignSending}
                    onClick={async () => {
                      setCampaignSending(true);
                      // Save campaign via API
                      await queryData("campaigns.add", {
                        name: `Fill Openings - ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
                        type: "promo",
                        message_template: campaignMsg,
                        target_audience: "recent_90_days",
                        channel: "sms",
                        status: "sent",
                        sent_at: new Date().toISOString(),
                        estimated_reach: clients.length || 0,
                      });
                      setCampaignSending(false);
                      setCampaignSent(true);
                    }}
                  >
                    {campaignSending ? (
                      <>
                        <span className={styles.spinner} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Send Campaign
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
