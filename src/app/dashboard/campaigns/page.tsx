"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./campaigns.module.css";
import type { Campaign } from "@/lib/types";

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
  { name: "Lunar New Year", emoji: "🧧", month: 0, day: 29, template: "🧧 Lunar New Year Special! Start the Year of the Snake looking radiant. 20% off all services + lucky red gift cards available 🎊 Book now →", promoIdea: "Lucky red gift cards, new year glow-up packages, family bundles, festive nail art" },
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

const SEND_DAYS_OPTIONS = [3, 5, 7, 10, 14];

export default function HolidaysPage() {
  const { tenant, refetch } = useTenant();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline holiday editing state
  const [editingHolidayName, setEditingHolidayName] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState("");

  // Holiday auto-send settings
  const [sendDaysBefore, setSendDaysBefore] = useState(7);
  const [autoHolidayEnabled, setAutoHolidayEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<Campaign[]>("campaigns.list");
    setCampaigns(data || []);

    // Load settings
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const autoSettings = (settings.automations || {}) as Record<string, boolean>;
    setAutoHolidayEnabled(autoSettings.auto_holiday ?? true);
    const holidaySettings = (settings.holiday_settings || {}) as Record<string, number>;
    setSendDaysBefore(holidaySettings.send_days_before ?? 7);

    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Inline CRUD helpers ──
  async function handleCreateHolidayPromo(h: HolidayInfo & { date: Date }) {
    const payload = {
      name: `${h.name} ${h.date.getFullYear()} Special`,
      type: 'holiday',
      template: { message: h.template },
      status: 'active',
    };
    const { data } = await queryData<Campaign>('campaigns.add', payload);
    if (data) setCampaigns(prev => [data, ...prev]);
  }

  function startEditHoliday(h: { name: string }, existingCampaign: Campaign) {
    const tmpl = existingCampaign.template as Record<string, string>;
    setEditingHolidayName(h.name);
    setEditingMessage(tmpl.message || '');
  }

  async function handleSaveHolidayEdit(existingCampaign: Campaign) {
    const { data } = await queryData<Campaign>('campaigns.update', {
      id: existingCampaign.id,
      template: { message: editingMessage },
    });
    if (data) setCampaigns(prev => prev.map(c => c.id === data.id ? data : c));
    setEditingHolidayName(null);
  }

  async function handleRestoreHolidayTemplate(existingCampaign: Campaign, originalTemplate: string) {
    const { data } = await queryData<Campaign>('campaigns.update', {
      id: existingCampaign.id,
      template: { message: originalTemplate },
    });
    if (data) setCampaigns(prev => prev.map(c => c.id === data.id ? data : c));
    setEditingHolidayName(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this promotion?")) return;
    await queryData("campaigns.delete", { id });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleToggleStatus(c: Campaign) {
    const newStatus = c.status === "active" ? "paused" : "active";
    const { data } = await queryData<Campaign>("campaigns.update", { id: c.id, status: newStatus });
    if (data) setCampaigns((prev) => prev.map((camp) => (camp.id === data.id ? data : camp)));
  }

  // ── Settings save ──
  async function handleSaveSettings(newDays: number) {
    setSendDaysBefore(newDays);
    await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...((tenant?.settings || {}) as Record<string, unknown>),
          holiday_settings: { send_days_before: newDays },
        },
      }),
    });
    refetch();
  }

  async function handleToggleAutoHoliday() {
    const newVal = !autoHolidayEnabled;
    setAutoHolidayEnabled(newVal);
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const autoSettings = (settings.automations || {}) as Record<string, boolean>;
    await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...settings,
          automations: { ...autoSettings, auto_holiday: newVal },
        },
      }),
    });
    refetch();
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>🎉 Holiday Promotions</h1>
          <p>Create & manage holiday promotions for your clients</p>
        </div>
      </div>

      {/* Settings Card */}
      <div className={`card ${styles.settingsCard}`}>
        <div className={styles.settingsRow}>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>📅 Auto-send promotions</span>
            <select
              className="input"
              value={sendDaysBefore}
              onChange={e => handleSaveSettings(Number(e.target.value))}
              style={{ width: 160, display: 'inline-block' }}
            >
              {SEND_DAYS_OPTIONS.map(d => (
                <option key={d} value={d}>{d} days before holiday</option>
              ))}
            </select>
          </div>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>🤖 Holiday Auto-Send</span>
            <label className={styles.toggleLabel}>
              <input type="checkbox" checked={autoHolidayEnabled} onChange={handleToggleAutoHoliday} />
              <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
              <span className={styles.toggleText}>{autoHolidayEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Holiday Grid */}
      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading holidays...</div>
      ) : (
        <>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
            Tap ✨ to activate a holiday promotion. Messages are sent to all clients {sendDaysBefore} days before each holiday.
          </p>
          <div className={styles.holidayGrid}>
            {getUpcomingHolidays().map((h) => {
              const existingCampaign = campaigns.find(c => c.name.includes(h.name));
              const isEditing = editingHolidayName === h.name;
              const tmpl = existingCampaign?.template as Record<string, string> | undefined;
              const currentMessage = tmpl?.message || h.template;
              return (
                <div key={h.name} className={`card ${styles.holidayCard} ${h.daysUntil <= 30 ? styles.holidayUrgent : ''}`}>
                  <div className={styles.holidayHeader}>
                    <span className={styles.holidayEmoji}>{h.emoji}</span>
                    <div>
                      <h3 className={styles.holidayName}>{h.name}</h3>
                      <span className={styles.holidayDate}>
                        {h.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                        {h.daysUntil <= 30 && (
                          <span className={styles.holidayCountdown}> · ⏰ {h.daysUntil} days!</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <p className={styles.holidayIdea}>💡 {h.promoIdea}</p>

                  {/* Message: editable textarea or read-only preview */}
                  {isEditing ? (
                    <textarea
                      className={styles.holidayEditArea}
                      value={editingMessage}
                      onChange={e => setEditingMessage(e.target.value)}
                      rows={4}
                      autoFocus
                    />
                  ) : (
                    <div className={styles.holidayPreview}>{currentMessage}</div>
                  )}

                  {/* Actions */}
                  <div className={styles.holidayActions}>
                    {existingCampaign ? (
                      <>
                        {/* Status indicator */}
                        <div className={styles.holidayStatus}>
                          <span className={`${styles.statusDot} ${existingCampaign.status === 'active' ? styles.statusActive : styles.statusPaused}`} />
                          <span className={styles.statusLabel}>
                            {existingCampaign.status === 'active' ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        {/* Action buttons */}
                        <div className={styles.holidayBtnRow}>
                          {isEditing ? (
                            <>
                              <button className={`${styles.holidayBtn} ${styles.holidayBtnSave}`} onClick={() => handleSaveHolidayEdit(existingCampaign)} title="Save">💾 Save</button>
                              <button className={styles.holidayBtn} onClick={() => setEditingHolidayName(null)} title="Cancel">✕</button>
                            </>
                          ) : (
                            <>
                              <button className={styles.holidayBtn} onClick={() => handleToggleStatus(existingCampaign)} title={existingCampaign.status === 'active' ? 'Pause' : 'Activate'}>
                                {existingCampaign.status === 'active' ? '⏸️' : '▶️'}
                              </button>
                              <button className={styles.holidayBtn} onClick={() => startEditHoliday(h, existingCampaign)} title="Edit message">✏️</button>
                              <button className={styles.holidayBtn} onClick={() => handleRestoreHolidayTemplate(existingCampaign, h.template)} title="Restore original">🔄</button>
                              <button className={styles.holidayBtn} onClick={() => handleDelete(existingCampaign.id)} title="Delete">🗑️</button>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <button className={styles.holidayBtnCreate} onClick={() => handleCreateHolidayPromo(h)}>
                        ✨ Create Promotion
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
