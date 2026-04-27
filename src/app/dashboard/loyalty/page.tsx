"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
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

export default function LoyaltyPage() {
  const { tenant, refetch } = useTenant();
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [recentActivity, setRecentActivity] = useState<LoyaltyActivity[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTiers, setEditTiers] = useState<{ name: string; minPoints: number; perks: string }[]>([]);

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
    setLoading(false);
  }, [tenant]);

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

  const totalClients = tiers.reduce((sum, t) => sum + t.clients, 0);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1>Loyalty Program</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Loyalty Program</h1>
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
              const points = Math.round((r.total_price || 0) / 5); // $5 = 1 point
              const clientName = r.client ? `${r.client.first_name} ${r.client.last_name || ""}` : "Walk-in";
              return (
                <div key={r.id} className={styles.activityRow}>
                  <span className={styles.activityClient}>{clientName}</span>
                  <span className={styles.activityAction}>Earned {points} pts (${r.total_price} service)</span>
                  <span className={`${styles.activityPoints} ${styles.positive}`}>+{points}</span>
                  <span className={styles.activityDate}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              );
            })}
          </div>
        )}
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
