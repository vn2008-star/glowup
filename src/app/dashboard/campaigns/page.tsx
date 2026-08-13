"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import { localeDateStr } from "@/lib/utils";
import { PROMO_HOLIDAYS, getNextHolidayDate, type PromoHoliday } from "@/lib/schedule-utils";
import styles from "./campaigns.module.css";
import type { Campaign } from "@/lib/types";

/* ─── Holiday Calendar ─── */
// The calendar itself lives in @/lib/schedule-utils (PROMO_HOLIDAYS) so this
// page and the auto-send in /api/run-automations stay in sync.

function getUpcomingHolidays(): (PromoHoliday & { date: Date; daysUntil: number })[] {
  const now = new Date();
  return PROMO_HOLIDAYS.flatMap(h => {
    const date = getNextHolidayDate(h, now);
    if (!date) return [];  // lookup holiday past the end of its table
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return [{ ...h, date, daysUntil }];
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
  async function handleCreateHolidayPromo(h: PromoHoliday & { date: Date }) {
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
                        {localeDateStr(h.date, { month: 'long', day: 'numeric' })}
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
                      rows={8}
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
