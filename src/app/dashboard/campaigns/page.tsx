"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./campaigns.module.css";
import type { Campaign } from "@/lib/types";

const CAMPAIGN_TYPES = [
  { value: "birthday", label: "Birthday", color: "badge-primary" },
  { value: "win_back", label: "Win-Back", color: "badge-danger" },
  { value: "rebooking", label: "Rebooking", color: "badge-success" },
  { value: "review", label: "Review Request", color: "badge-info" },
  { value: "promo", label: "Promotion", color: "badge-warning" },
  { value: "referral", label: "Referral", color: "badge-primary" },
  { value: "holiday", label: "Holiday", color: "badge-danger" },
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

export default function CampaignsPage() {
  const { tenant, refetch } = useTenant();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"campaigns" | "automations" | "holidays">("campaigns");
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
      ) : (
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
      )}

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
