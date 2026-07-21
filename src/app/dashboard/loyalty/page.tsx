"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import { localeDateStr } from "@/lib/utils";
import styles from "./loyalty.module.css";

interface LoyaltyTier {
  name: string;
  minPoints: number;
  perks: string;
  clients: number;
}

interface LoyaltyActivity {
  id: string;
  total_price: number;
  created_at: string;
  client: { first_name: string; last_name: string | null } | null;
}

const TIER_COLORS: Record<string, string> = {
  Bronze: "#cd7f32",
  Silver: "#c0c0c0",
  Gold: "#ffd700",
  Platinum: "#e5e4e2",
};

const LOYALTY_AUTOMATIONS = [
  { key: "auto_birthday", name: "🎂 Birthday Auto-Send", trigger: "Before each client's birthday", channel: "Configurable" },
  { key: "auto_loyalty", name: "🏆 Loyalty Milestone", trigger: "When reaching point threshold", channel: "SMS + Email" },
];

const DEFAULT_BDAY_MESSAGE =
  "Happy Birthday, {name}! 🎂 {business_name} wants to celebrate YOU — enjoy {discount}% off any service this month! Book now → {booking_url}";

export default function LoyaltyPage() {
  const { tenant, refetch } = useTenant();
  const t = useTranslations("loyaltyPage");
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [recentActivity, setRecentActivity] = useState<LoyaltyActivity[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTiers, setEditTiers] = useState<{ name: string; minPoints: number; perks: string }[]>([]);

  // Automation toggles
  const [automationStates, setAutomationStates] = useState<Record<string, boolean>>({});

  // Birthday special config (per-business, consumed by run-automations)
  const [bdayCfg, setBdayCfg] = useState({ discount: "20", days: "7", channel: "both", message: "" });
  const [bdaySaved, setBdaySaved] = useState<"idle" | "saving" | "saved">("idle");

  const fetchLoyalty = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<{
      tiers: LoyaltyTier[];
      recentActivity: LoyaltyActivity[];
      totalPoints: number;
    }>("loyalty.overview");

    if (data) {
      setTiers(data.tiers);
      setRecentActivity(data.recentActivity);
      setTotalPoints(data.totalPoints);
    }

    // Load automation states from tenant settings
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const autoSettings = (settings.automations || {}) as Record<string, boolean>;
    const states: Record<string, boolean> = {};
    LOYALTY_AUTOMATIONS.forEach((a) => {
      states[a.key] = autoSettings[a.key] ?? (a.key === "auto_birthday" || a.key === "auto_rebooking" || a.key === "auto_noshow");
    });
    setAutomationStates(states);

    const auto = autoSettings as Record<string, unknown>;
    setBdayCfg({
      discount: String(auto.auto_birthday_discount || "20"),
      days: String(auto.auto_birthday_days || "7"),
      channel: String(auto.auto_birthday_channel || "both"),
      message: String(auto.auto_birthday_message || ""),
    });

    setLoading(false);
  }, [tenant]);

  async function handleSaveBirthdayConfig() {
    setBdaySaved("saving");
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const existingAuto = (settings.automations || {}) as Record<string, unknown>;
    const res = await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...settings,
          automations: {
            ...existingAuto,
            auto_birthday_discount: bdayCfg.discount,
            auto_birthday_days: bdayCfg.days,
            auto_birthday_channel: bdayCfg.channel,
            auto_birthday_message: bdayCfg.message.trim(),
          },
        },
      }),
    });
    if (res.ok) {
      refetch();
      setBdaySaved("saved");
      setTimeout(() => setBdaySaved("idle"), 2000);
    } else {
      setBdaySaved("idle");
    }
  }

  useEffect(() => { fetchLoyalty(); }, [fetchLoyalty]);

  function openEditTiers() {
    setEditTiers(tiers.map((t) => ({ name: t.name, minPoints: t.minPoints, perks: t.perks })));
    setShowEditModal(true);
  }

  async function handleSaveTiers(e: React.FormEvent) {
    e.preventDefault();
    await queryData("loyalty.update_tiers", { tiers: editTiers });
    setShowEditModal(false);
    await refetch();
    await fetchLoyalty();
  }

  function updateTier(index: number, field: string, value: string | number) {
    setEditTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function addTier() {
    setEditTiers((prev) => [...prev, { name: "", minPoints: 0, perks: "" }]);
  }

  function removeTier(index: number) {
    setEditTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleToggleAutomation(key: string) {
    const newStates = { ...automationStates, [key]: !automationStates[key] };
    setAutomationStates(newStates);

    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const existingAuto = (settings.automations || {}) as Record<string, boolean>;
    const res = await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...settings,
          automations: { ...existingAuto, ...newStates },
        },
      }),
    });
    if (res.ok) refetch();
  }

  const totalClients = tiers.reduce((sum, t) => sum + t.clients, 0);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1>{t("title")}</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{t("title")}</h1>
          <p>Reward your clients and drive repeat visits</p>
        </div>
        <button className="btn btn-primary" onClick={openEditTiers}>Edit Tiers</button>
      </div>

      {/* Summary KPI */}
      <div className={styles.kpiRow}>
        <div className={`card ${styles.kpiCard}`}>
          <span className={styles.kpiLabel}>Total Members</span>
          <span className={styles.kpiValue}>{totalClients}</span>
        </div>
        <div className={`card ${styles.kpiCard}`}>
          <span className={styles.kpiLabel}>Points Outstanding</span>
          <span className={styles.kpiValue}>{totalPoints.toLocaleString()}</span>
        </div>
        <div className={`card ${styles.kpiCard}`}>
          <span className={styles.kpiLabel}>Active Tiers</span>
          <span className={styles.kpiValue}>{tiers.length}</span>
        </div>
      </div>

      {/* Tier Cards */}
      <div className={styles.tiersGrid}>
        {tiers.map((t) => (
          <div key={t.name} className={`card ${styles.tierCard}`}>
            <div className={styles.tierIcon} style={{ background: TIER_COLORS[t.name] || "var(--color-primary)" }}>{t.name[0]}</div>
            <h3>{t.name}</h3>
            <span className={styles.tierThreshold}>{t.minPoints}+ points</span>
            <span className={styles.tierClients}>{t.clients} clients</span>
            <p className={styles.tierPerks}>{t.perks}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className={`card ${styles.activityCard}`}>
        <h2>Recent Points Activity</h2>
        {recentActivity.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>No completed appointments yet. Points are earned after services.</p>
        ) : (
          <div className={styles.activityList}>
            {recentActivity.map((r) => {
              const points = Math.round((r.total_price || 0) / 5);
              const clientName = r.client ? `${r.client.first_name} ${r.client.last_name || ""}` : "Walk-in";
              return (
                <div key={r.id} className={styles.activityRow}>
                  <span className={styles.activityClient}>{clientName}</span>
                  <span className={styles.activityAction}>Earned {points} pts (${r.total_price} service)</span>
                  <span className={`${styles.activityPoints} ${styles.positive}`}>+{points}</span>
                  <span className={styles.activityDate}>{localeDateStr(new Date(r.created_at), { month: "short", day: "numeric" })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Auto-Send Settings ── */}
      <div className={styles.autoSendSection}>
        <h2>🤖 Auto-Send Settings</h2>
        <p>Automate messages to keep clients engaged and coming back</p>
        <div className={styles.automationList}>
          {LOYALTY_AUTOMATIONS.map((a) => (
            <div key={a.key}>
              <div className={`card ${styles.automationCard}`}>
                <div className={styles.automationInfo}>
                  <h3>{a.name}</h3>
                  <div className={styles.automationMeta}>
                    <span className={styles.trigger}>⚡ {a.key === "auto_birthday" ? `${bdayCfg.days} days before birthday` : a.trigger}</span>
                    <span className={styles.channel}>📱 {a.key === "auto_birthday" ? (bdayCfg.channel === "both" ? "SMS + Email" : bdayCfg.channel.toUpperCase()) : a.channel}</span>
                  </div>
                </div>
                <div>
                  <label className={styles.toggleLabel}>
                    <input type="checkbox" checked={automationStates[a.key] || false} onChange={() => handleToggleAutomation(a.key)} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </div>
              </div>

              {/* Birthday special config — each business sets its own offer */}
              {a.key === "auto_birthday" && automationStates.auto_birthday && (
                <div className="card" style={{ marginTop: "-0.5rem", marginBottom: "1rem", padding: "1rem 1.25rem", borderTop: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Discount %
                      <input className="input" type="number" min={0} max={100} style={{ width: 100 }}
                        value={bdayCfg.discount}
                        onChange={(e) => setBdayCfg((c) => ({ ...c, discount: e.target.value }))} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Send (days before)
                      <input className="input" type="number" min={0} max={30} style={{ width: 120 }}
                        value={bdayCfg.days}
                        onChange={(e) => setBdayCfg((c) => ({ ...c, days: e.target.value }))} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Channel
                      <select className="input" style={{ width: 140 }}
                        value={bdayCfg.channel}
                        onChange={(e) => setBdayCfg((c) => ({ ...c, channel: e.target.value }))}>
                        <option value="both">SMS + Email</option>
                        <option value="sms">SMS only</option>
                        <option value="email">Email only</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Message (blank = default) — tokens: {"{name}"}, {"{discount}"}, {"{business_name}"}, {"{booking_url}"}
                    <textarea className="input" rows={3} placeholder={DEFAULT_BDAY_MESSAGE}
                      value={bdayCfg.message}
                      onChange={(e) => setBdayCfg((c) => ({ ...c, message: e.target.value }))} />
                  </label>
                  <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveBirthdayConfig} disabled={bdaySaved === "saving"}>
                      {bdaySaved === "saving" ? "Saving…" : bdaySaved === "saved" ? "✓ Saved" : "Save Birthday Special"}
                    </button>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Emails include a Book button automatically.
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Edit Tiers Modal */}
      {showEditModal && (
        <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Loyalty Tiers</h2>
            <form onSubmit={handleSaveTiers}>
              {editTiers.map((t, i) => (
                <div key={i} className={styles.tierEditRow}>
                  <input className="input" placeholder="Tier Name" value={t.name} onChange={(e) => updateTier(i, "name", e.target.value)} required style={{ flex: 1 }} />
                  <input className="input" type="number" placeholder="Min Points" value={t.minPoints} onChange={(e) => updateTier(i, "minPoints", Number(e.target.value))} style={{ width: 100 }} />
                  <input className="input" placeholder="Perks description" value={t.perks} onChange={(e) => updateTier(i, "perks", e.target.value)} style={{ flex: 2 }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTier(i)} title="Remove">🗑️</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={addTier} style={{ marginTop: "0.5rem" }}>+ Add Tier</button>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Tiers</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
