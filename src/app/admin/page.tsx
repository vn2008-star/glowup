"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  plan: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  deleted_at: string | null;
  deletion_scheduled_at: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  staff_count: number;
  client_count: number;
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  pendingDeletion: number;
}

export default function AdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, suspended: 0, pendingDeletion: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "deletion">("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    const res = await fetch("/api/admin/tenants");
    if (res.status === 403) {
      const d = await res.json();
      setError(`Access denied. You are logged in as: ${d.your_email || 'unknown'}. This email is not in the admin list.`);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("Failed to load tenants");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTenants(data.tenants);
    setStats(data.stats);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Check auth first
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth/login");
        return;
      }
      fetchTenants();
    });
  }, [fetchTenants, router]);

  async function handleAction(tenantId: string, action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActionLoading(tenantId);

    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, action }),
    });

    if (res.ok) {
      await fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error || "Action failed");
    }
    setActionLoading(null);
  }

  function getStatus(t: TenantRow) {
    if (t.deletion_scheduled_at) return "deletion";
    if (t.is_active === false) return "suspended";
    return "active";
  }

  const filtered = tenants.filter((t) => {
    const status = getStatus(t);
    if (filter === "active" && status !== "active") return false;
    if (filter === "suspended" && status !== "suspended") return false;
    if (filter === "deletion" && status !== "deletion") return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.email || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <h1>🔒 Access Denied</h1>
          <p>{error}</p>
          <a href="/dashboard" className="btn btn-primary">Back to Dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>🛡️ Platform Admin</h1>
          <p>Manage all GlowUp tenants</p>
        </div>
        <a href="/dashboard" className={styles.backLink}>← Back to Dashboard</a>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total Tenants</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${styles.statGreen}`}>{stats.active}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${styles.statYellow}`}>{stats.suspended}</span>
          <span className={styles.statLabel}>Suspended</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${styles.statRed}`}>{stats.pendingDeletion}</span>
          <span className={styles.statLabel}>Pending Deletion</span>
        </div>
      </div>

      {/* Filters + Search */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["all", "active", "suspended", "deletion"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : f === "suspended" ? "Suspended" : "Pending Deletion"}
            </button>
          ))}
        </div>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search tenants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tenant Table */}
      {loading ? (
        <div className={styles.loading}>Loading tenants...</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Staff</th>
                <th>Clients</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyRow}>No tenants found</td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const status = getStatus(t);
                  return (
                    <tr key={t.id} className={status === "deletion" ? styles.rowDeletion : status === "suspended" ? styles.rowSuspended : ""}>
                      <td>
                        <div className={styles.tenantCell}>
                          <strong>{t.name}</strong>
                          <span className={styles.tenantSlug}>/{t.slug}</span>
                          {t.email && <span className={styles.tenantEmail}>{t.email}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.planBadge} ${styles[`plan_${t.plan}`] || ""}`}>
                          {t.plan}
                        </span>
                      </td>
                      <td>
                        {status === "active" && <span className={`${styles.statusBadge} ${styles.statusActive}`}>Active</span>}
                        {status === "suspended" && <span className={`${styles.statusBadge} ${styles.statusSuspended}`}>Suspended</span>}
                        {status === "deletion" && (
                          <span className={`${styles.statusBadge} ${styles.statusDeletion}`}>
                            Deletes {new Date(t.deletion_scheduled_at!).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td>{t.staff_count}</td>
                      <td>{t.client_count}</td>
                      <td className={styles.dateCell}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.actionBtns}>
                          {status === "active" && (
                            <button
                              className={styles.suspendBtn}
                              onClick={() => handleAction(t.id, "disable", `Suspend "${t.name}"? Staff will lose access.`)}
                              disabled={actionLoading === t.id}
                            >
                              Suspend
                            </button>
                          )}
                          {status === "suspended" && (
                            <button
                              className={styles.enableBtn}
                              onClick={() => handleAction(t.id, "enable")}
                              disabled={actionLoading === t.id}
                            >
                              Reactivate
                            </button>
                          )}
                          {status === "deletion" && (
                            <button
                              className={styles.enableBtn}
                              onClick={() => handleAction(t.id, "cancel-delete")}
                              disabled={actionLoading === t.id}
                            >
                              Cancel Delete
                            </button>
                          )}
                          {status !== "deletion" && (
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleAction(t.id, "schedule-delete", `Schedule "${t.name}" for deletion? They have 30 days to cancel.`)}
                              disabled={actionLoading === t.id}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
