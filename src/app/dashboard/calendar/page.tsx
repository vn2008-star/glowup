"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./calendar.module.css";
import type { Appointment, Client, Service, Staff } from "@/lib/types";

type FullAppointment = Appointment & { client?: Client; service?: Service; staff_member?: Staff };


const SLOT_HEIGHT = 60;
const DEFAULT_WORK_START = 9;
const DEFAULT_WORK_END = 18;

export default function CalendarPage() {
  const { tenant } = useTenant();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<FullAppointment[]>([]);
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ client_id: "", service_id: "", staff_id: "", start_time: "", notes: "" });
  const [selectedApt, setSelectedApt] = useState<FullAppointment | null>(null);
  const [editingApt, setEditingApt] = useState<FullAppointment | null>(null);
  const [activeStaffFilter, setActiveStaffFilter] = useState<string[]>([]);

  // ── Date helpers ──
  function toDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const today = new Date();

  // ── Computed ranges ──
  const weekStart = new Date(selectedDate);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Month grid (6 weeks)
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthGridStart = new Date(monthStart);
  monthGridStart.setDate(monthGridStart.getDate() - ((monthGridStart.getDay() + 6) % 7)); // Mon before 1st
  const monthDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(monthGridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // ── Dynamic time grid range (expand if appointments outside default hours) ──
  const { WORK_START, WORK_END, HOURS } = (() => {
    let earliest = DEFAULT_WORK_START;
    let latest = DEFAULT_WORK_END;
    for (const apt of appointments) {
      const s = new Date(apt.start_time);
      const e = new Date(apt.end_time);
      const sH = s.getHours();
      const eH = e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
      if (sH < earliest) earliest = sH;
      if (eH > latest) latest = eH;
    }
    const ws = earliest;
    const we = Math.min(latest, 23);
    return {
      WORK_START: ws,
      WORK_END: we,
      HOURS: Array.from({ length: we - ws }, (_, i) => i + ws),
    };
  })();

  // ── Data fetching (optimized: staff/services/clients cached, only apts refresh) ──
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Fetch staff, services, clients once
  useEffect(() => {
    if (!tenant) return;
    Promise.all([
      queryData<Staff[]>("staff.list"),
      queryData<Service[]>("services.list"),
      queryData<Client[]>("clients.list"),
    ]).then(([staffRes, svcRes, clientRes]) => {
      setStaffMembers(staffRes.data || []);
      setServices((svcRes.data || []).filter(s => s.is_active));
      setClients(clientRes.data || []);
    });
  }, [tenant]);

  // Build timezone-aware ISO boundaries for a local date
  function localDayStart(d: Date) {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  }
  function localDayEnd(d: Date) {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy.toISOString();
  }

  // Fetch appointments on date/view change
  const fetchAppointments = useCallback(async () => {
    if (!tenant) return;
    if (!initialLoaded) setLoading(true);

    let startISO: string, endISO: string;

    if (view === "day") {
      startISO = localDayStart(selectedDate);
      endISO = localDayEnd(selectedDate);
    } else if (view === "week") {
      const ws = new Date(selectedDate);
      ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      startISO = localDayStart(ws);
      endISO = localDayEnd(we);
    } else {
      startISO = localDayStart(monthDays[0]);
      endISO = localDayEnd(monthDays[41]);
    }

    const aptsRes = await queryData<FullAppointment[]>("appointments.list", { startDate: startISO, endDate: endISO });
    setAppointments(aptsRes.data || []);
    setLoading(false);
    setInitialLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, selectedDate, view]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // ── Navigation ──
  function changeDate(delta: number) {
    const d = new Date(selectedDate);
    if (view === "month") {
      d.setMonth(d.getMonth() + delta);
    } else if (view === "week") {
      d.setDate(d.getDate() + delta * 7);
    } else {
      d.setDate(d.getDate() + delta);
    }
    setSelectedDate(d);
  }

  const dateLabel = (() => {
    if (view === "month") {
      return selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (view === "week") {
      const we = new Date(weekStart);
      we.setDate(we.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(weekStart)} – ${fmt(we)}, ${we.getFullYear()}`;
    }
    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  })();

  // ── Day view helpers ──
  function getSlotPosition(startTime: string) {
    const date = new Date(startTime);
    const hourDecimal = date.getHours() + date.getMinutes() / 60;
    return (hourDecimal - WORK_START) * SLOT_HEIGHT;
  }

  function getSlotHeight(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(hours * SLOT_HEIGHT, 28);
  }

  function formatHour(h: number) {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12} ${ampm}`;
  }

  function getUtilization(staffId: string) {
    const dateStr = toDateStr(selectedDate);
    const staffApts = appointments.filter(a => {
      const match = staffId === "unassigned" ? !a.staff_id : a.staff_id === staffId;
      return match && a.start_time.startsWith(dateStr);
    });
    let bookedHours = 0;
    for (const apt of staffApts) {
      const start = new Date(apt.start_time);
      const end = new Date(apt.end_time);
      bookedHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }
    return Math.round((bookedHours / (WORK_END - WORK_START)) * 100);
  }

  function getOpenSlots(staffId: string) {
    const dateStr = toDateStr(selectedDate);
    const staffApts = appointments
      .filter(a => {
        const match = staffId === "unassigned" ? !a.staff_id : a.staff_id === staffId;
        return match && a.start_time.startsWith(dateStr);
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const slots: { start: number; end: number }[] = [];
    let cursor = WORK_START;
    for (const apt of staffApts) {
      const aptStart = new Date(apt.start_time).getHours() + new Date(apt.start_time).getMinutes() / 60;
      const aptEnd = new Date(apt.end_time).getHours() + new Date(apt.end_time).getMinutes() / 60;
      if (aptStart > cursor) slots.push({ start: cursor, end: aptStart });
      cursor = Math.max(cursor, aptEnd);
    }
    if (cursor < WORK_END) slots.push({ start: cursor, end: WORK_END });
    return slots;
  }

  // ── Appointment status colors ──
  function aptColor(status: string) {
    switch (status) {
      case "confirmed": return "var(--color-primary)";
      case "completed": return "var(--color-success)";
      case "cancelled": return "var(--color-danger)";
      default: return "var(--color-warning)";
    }
  }

  // ── Add appointment ──
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

  function openNewAppointment(date?: Date, hour?: number) {
    const d = date || selectedDate;
    const h = hour ?? 9;
    const dateStr = toDateStr(d);
    setFormData({ client_id: "", service_id: "", staff_id: "", start_time: `${dateStr}T${String(h).padStart(2, "0")}:00`, notes: "" });
    setShowModal(true);
  }

  // ── Appointments for a specific day (timezone-safe) ──
  function aptsForDay(day: Date) {
    return appointments.filter(a => {
      const aptDate = new Date(a.start_time);
      return aptDate.getFullYear() === day.getFullYear()
        && aptDate.getMonth() === day.getMonth()
        && aptDate.getDate() === day.getDate();
    });
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1>Calendar</h1>
          <div className={styles.dateNav}>
            <button className={styles.navBtn} onClick={() => changeDate(-1)} title={view === "month" ? "Previous month" : view === "week" ? "Previous week" : "Previous day"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className={styles.dateLabel}>{dateLabel}</span>
            <button className={styles.navBtn} onClick={() => changeDate(1)} title={view === "month" ? "Next month" : view === "week" ? "Next week" : "Next day"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
            </button>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.todayBtn} onClick={() => { setSelectedDate(new Date()); setView("day"); }}>Today</button>
          <div className={styles.viewToggle}>
            {(["day", "week", "month"] as const).map(v => (
              <button key={v} className={`${styles.viewBtn} ${view === v ? styles.activeView : ""}`} onClick={() => setView(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => openNewAppointment()}>+ New Appointment</button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <span>Loading calendar...</span>
        </div>
      ) : view === "day" ? (
        /* ════════════════ DAY VIEW ════════════════ */
        <div className={styles.dayView}>
          {/* Availability Summary */}
          <div className={styles.availSummary}>
            <h3 className={styles.availTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Staff Availability
            </h3>
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

          {/* Staff Columns */}
          <div className={styles.techColumns} style={{ gridTemplateColumns: `repeat(${Math.max(staffMembers.length, 1)}, 1fr)` }}>
            {(staffMembers.length > 0 ? staffMembers : [{ id: "unassigned", name: "Unassigned" } as Staff]).map((staff) => {
              const staffApts = appointments.filter(a =>
                staff.id === "unassigned" ? !a.staff_id : a.staff_id === staff.id
              );
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
                        <span className={styles.timeLabel}>{formatHour(h)}</span>
                        <div className={styles.slotLine} />
                      </div>
                    ))}
                    {/* Open slot highlights */}
                    {getOpenSlots(staff.id).map((slot, i) => (
                      <div
                        key={`open-${i}`}
                        className={styles.openSlot}
                        style={{
                          top: `${(slot.start - WORK_START) * SLOT_HEIGHT}px`,
                          height: `${(slot.end - slot.start) * SLOT_HEIGHT}px`,
                        }}
                        onClick={() => {
                          const dateStr = toDateStr(selectedDate);
                          const h = Math.floor(slot.start);
                          setFormData({ client_id: "", service_id: "", staff_id: staff.id === "unassigned" ? "" : staff.id, start_time: `${dateStr}T${String(h).padStart(2, "0")}:00`, notes: "" });
                          setShowModal(true);
                        }}
                        title={`Open: ${formatHour(slot.start)} – ${formatHour(slot.end)}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Fill Slot</span>
                      </div>
                    ))}
                    {/* Appointment blocks */}
                    {staffApts.map((apt) => (
                      <div
                        key={apt.id}
                        className={styles.aptBlock}
                        style={{
                          top: `${getSlotPosition(apt.start_time)}px`,
                          height: `${getSlotHeight(apt.start_time, apt.end_time)}px`,
                          borderLeftColor: aptColor(apt.status),
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedApt(apt)}
                      >
                        <span className={styles.aptClient}>
                          {apt.client ? `${apt.client.first_name} ${apt.client.last_name || ""}` : "Walk-in"}
                        </span>
                        <span className={styles.aptService}>{apt.service?.name || "Service"}</span>
                        <span className={styles.aptTime}>
                          {new Date(apt.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "week" ? (() => {
        /* ════════════════ WEEK VIEW (Time Grid) ════════════════ */
        // Staff color palette
        const STAFF_COLORS = [
          "#a87cc4", "#d4788e", "#3a9e97", "#c5a035", "#5c8fd6",
          "#e07b53", "#6dba7a", "#9b6fc2", "#d6a74a", "#58b4d1",
        ];
        const staffColorMap: Record<string, string> = {};
        staffMembers.forEach((s, i) => {
          staffColorMap[s.id] = STAFF_COLORS[i % STAFF_COLORS.length];
        });
        const getStaffColor = (staffId?: string | null) => staffId && staffColorMap[staffId] ? staffColorMap[staffId] : "var(--text-tertiary)";
        const getStaffName = (staffId?: string | null) => staffMembers.find(s => s.id === staffId)?.name || "Unassigned";

        // Filter appointments by active staff filter
        const visibleApts = activeStaffFilter.length === 0
          ? appointments
          : appointments.filter(a => a.staff_id && activeStaffFilter.includes(a.staff_id));

        // Overlap grouping: assign column index & total columns for each apt in a day
        function layoutOverlaps(apts: FullAppointment[]) {
          if (apts.length === 0) return [];
          const sorted = [...apts].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
          const result: { apt: FullAppointment; col: number; totalCols: number }[] = [];
          const groups: FullAppointment[][] = [];
          let currentGroup: FullAppointment[] = [];
          let currentGroupEnd = 0;
          for (const apt of sorted) {
            const aptStart = new Date(apt.start_time).getTime();
            const aptEnd = new Date(apt.end_time).getTime();
            if (currentGroup.length === 0 || aptStart < currentGroupEnd) {
              currentGroup.push(apt);
              currentGroupEnd = Math.max(currentGroupEnd, aptEnd);
            } else {
              groups.push(currentGroup);
              currentGroup = [apt];
              currentGroupEnd = aptEnd;
            }
          }
          if (currentGroup.length > 0) groups.push(currentGroup);
          for (const group of groups) {
            const totalCols = group.length;
            group.forEach((apt, col) => result.push({ apt, col, totalCols }));
          }
          return result;
        }

        return (
        <div className={styles.weekView}>
          {/* Staff Filter Toggle */}
          {staffMembers.length > 1 && (
            <div className={styles.staffFilter}>
              <button
                className={`${styles.staffFilterBtn} ${activeStaffFilter.length === 0 ? styles.staffFilterActive : ""}`}
                onClick={() => setActiveStaffFilter([])}
              >
                All Staff
              </button>
              {staffMembers.map(s => {
                const color = getStaffColor(s.id);
                const isActive = activeStaffFilter.includes(s.id);
                return (
                  <button
                    key={s.id}
                    className={`${styles.staffFilterBtn} ${isActive ? styles.staffFilterActive : ""}`}
                    style={isActive ? { background: `${color}18`, borderColor: color, color } : undefined}
                    onClick={() => {
                      setActiveStaffFilter(prev =>
                        prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                      );
                    }}
                  >
                    <span className={styles.staffFilterDot} style={{ background: color }} />
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className={styles.weekGrid}>
            {/* Time axis */}
            <div className={styles.weekTimeAxis}>
              <div className={styles.weekCorner} />
              {HOURS.map(h => (
                <div key={h} className={styles.weekTimeLabel} style={{ height: SLOT_HEIGHT }}>
                  {formatHour(h)}
                </div>
              ))}
            </div>
            {/* Day columns */}
            {weekDays.map((day) => {
              const isToday = isSameDay(day, today);
              const dayApts = visibleApts.filter(a => {
                const d = new Date(a.start_time);
                return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
              });
              const laid = layoutOverlaps(dayApts);
              return (
                <div key={toDateStr(day)} className={`${styles.weekCol} ${isToday ? styles.weekColToday : ""}`}>
                  <div className={`${styles.weekColHeader} ${isToday ? styles.weekColHeaderToday : ""}`}>
                    <span className={styles.weekDayName}>{day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</span>
                    <span className={`${styles.weekDayNum} ${isToday ? styles.weekDayNumToday : ""}`}>{day.getDate()}</span>
                  </div>
                  <div className={styles.weekColBody} style={{ height: HOURS.length * SLOT_HEIGHT }}>
                    {/* Hour lines */}
                    {HOURS.map((_, i) => (
                      <div
                        key={i}
                        className={styles.weekHourLine}
                        style={{ top: i * SLOT_HEIGHT }}
                        onClick={() => openNewAppointment(day, HOURS[i])}
                      />
                    ))}
                    {/* Appointment blocks — side-by-side with staff colors */}
                    {laid.map(({ apt, col, totalCols }) => {
                      const startD = new Date(apt.start_time);
                      const endD = new Date(apt.end_time);
                      const startH = startD.getHours() + startD.getMinutes() / 60;
                      const endH = endD.getHours() + endD.getMinutes() / 60;
                      const top = (startH - WORK_START) * SLOT_HEIGHT;
                      const height = Math.max((endH - startH) * SLOT_HEIGHT, 24);
                      const staffColor = getStaffColor(apt.staff_id);
                      const colWidth = 100 / totalCols;
                      const leftPct = col * colWidth;
                      return (
                        <div
                          key={apt.id}
                          className={styles.weekApt}
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 1px)`,
                            width: `calc(${colWidth}% - 2px)`,
                            borderLeftColor: staffColor,
                            background: `${staffColor}0c`,
                            cursor: "pointer",
                          }}
                          onClick={() => setSelectedApt(apt)}
                          title={`${getStaffName(apt.staff_id)} • ${apt.client ? apt.client.first_name : "Walk-in"}`}
                        >
                          <span className={styles.weekAptClient}>
                            {apt.client ? apt.client.first_name : "Walk-in"}
                          </span>
                          <span className={styles.weekAptTime}>
                            {startD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                          {totalCols <= 3 && (
                            <span className={styles.weekAptStaff} style={{ color: staffColor }}>
                              {getStaffName(apt.staff_id)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()
      : (
        /* ════════════════ MONTH VIEW ════════════════ */
        <div className={styles.monthView}>
          {/* Day-of-week headers */}
          <div className={styles.monthHeader}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className={styles.monthHeaderCell}>{d}</div>
            ))}
          </div>
          {/* Day grid */}
          <div className={styles.monthGrid}>
            {monthDays.map((day) => {
              const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
              const isToday = isSameDay(day, today);
              const dayApts = aptsForDay(day);
              const maxDots = 3;
              return (
                <div
                  key={toDateStr(day)}
                  className={`${styles.monthCell} ${!isCurrentMonth ? styles.monthCellOther : ""} ${isToday ? styles.monthCellToday : ""}`}
                  onClick={() => { setSelectedDate(day); setView("day"); }}
                >
                  <span className={`${styles.monthDayNum} ${isToday ? styles.monthDayNumToday : ""}`}>
                    {day.getDate()}
                  </span>
                  {dayApts.length > 0 && (
                    <div className={styles.monthDots}>
                      {dayApts.slice(0, maxDots).map((apt, i) => (
                        <div key={i} className={styles.monthDot} style={{ background: aptColor(apt.status) }} title={apt.client ? apt.client.first_name : "Walk-in"}>
                          <span className={styles.monthDotText}>
                            {apt.client ? apt.client.first_name : "Walk-in"}
                          </span>
                        </div>
                      ))}
                      {dayApts.length > maxDots && (
                        <span className={styles.monthMore}>+{dayApts.length - maxDots} more</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Appointment Detail Modal ── */}
      {selectedApt && (
        <div className={styles.modalOverlay} onClick={() => setSelectedApt(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h2>Appointment Details</h2>
              <button className={styles.detailClose} onClick={() => setSelectedApt(null)}>✕</button>
            </div>
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Client</span>
                <span className={styles.detailValue}>
                  {selectedApt.client ? `${selectedApt.client.first_name} ${selectedApt.client.last_name || ""}` : "Walk-in"}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Service</span>
                <span className={styles.detailValue}>{selectedApt.service?.name || "—"}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Staff</span>
                <span className={styles.detailValue}>{selectedApt.staff_member?.name || "Unassigned"}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Date & Time</span>
                <span className={styles.detailValue}>
                  {new Date(selectedApt.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{" "}
                  {new Date(selectedApt.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {" – "}
                  {new Date(selectedApt.end_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status</span>
                <span className={`${styles.detailStatus} ${styles[`status_${selectedApt.status}`]}`}>
                  {selectedApt.status.charAt(0).toUpperCase() + selectedApt.status.slice(1)}
                </span>
              </div>
              {selectedApt.total_price != null && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Price</span>
                  <span className={styles.detailValue}>${Number(selectedApt.total_price).toFixed(2)}</span>
                </div>
              )}
              {selectedApt.notes && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Notes</span>
                  <span className={styles.detailValue}>{selectedApt.notes}</span>
                </div>
              )}
            </div>
            <div className={styles.detailActions}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const apt = selectedApt;
                  const startLocal = new Date(apt.start_time);
                  const dateStr = toDateStr(startLocal);
                  const timeStr = `${String(startLocal.getHours()).padStart(2, "0")}:${String(startLocal.getMinutes()).padStart(2, "0")}`;
                  setEditingApt(apt);
                  setFormData({
                    client_id: apt.client_id || "",
                    service_id: apt.service_id || "",
                    staff_id: apt.staff_id || "",
                    start_time: `${dateStr}T${timeStr}`,
                    notes: apt.notes || "",
                  });
                  setSelectedApt(null);
                  setShowModal(true);
                }}
              >
                ✏️ Edit
              </button>
              <button
                className={styles.deleteBtn}
                onClick={async () => {
                  if (!confirm("Delete this appointment?")) return;
                  await queryData("appointments.delete", { id: selectedApt.id });
                  setAppointments(prev => prev.filter(a => a.id !== selectedApt.id));
                  setSelectedApt(null);
                }}
              >
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New / Edit Appointment Modal ── */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowModal(false); setEditingApt(null); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{editingApt ? "Edit Appointment" : "New Appointment"}</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (editingApt) {
                // Update existing
                const service = services.find(s => s.id === formData.service_id);
                const start = new Date(formData.start_time);
                const end = new Date(start.getTime() + (service?.duration_minutes || 60) * 60000);
                const res = await queryData<FullAppointment>("appointments.update", {
                  id: editingApt.id,
                  client_id: formData.client_id || null,
                  service_id: formData.service_id,
                  staff_id: formData.staff_id || null,
                  start_time: start.toISOString(),
                  end_time: end.toISOString(),
                  total_price: service?.price || 0,
                  notes: formData.notes || null,
                });
                if (res.data) {
                  const updated = res.data as FullAppointment;
                  setAppointments(prev => prev.map(a => a.id === editingApt.id ? updated : a));
                }
              } else {
                await handleAddAppointment(e);
                return;
              }
              setShowModal(false);
              setEditingApt(null);
              setFormData({ client_id: "", service_id: "", staff_id: "", start_time: "", notes: "" });
            }}>
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
                  <label className="label">Date *</label>
                  <input className="input" type="date" value={formData.start_time.split("T")[0] || ""} onChange={(e) => {
                    const time = formData.start_time.split("T")[1] || "09:00";
                    setFormData({ ...formData, start_time: `${e.target.value}T${time}` });
                  }} required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Time *</label>
                  <input className="input" type="time" value={formData.start_time.split("T")[1] || ""} onChange={(e) => {
                    const date = formData.start_time.split("T")[0] || toDateStr(selectedDate);
                    setFormData({ ...formData, start_time: `${date}T${e.target.value}` });
                  }} required />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingApt(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingApt ? "Update Appointment" : "Book Appointment"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
