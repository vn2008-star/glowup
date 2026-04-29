"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./campaigns.module.css";
import type { Campaign, Staff, Appointment, Client } from "@/lib/types";

const CAMPAIGN_TYPES = [
  { value: "birthday", label: "Birthday", color: "badge-primary" },
  { value: "win_back", label: "Win-Back", color: "badge-danger" },
  { value: "rebooking", label: "Rebooking", color: "badge-success" },
  { value: "review", label: "Review Request", color: "badge-info" },
  { value: "promo", label: "Promotion", color: "badge-warning" },
  { value: "referral", label: "Referral", color: "badge-primary" },
  { value: "holiday", label: "Holiday", color: "badge-danger" },
  { value: "fill_openings", label: "Fill My Openings", color: "badge-accent" },
];

const DEFAULT_TEMPLATES: Record<string, string> = {
  birthday: "Happy Birthday, {name}! 🎂 Enjoy 20% off any service this month. Book now →",
  win_back: "Hey {name}! It's been a while. We'd love to see you again — here's $10 off your next visit ❤️",
  rebooking: "Time for a refresh! Your last {service} was {days} days ago. Book your next appointment →",
  review: "Thanks for visiting, {name}! 🌟 We'd love a quick review — it means the world to us.",
  promo: "Special offer this week! {details}. Limited spots available. Book now →",
  referral: "Love your look? Share the glow! ✨ Refer a friend and you both get $15 off.",
  holiday: "🌹 {holiday} Special! Treat yourself or someone you love. Book now and get {details}.",
};

/* ─── Holiday Calendar ─── */
interface HolidayInfo {
  name: string;
  emoji: string;
  month: number; // 0-indexed
  day: number;
  template: string;
  promoIdea: string;
}

const HOLIDAYS: HolidayInfo[] = [
  { name: "Valentine's Day", emoji: "💖", month: 1, day: 14, template: "💖 Valentine's Day Special! Look & feel amazing for your date. 15% off any service this week. Book now →", promoIdea: "Couples packages, date-night glam, gift cards, pampering bundles" },
  { name: "International Women's Day", emoji: "💜", month: 2, day: 8, template: "💜 Happy Women's Day, {name}! Celebrate YOU with a self-care session. 20% off this week only →", promoIdea: "Self-care packages, group bookings, squad deals, wellness bundles" },
  { name: "Mother's Day", emoji: "🌹", month: 4, day: 11, template: "🌹 Mother's Day Special! Give Mom the gift of pampering. Gift cards + 15% off spa & beauty packages →", promoIdea: "Gift cards, mother-daughter packages, spa bundles, relaxation treats" },
  { name: "Memorial Day", emoji: "🇺🇸", month: 4, day: 26, template: "🇺🇸 Memorial Day Sale! Get summer-ready. 20% off all services this weekend →", promoIdea: "Summer-ready specials, weekend flash sales, seasonal treatments" },
  { name: "4th of July", emoji: "🎆", month: 6, day: 4, template: "🎆 4th of July Glow-Up! Get party-ready with our holiday special. {details} →", promoIdea: "Festive styling, summer glow packages, group party prep" },
  { name: "Back to School", emoji: "🎒", month: 7, day: 15, template: "🎒 Back to School Special! Start the year fresh with a new look. Student discount: 15% off →", promoIdea: "Student discounts, fresh-start packages, new-look specials" },
  { name: "Halloween", emoji: "🎃", month: 9, day: 31, template: "🎃 Halloween Glam! Get costume-ready with our spooky season specials. Book now →", promoIdea: "Themed styling, costume-ready looks, group rates, special effects" },
  { name: "Thanksgiving", emoji: "🦃", month: 10, day: 27, template: "🦃 Look stunning for Thanksgiving! Book your holiday session. Family discounts available →", promoIdea: "Family packages, pre-holiday styling, gift cards, group bookings" },
  { name: "Black Friday", emoji: "💰", month: 10, day: 28, template: "💰 Black Friday DEAL! Our biggest sale of the year. Up to 30% off services + bonus gift cards →", promoIdea: "Flash sales, bundle deals, buy-one-get-one gift cards, VIP packages" },
  { name: "Christmas", emoji: "🎄", month: 11, day: 25, template: "🎄 Holiday Glow! Get party-ready for the season. Gift cards make the perfect present 🎁 Book now →", promoIdea: "Gift cards, holiday party prep, pampering packages, wellness gifts" },
  { name: "New Year's Eve", emoji: "🎉", month: 11, day: 31, template: "🎉 New Year's Glow-Up! Ring in the new year looking & feeling amazing. Limited spots available →", promoIdea: "NYE glam packages, last-minute appointments, fresh-start specials" },
];

function getUpcomingHolidays(): (HolidayInfo & { date: Date; daysUntil: number })[] {
  const now = new Date();
  const year = now.getFullYear();
  return HOLIDAYS.map(h => {
    let date = new Date(year, h.month, h.day);
    if (date < now) date = new Date(year + 1, h.month, h.day);
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...h, date, daysUntil };
  }).sort((a, b) => a.daysUntil - b.daysUntil);
}

const AUTOMATIONS_CONFIG = [
  { key: "auto_birthday", name: "Birthday Auto-Send", trigger: "7 days before birthday", channel: "SMS + Email" },
  { key: "auto_rebooking", name: "Rebooking Reminder", trigger: "Based on service cycle", channel: "SMS" },
  { key: "auto_noshow", name: "No-Show Follow-Up", trigger: "1 hour after missed appt", channel: "SMS" },
  { key: "auto_review", name: "Review Request", trigger: "2 hours after service", channel: "SMS" },
  { key: "auto_loyalty", name: "Loyalty Milestone", trigger: "When reaching point threshold", channel: "SMS + Email" },
  { key: "auto_holiday", name: "Holiday Promotions", trigger: "7 days before each holiday", channel: "SMS + Email" },
];

/* ─── Icons ─── */
const RocketIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
);

const BoltIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
);

/* ─── Open Slot Types ─── */
interface OpenSlot {
  id: string;
  staffId: string;
  staffName: string;
  date: Date;
  startHour: number;
  endHour: number;
  durationMin: number;
}

type FillAudience = "all" | "active" | "at_risk" | "vip";

const FILL_DEFAULT_MSG = `Hey {name}! ⚡ We just had an opening — {slots}. {discount}Book now before it's gone → `;

function detectOpenSlots(staff: Staff[], appointments: Appointment[], days: number): OpenSlot[] {
  const slots: OpenSlot[] = [];
  const now = new Date();
  const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dayName = DAY_NAMES[date.getDay()];
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

    for (const s of staff) {
      if (!s.is_active) continue;
      const sched = s.schedule as Record<string, { start?: string; end?: string; off?: boolean }> | null;
      const dayConfig = sched?.[dayName];
      if (!dayConfig || dayConfig.off) continue;

      const workStart = parseInt(dayConfig.start || "9", 10);
      const workEnd = parseInt(dayConfig.end || "17", 10);
      if (workEnd <= workStart) continue;

      // Build booked intervals for this staff on this day
      const booked: { start: number; end: number }[] = [];
      for (const apt of appointments) {
        if (apt.staff_id !== s.id) continue;
        const aptDate = new Date(apt.start_time);
        const aptDateStr = `${aptDate.getFullYear()}-${String(aptDate.getMonth()+1).padStart(2,"0")}-${String(aptDate.getDate()).padStart(2,"0")}`;
        if (aptDateStr !== dateStr) continue;
        if (apt.status === "cancelled") continue;
        const startH = aptDate.getHours() + aptDate.getMinutes() / 60;
        const endDate = new Date(apt.end_time);
        const endH = endDate.getHours() + endDate.getMinutes() / 60;
        booked.push({ start: startH, end: endH });
      }
      booked.sort((a, b) => a.start - b.start);

      // Find gaps >= 30 min
      let cursor = workStart;
      for (const b of booked) {
        if (b.start > cursor && (b.start - cursor) >= 0.5) {
          slots.push({
            id: `${s.id}-${dateStr}-${cursor}`,
            staffId: s.id,
            staffName: s.name,
            date: new Date(date),
            startHour: cursor,
            endHour: b.start,
            durationMin: Math.round((b.start - cursor) * 60),
          });
        }
        cursor = Math.max(cursor, b.end);
      }
      if (workEnd > cursor && (workEnd - cursor) >= 0.5) {
        slots.push({
          id: `${s.id}-${dateStr}-${cursor}`,
          staffId: s.id,
          staffName: s.name,
          date: new Date(date),
          startHour: cursor,
          endHour: workEnd,
          durationMin: Math.round((workEnd - cursor) * 60),
        });
      }
    }
  }
  return slots;
}

function formatHour(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

export default function CampaignsPage() {
  const { tenant, refetch } = useTenant();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"campaigns" | "automations" | "holidays" | "fill_openings">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "fill_openings" || tab === "automations" || tab === "holidays") return tab;
    }
    return "campaigns";
  });
  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "promo" as string,
    message: "",
    status: "draft" as string,
  });

  // Automation toggles from tenant settings
  const [automationStates, setAutomationStates] = useState<Record<string, boolean>>({});

  // ── Fill My Openings state ──
  const [fillStep, setFillStep] = useState(1);
  const [fillDays, setFillDays] = useState(3);
  const [allSlots, setAllSlots] = useState<OpenSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [fillMessage, setFillMessage] = useState(FILL_DEFAULT_MSG);
  const [fillDiscount, setFillDiscount] = useState("");
  const [fillAudience, setFillAudience] = useState<FillAudience>("all");
  const [fillSending, setFillSending] = useState(false);
  const [fillSent, setFillSent] = useState(false);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);


  const fetchCampaigns = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<Campaign[]>("campaigns.list");
    setCampaigns(data || []);

    // Load automation settings
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const autoSettings = (settings.automations || {}) as Record<string, boolean>;
    const states: Record<string, boolean> = {};
    AUTOMATIONS_CONFIG.forEach((a) => {
      states[a.key] = autoSettings[a.key] ?? (a.key === "auto_birthday" || a.key === "auto_rebooking" || a.key === "auto_noshow" || a.key === "auto_holiday");
    });
    setAutomationStates(states);

    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // ── Fill My Openings: fetch data when tab is activated ──
  const loadFillData = useCallback(async () => {
    if (!tenant) return;
    const [staffRes, aptRes, clientRes] = await Promise.all([
      queryData<Staff[]>("staff.list"),
      queryData<Appointment[]>("appointments.list"),
      queryData<Client[]>("clients.list"),
    ]);
    const staff = staffRes.data || [];
    const apts = aptRes.data || [];
    const clients = clientRes.data || [];
    setAllStaff(staff);
    setAllAppointments(apts);
    setAllClients(clients);
    setAllSlots(detectOpenSlots(staff, apts, fillDays));
  }, [tenant, fillDays]);

  useEffect(() => {
    if (activeTab === "fill_openings") {
      loadFillData();
      setFillStep(1);
      setSelectedSlots(new Set());
      setFillMessage(FILL_DEFAULT_MSG);
      setFillDiscount("");
      setFillAudience("all");
      setFillSent(false);
    }
  }, [activeTab, loadFillData]);

  // Re-detect when days change
  useEffect(() => {
    if (activeTab === "fill_openings" && allStaff.length > 0) {
      setAllSlots(detectOpenSlots(allStaff, allAppointments, fillDays));
    }
  }, [fillDays, activeTab, allStaff, allAppointments]);

  function toggleSlot(id: string) {
    setSelectedSlots(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllSlots() {
    if (selectedSlots.size === allSlots.length) {
      setSelectedSlots(new Set());
    } else {
      setSelectedSlots(new Set(allSlots.map(s => s.id)));
    }
  }

  function getAudienceCount(audience: FillAudience): number {
    switch (audience) {
      case "all": return allClients.length;
      case "active": return allClients.filter(c => c.status === "active").length;
      case "at_risk": return allClients.filter(c => c.status === "at_risk").length;
      case "vip": return allClients.filter(c => c.visit_count >= 10 || c.lifetime_spend >= 500).length;
    }
  }

  function getSelectedSlotsText(): string {
    const selected = allSlots.filter(s => selectedSlots.has(s.id));
    if (selected.length === 0) return "";
    const grouped = new Map<string, OpenSlot[]>();
    selected.forEach(s => {
      const key = s.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    });
    const parts: string[] = [];
    grouped.forEach((slots, date) => {
      const times = slots.map(s => `${formatHour(s.startHour)}`).join(", ");
      parts.push(`${date} at ${times}`);
    });
    return parts.join("; ");
  }

  async function handleSendBlast() {
    if (selectedSlots.size === 0) return;
    setFillSending(true);
    const recipientCount = getAudienceCount(fillAudience);
    const payload = {
      name: `Fill My Openings — ${new Date().toLocaleDateString()}`,
      type: "fill_openings",
      template: {
        message: fillMessage,
        discount: fillDiscount,
        slots: getSelectedSlotsText(),
        audience: fillAudience,
      },
      status: "completed",
      metrics: { sent: recipientCount, opened: 0, booked: 0, revenue: 0 },
    };
    const { data } = await queryData<Campaign>("campaigns.add", payload);
    if (data) setCampaigns(prev => [data, ...prev]);
    setFillSending(false);
    setFillSent(true);
  }

  function openNew() {
    setEditingCampaign(null);
    setFormData({ name: "", type: "promo", message: DEFAULT_TEMPLATES.promo, status: "draft" });
    setShowModal(true);
  }

  function openEdit(c: Campaign) {
    setEditingCampaign(c);
    const tmpl = c.template as Record<string, string>;
    setFormData({
      name: c.name,
      type: c.type,
      message: tmpl.message || "",
      status: c.status,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name) return;

    const payload = {
      name: formData.name,
      type: formData.type,
      template: { message: formData.message },
      status: formData.status,
    };

    if (editingCampaign) {
      const { data } = await queryData<Campaign>("campaigns.update", { id: editingCampaign.id, ...payload });
      if (data) setCampaigns((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } else {
      const { data } = await queryData<Campaign>("campaigns.add", payload);
      if (data) setCampaigns((prev) => [data, ...prev]);
    }
    setShowModal(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this campaign?")) return;
    await queryData("campaigns.delete", { id });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleToggleStatus(c: Campaign) {
    const newStatus = c.status === "active" ? "paused" : "active";
    const { data } = await queryData<Campaign>("campaigns.update", { id: c.id, status: newStatus });
    if (data) setCampaigns((prev) => prev.map((camp) => (camp.id === data.id ? data : camp)));
  }

  async function handleToggleAutomation(key: string) {
    const newStates = { ...automationStates, [key]: !automationStates[key] };
    setAutomationStates(newStates);

    // Save to tenant settings
    const res = await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...((tenant?.settings || {}) as Record<string, unknown>),
          automations: newStates,
        },
      }),
    });
    if (res.ok) refetch();
  }

  function getTypeBadge(type: string) {
    const t = CAMPAIGN_TYPES.find((ct) => ct.value === type);
    return t ? t.color : "badge-primary";
  }

  function getTypeLabel(type: string) {
    const t = CAMPAIGN_TYPES.find((ct) => ct.value === type);
    return t ? t.label : type;
  }

  // Computed stats
  const totalSent = campaigns.reduce((sum, c) => sum + (c.metrics?.sent || 0), 0);
  const totalOpened = campaigns.reduce((sum, c) => sum + (c.metrics?.opened || 0), 0);
  const totalBooked = campaigns.reduce((sum, c) => sum + (c.metrics?.booked || 0), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.metrics?.revenue || 0), 0);
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Campaigns & Automation</h1>
          <p>Automated marketing, retention, and win-back campaigns</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <RocketIcon /> Create Campaign
        </button>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Total Sent (All Time)</span>
          <span className={styles.summaryValue}>{totalSent}</span>
          <span className={`${styles.summaryChange} ${styles.positive}`}>{campaigns.filter((c) => c.status === "active").length} active</span>
        </div>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Open Rate</span>
          <span className={styles.summaryValue}>{openRate}%</span>
          <span className={`${styles.summaryChange} ${styles.positive}`}>Industry avg: 48%</span>
        </div>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Bookings from Campaigns</span>
          <span className={styles.summaryValue}>{totalBooked}</span>
          <span className={`${styles.summaryChange} ${styles.positive}`}>${totalRevenue.toLocaleString()} revenue</span>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === "fill_openings" ? styles.activeTab : ""}`} onClick={() => setActiveTab("fill_openings")} style={activeTab !== "fill_openings" ? { color: "var(--color-primary)" } : {}}>
          ⚡ Fill My Openings
        </button>
        <button className={`${styles.tab} ${activeTab === "campaigns" ? styles.activeTab : ""}`} onClick={() => setActiveTab("campaigns")}>
          Campaigns ({campaigns.length})
        </button>
        <button className={`${styles.tab} ${activeTab === "holidays" ? styles.activeTab : ""}`} onClick={() => setActiveTab("holidays")}>
          🎉 Holidays
        </button>
        <button className={`${styles.tab} ${activeTab === "automations" ? styles.activeTab : ""}`} onClick={() => setActiveTab("automations")}>
          Automations ({AUTOMATIONS_CONFIG.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading campaigns...</div>
      ) : activeTab === "campaigns" ? (
        campaigns.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
            <p style={{ marginBottom: "1rem" }}>No campaigns yet. Create your first campaign to start engaging clients.</p>
            <button className="btn btn-primary" onClick={openNew}>Create First Campaign</button>
          </div>
        ) : (
          <div className={styles.campaignList}>
            {campaigns.map((c) => {
              const tmpl = c.template as Record<string, string>;
              return (
                <div key={c.id} className={`card ${styles.campaignCard}`}>
                  <div className={styles.campaignHeader}>
                    <div>
                      <h3>{c.name}</h3>
                      <div className={styles.campaignMeta}>
                        <span className={`badge ${getTypeBadge(c.type)}`}>{getTypeLabel(c.type)}</span>
                        <span className={styles.lastSent}>
                          {c.last_sent ? `Last sent: ${new Date(c.last_sent).toLocaleDateString()}` : "Never sent"}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span className={`badge ${c.status === "active" ? "badge-success" : c.status === "paused" ? "badge-warning" : "badge-info"}`}>
                        {c.status}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggleStatus(c)} title={c.status === "active" ? "Pause" : "Activate"}>
                        {c.status === "active" ? "⏸️" : "▶️"}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} title="Edit">✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)} title="Delete">🗑️</button>
                    </div>
                  </div>
                  {tmpl.message && (
                    <div className={styles.messagePreview}>
                      <p>{tmpl.message}</p>
                    </div>
                  )}
                  <div className={styles.campaignStats}>
                    <div className={styles.campaignStat}>
                      <span className={styles.cStatValue}>{c.metrics?.sent || 0}</span>
                      <span className={styles.cStatLabel}>Sent</span>
                    </div>
                    <div className={styles.campaignStat}>
                      <span className={styles.cStatValue}>{c.metrics?.opened || 0}</span>
                      <span className={styles.cStatLabel}>Opened</span>
                    </div>
                    <div className={styles.campaignStat}>
                      <span className={styles.cStatValue}>{c.metrics?.booked || 0}</span>
                      <span className={styles.cStatLabel}>Booked</span>
                    </div>
                    <div className={styles.campaignStat}>
                      <span className={styles.cStatValue}>${c.metrics?.revenue || 0}</span>
                      <span className={styles.cStatLabel}>Revenue</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === "holidays" ? (
        <div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
            Create promotions for upcoming holidays. Campaigns are sent to all clients 7 days before each holiday.
          </p>
          <div className={styles.holidayGrid}>
            {getUpcomingHolidays().map((h) => {
              const existingCampaign = campaigns.find(c => c.type === 'holiday' && c.name.includes(h.name));
              return (
                <div key={h.name} className={`card ${styles.holidayCard}`}>
                  <div className={styles.holidayHeader}>
                    <span className={styles.holidayEmoji}>{h.emoji}</span>
                    <div>
                      <h3 className={styles.holidayName}>{h.name}</h3>
                      <span className={styles.holidayDate}>
                        {h.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                        {h.daysUntil <= 30 && (
                          <span className={styles.holidayCountdown}> · {h.daysUntil} days away</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <p className={styles.holidayIdea}>💡 {h.promoIdea}</p>
                  <div className={styles.holidayPreview}>{h.template}</div>
                  <div className={styles.holidayActions}>
                    {existingCampaign ? (
                      <span className={`badge ${existingCampaign.status === 'active' ? 'badge-success' : 'badge-info'}`}>
                        {existingCampaign.status === 'active' ? '✓ Active' : existingCampaign.status}
                      </span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setEditingCampaign(null);
                        setFormData({
                          name: `${h.name} ${h.date.getFullYear()} Special`,
                          type: 'holiday',
                          message: h.template,
                          status: 'draft',
                        });
                        setShowModal(true);
                      }}>
                        Create Campaign
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === "fill_openings" ? (
        <div className={styles.fillContainer}>
          {/* Step indicator */}
          <div className={styles.fillSteps}>
            {["Select Openings", "Compose Message", "Choose Audience", "Preview & Send"].map((label, i) => {
              const step = i + 1;
              const cls = fillStep === step ? styles.fillStepActive : fillStep > step ? styles.fillStepDone : "";
              return (
                <React.Fragment key={step}>
                  {i > 0 && <div className={styles.fillStepDivider} />}
                  <div className={`${styles.fillStep} ${cls}`}>
                    <span className={styles.fillStepNum}>{fillStep > step ? "✓" : step}</span>
                    <span>{label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {fillSent ? (
            <div className={`card ${styles.fillSuccess}`}>
              <div className="successEmoji">🚀</div>
              <h3>Blast Sent Successfully!</h3>
              <p>{getAudienceCount(fillAudience)} clients notified about {selectedSlots.size} open slot{selectedSlots.size !== 1 ? "s" : ""}.</p>
              <button className="btn btn-primary" onClick={() => { setFillSent(false); setFillStep(1); setSelectedSlots(new Set()); }}>
                Send Another Blast
              </button>
            </div>
          ) : fillStep === 1 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
                <div>
                  <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Open Slots Found: {allSlots.length}</h3>
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Select the openings you want to fill</p>
                </div>
                <div className={styles.dateRangeBar}>
                  {[1, 2, 3, 5, 7].map(d => (
                    <button key={d} className={`${styles.dateRangeBtn} ${fillDays === d ? styles.dateRangeBtnActive : ""}`} onClick={() => setFillDays(d)}>
                      {d === 1 ? "Today" : `Next ${d} days`}
                    </button>
                  ))}
                </div>
              </div>
              {allSlots.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className={styles.slotSelectAll} onClick={selectAllSlots}>
                    {selectedSlots.size === allSlots.length ? "Deselect All" : `Select All (${allSlots.length})`}
                  </button>
                </div>
              )}
              {allSlots.length === 0 ? (
                <div className={`card ${styles.noSlots}`}>
                  <div className="noSlotsEmoji">🎉</div>
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Fully Booked!</h3>
                  <p>No open slots in the next {fillDays} day{fillDays !== 1 ? "s" : ""}. Try expanding the date range.</p>
                </div>
              ) : (
                <div className={styles.slotGrid}>
                  {allSlots.map(slot => (
                    <div key={slot.id} className={`${styles.slotCard} ${selectedSlots.has(slot.id) ? styles.slotCardSelected : ""}`} onClick={() => toggleSlot(slot.id)}>
                      <div className={styles.slotCheck}>{selectedSlots.has(slot.id) ? "✓" : ""}</div>
                      <div className={styles.slotStaff}>{slot.staffName}</div>
                      <div className={styles.slotDate}>{slot.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
                      <div className={styles.slotTime}>
                        {formatHour(slot.startHour)} – {formatHour(slot.endHour)}
                        <span className={styles.slotDuration}>{slot.durationMin} min</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.fillNav}>
                <div />
                <button className="btn btn-primary" disabled={selectedSlots.size === 0} onClick={() => setFillStep(2)}>
                  Next: Compose Message →
                </button>
              </div>
            </>
          ) : fillStep === 2 ? (
            <div className={styles.fillCompose}>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Compose Your Message</h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Customize the blast message. Use merge tags for personalization.</p>
              </div>
              <div className={styles.formGroup}>
                <label className="label">Message Template</label>
                <textarea className="input" rows={5} value={fillMessage} onChange={e => setFillMessage(e.target.value)} />
                <div className={styles.charCount}>{fillMessage.length} characters</div>
                <small style={{ color: "var(--text-tertiary)" }}>
                  Merge tags: {"{name}"}, {"{slots}"}, {"{discount}"}
                </small>
              </div>
              <div className={styles.discountRow}>
                <label className={styles.discountLabel}>💰 Optional Discount:</label>
                <input className={`input ${styles.discountInput}`} value={fillDiscount} onChange={e => setFillDiscount(e.target.value)} placeholder="e.g., 15% off" />
              </div>
              <div className={styles.fillNav}>
                <button className="btn btn-secondary" onClick={() => setFillStep(1)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setFillStep(3)}>Next: Choose Audience →</button>
              </div>
            </div>
          ) : fillStep === 3 ? (
            <>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Choose Your Audience</h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Who should receive this blast?</p>
              </div>
              <div className={styles.audienceGrid}>
                {([
                  { key: "all" as FillAudience, icon: "📣", title: "All Clients", desc: "Everyone in your client list" },
                  { key: "active" as FillAudience, icon: "✅", title: "Active Clients", desc: "Clients who visited recently" },
                  { key: "at_risk" as FillAudience, icon: "⚠️", title: "At-Risk Clients", desc: "Win them back with a deal" },
                  { key: "vip" as FillAudience, icon: "👑", title: "VIP Clients", desc: "Top spenders & loyal regulars" },
                ]).map(opt => (
                  <div key={opt.key} className={`card ${styles.audienceCard} ${fillAudience === opt.key ? styles.audienceCardSelected : ""}`} onClick={() => setFillAudience(opt.key)}>
                    <div className={styles.audienceIcon}>{opt.icon}</div>
                    <h4>{opt.title}</h4>
                    <p>{opt.desc}</p>
                    <div className={styles.audienceCount}>{getAudienceCount(opt.key)} clients</div>
                  </div>
                ))}
              </div>
              <div className={styles.fillNav}>
                <button className="btn btn-secondary" onClick={() => setFillStep(2)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setFillStep(4)}>Next: Preview & Send →</button>
              </div>
            </>
          ) : (
            <>
              <div className={`card ${styles.fillPreview}`}>
                <div className={styles.fillPreviewHeader}>
                  <h3>⚡ Fill My Openings Blast Preview</h3>
                </div>
                <div className={styles.fillPreviewBody}>
                  <div className={styles.previewMessage}>
                    {fillMessage.replace("{name}", "Sarah").replace("{slots}", getSelectedSlotsText()).replace("{discount}", fillDiscount ? `${fillDiscount} — ` : "")}
                  </div>
                  <div className={styles.previewStats}>
                    <div className={styles.previewStat}>
                      <div className={styles.previewStatValue}>{selectedSlots.size}</div>
                      <div className={styles.previewStatLabel}>Open Slots</div>
                    </div>
                    <div className={styles.previewStat}>
                      <div className={styles.previewStatValue}>{getAudienceCount(fillAudience)}</div>
                      <div className={styles.previewStatLabel}>Recipients</div>
                    </div>
                    <div className={styles.previewStat}>
                      <div className={styles.previewStatValue}>{fillDiscount || "—"}</div>
                      <div className={styles.previewStatLabel}>Discount</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.fillNav}>
                <button className="btn btn-secondary" onClick={() => setFillStep(3)}>← Back</button>
                <button className={styles.fillSendBtn} disabled={fillSending} onClick={handleSendBlast}>
                  {fillSending ? "Sending..." : "🚀 Send Blast Now"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : activeTab === "automations" ? (
        <div className={styles.automationList}>
          {AUTOMATIONS_CONFIG.map((a) => (
            <div key={a.key} className={`card ${styles.automationCard}`}>
              <div className={styles.automationInfo}>
                <h3>{a.name}</h3>
                <div className={styles.automationMeta}>
                  <span className={styles.trigger}>⚡ {a.trigger}</span>
                  <span className={styles.channel}>📱 {a.channel}</span>
                </div>
              </div>
              <div className={styles.automationToggle}>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={automationStates[a.key] || false} onChange={() => handleToggleAutomation(a.key)} />
                  <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{editingCampaign ? "Edit Campaign" : "Create Campaign"}</h2>
            <form onSubmit={handleSave}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className="label">Campaign Name *</label>
                  <input className="input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., April Birthday Special" required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Type</label>
                  <select className="input" value={formData.type} onChange={(e) => {
                    setFormData({
                      ...formData,
                      type: e.target.value,
                      message: formData.message || DEFAULT_TEMPLATES[e.target.value] || "",
                    });
                  }}>
                    {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Status</label>
                  <select className="input" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>
              <div className={styles.formGroup} style={{ marginTop: "1rem" }}>
                <label className="label">Message Template</label>
                <textarea className="input" rows={4} value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} placeholder="Use {name}, {service}, {days} as merge tags..." />
                <small style={{ color: "var(--text-tertiary)", marginTop: 4, display: "block" }}>
                  Merge tags: {"{name}"}, {"{service}"}, {"{days}"}, {"{details}"}
                </small>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingCampaign ? "Save Changes" : "Create Campaign"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
