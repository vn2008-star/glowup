"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./calendar.module.css";
import type { Appointment, Client, Service, Staff } from "@/lib/types";

type FullAppointment = Appointment & { client?: Client; service?: Service; staff_member?: Staff };

const HOURS = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];
const SLOT_HEIGHT = 64;

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

  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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
            <button className="btn btn-ghost" onClick={() => changeDate(-1)}>←</button>
            <button className="btn btn-ghost" onClick={() => setSelectedDate(new Date())}>Today</button>
            <button className="btn btn-ghost" onClick={() => changeDate(1)}>→</button>
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
          <div className={styles.techColumns}>
            {(staffMembers.length > 0 ? staffMembers : [{ id: "unassigned", name: "Unassigned" } as Staff]).map((staff) => {
              const staffApts = appointments.filter(a =>
                staff.id === "unassigned" ? !a.staff_id : a.staff_id === staff.id
              );
              return (
                <div key={staff.id} className={styles.techColumn}>
                  <div className={styles.techHeader}>
                    <div className={styles.techAvatar}>{staff.name[0]}</div>
                    <span>{staff.name}</span>
                  </div>
                  <div className={styles.timeGrid}>
                    {HOURS.map((h) => (
                      <div key={h} className={styles.timeSlot}>
                        <span className={styles.timeLabel}>{h}</span>
                        <div className={styles.slotLine} />
                      </div>
                    ))}
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
    </div>
  );
}
