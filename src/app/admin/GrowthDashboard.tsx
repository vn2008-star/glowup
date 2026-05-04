"use client";

import { useState, useEffect } from "react";
import styles from "./admin.module.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AnalyticsData {
  revenue: {
    mrr: number;
    arr: number;
    payingCount: number;
    trialingCount: number;
    trialExpiringSoon: number;
    planBreakdown: Record<string, number>;
    weeklyGrowth: Array<{ week: string; count: number }>;
  };
  analytics: {
    totalAppointments: number;
    monthlyAppointments: number;
    weeklyAppointments: number;
    totalClients: number;
    totalStaff: number;
    topSalons: Array<{ id: string; name: string; clients: number; appointments: number }>;
  };
  referrals: {
    stats: {
      totalCodes: number;
      totalReferrals: number;
      pendingRewards: number;
      rewardedCount: number;
      totalRewardAmount: number;
    };
    codes: any[];
    logs: any[];
  };
  credits: {
    stats: {
      totalIssued: number;
      totalIssuedAmount: number;
      activeCredits: number;
      activeBalance: number;
      redeemedCount: number;
      totalRedeemed: number;
      expiredCount: number;
      expiringSoon: number;
    };
    credits: any[];
    redemptions: any[];
  };
  health: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    score: number;
    risk: 'healthy' | 'warning' | 'at_risk';
    appts30d: number;
    newClients30d: number;
    clientsTotal: number;
    features: string[];
    created_at: string;
  }>;
}

export default function GrowthDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'revenue' | 'analytics' | 'referrals' | 'credits' | 'health'>('revenue');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/analytics');
      if (res.ok) {
        setData(await res.json());
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading growth dashboard...</div>;
  }
  if (!data) {
    return <div className={styles.loading}>Failed to load analytics</div>;
  }

  const sections = [
    { key: 'revenue' as const, icon: '📊', label: 'Revenue' },
    { key: 'analytics' as const, icon: '📈', label: 'Analytics' },
    { key: 'referrals' as const, icon: '🔗', label: 'Referrals' },
    { key: 'credits' as const, icon: '💳', label: 'Credits' },
    { key: 'health' as const, icon: '🏥', label: 'Health' },
  ];

  return (
    <div className={styles.settingsCard}>
      <h3 style={{ marginBottom: 'var(--space-4)' }}>🚀 Growth Command Center</h3>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        {sections.map(s => (
          <button
            key={s.key}
            className={`${styles.filterBtn} ${activeSection === s.key ? styles.filterActive : ''}`}
            onClick={() => setActiveSection(s.key)}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* ─── Revenue & Subscriptions ─── */}
      {activeSection === 'revenue' && (
        <div>
          {/* MRR / ARR cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <MetricCard value={`$${data.revenue.mrr.toLocaleString()}`} label="MRR" color="var(--color-success)" />
            <MetricCard value={`$${data.revenue.arr.toLocaleString()}`} label="ARR" color="#60a5fa" />
            <MetricCard value={String(data.revenue.payingCount)} label="Paying" color="var(--color-primary)" />
            <MetricCard value={String(data.revenue.trialingCount)} label="Trialing" color="#f59e0b" />
            <MetricCard value={String(data.revenue.trialExpiringSoon)} label="Trials Expiring" color="#ef4444" />
          </div>

          {/* Plan Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>Plan Distribution</h4>
              {Object.entries(data.revenue.planBreakdown).map(([plan, count]) => (
                <div key={plan} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '13px', textTransform: 'capitalize', fontWeight: 600 }}>{plan}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div style={{ width: '80px', height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(5, (count / Math.max(Object.values(data.revenue.planBreakdown).reduce((a, b) => a + b, 0), 1)) * 100)}%`,
                        height: '100%',
                        background: plan === 'free' ? 'var(--text-tertiary)' : plan === 'starter' ? '#3b82f6' : plan === 'growth' ? 'var(--color-primary)' : '#f59e0b',
                        borderRadius: '3px',
                      }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '24px', textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Weekly Growth Chart */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>New Tenants (8 weeks)</h4>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px' }}>
                {data.revenue.weeklyGrowth.map((w, i) => {
                  const maxCount = Math.max(...data.revenue.weeklyGrowth.map(g => g.count), 1);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)' }}>{w.count}</span>
                      <div style={{
                        width: '100%',
                        height: `${Math.max(4, (w.count / maxCount) * 70)}px`,
                        background: 'linear-gradient(180deg, var(--color-primary), rgba(195, 126, 218, 0.3))',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s',
                      }} />
                      <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{w.week}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Platform Analytics ─── */}
      {activeSection === 'analytics' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <MetricCard value={data.analytics.totalAppointments.toLocaleString()} label="Total Appts" color="var(--color-primary)" />
            <MetricCard value={data.analytics.monthlyAppointments.toLocaleString()} label="This Month" color="var(--color-success)" />
            <MetricCard value={data.analytics.weeklyAppointments.toLocaleString()} label="This Week" color="#60a5fa" />
            <MetricCard value={data.analytics.totalClients.toLocaleString()} label="Total Clients" color="#f59e0b" />
            <MetricCard value={data.analytics.totalStaff.toLocaleString()} label="Total Staff" color="#8b5cf6" />
          </div>

          {/* Top Salons */}
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>🏆 Top Salons</h4>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Salon</th>
                  <th>Clients</th>
                  <th>Appointments</th>
                </tr>
              </thead>
              <tbody>
                {data.analytics.topSalons.length === 0 ? (
                  <tr><td colSpan={4} className={styles.emptyRow}>No salons yet</td></tr>
                ) : (
                  data.analytics.topSalons.map((s, i) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 700, color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'var(--text-tertiary)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.clients}</td>
                      <td>{s.appointments}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Referral Pipeline ─── */}
      {activeSection === 'referrals' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <MetricCard value={String(data.referrals.stats.totalCodes)} label="Referral Codes" color="var(--color-primary)" />
            <MetricCard value={String(data.referrals.stats.totalReferrals)} label="Referrals Made" color="#60a5fa" />
            <MetricCard value={String(data.referrals.stats.pendingRewards)} label="Pending Rewards" color="#f59e0b" />
            <MetricCard value={String(data.referrals.stats.rewardedCount)} label="Rewarded" color="var(--color-success)" />
            <MetricCard value={`$${data.referrals.stats.totalRewardAmount}`} label="Total Rewards" color="#8b5cf6" />
          </div>

          {/* Conversion Funnel */}
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>📊 Conversion Funnel</h4>
          <div style={{ display: 'flex', gap: '2px', marginBottom: 'var(--space-5)', alignItems: 'center' }}>
            {[
              { label: 'Codes Created', count: data.referrals.stats.totalCodes, color: 'var(--color-primary)' },
              { label: 'Signed Up', count: data.referrals.stats.totalReferrals, color: '#60a5fa' },
              { label: 'Paid', count: data.referrals.stats.rewardedCount + data.referrals.stats.pendingRewards, color: '#f59e0b' },
              { label: 'Rewarded', count: data.referrals.stats.rewardedCount, color: 'var(--color-success)' },
            ].map((step, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{
                  width: '100%',
                  padding: '12px 8px',
                  background: `${step.color}15`,
                  borderRadius: i === 0 ? '8px 0 0 8px' : i === 3 ? '0 8px 8px 0' : '0',
                  textAlign: 'center',
                  borderLeft: i > 0 ? `2px solid ${step.color}30` : 'none',
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: step.color }}>{step.count}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{step.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Referral Codes */}
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>Recent Referral Codes</h4>
          <div className={styles.tableWrap} style={{ maxHeight: '250px', overflow: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Referrer</th>
                  <th>Referred Salon</th>
                  <th>Uses</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.referrals.codes.length === 0 ? (
                  <tr><td colSpan={5} className={styles.emptyRow}>No referral codes yet</td></tr>
                ) : (
                  data.referrals.codes.slice(0, 20).map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>{c.code}</td>
                      <td style={{ fontSize: '12px' }}>{c.referrer_name || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{c.referred_salon_name || '—'}</td>
                      <td>{c.uses || 0}</td>
                      <td className={styles.dateCell}>{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── GlowUp Credits ─── */}
      {activeSection === 'credits' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <MetricCard value={String(data.credits.stats.totalIssued)} label="Credits Issued" color="var(--color-primary)" />
            <MetricCard value={`$${data.credits.stats.totalIssuedAmount}`} label="Total Issued $" color="#60a5fa" />
            <MetricCard value={String(data.credits.stats.activeCredits)} label="Active" color="var(--color-success)" />
            <MetricCard value={`$${data.credits.stats.activeBalance}`} label="Active Balance" color="#22c55e" />
            <MetricCard value={`$${data.credits.stats.totalRedeemed}`} label="Redeemed $" color="#f59e0b" />
            <MetricCard value={String(data.credits.stats.expiringSoon)} label="Expiring Soon" color="#ef4444" />
          </div>

          {/* Credits List */}
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>All Credits</h4>
          <div className={styles.tableWrap} style={{ maxHeight: '300px', overflow: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Recipient</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.credits.credits.length === 0 ? (
                  <tr><td colSpan={6} className={styles.emptyRow}>No credits issued yet</td></tr>
                ) : (
                  data.credits.credits.map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>{c.code}</td>
                      <td style={{ fontSize: '12px' }}>{c.recipient_email || '—'}</td>
                      <td style={{ fontWeight: 700, color: Number(c.balance) > 0 ? 'var(--color-success)' : 'var(--text-tertiary)' }}>
                        ${Number(c.balance || 0).toFixed(2)}
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${
                          c.status === 'active' ? styles.statusActive
                          : c.status === 'expired' ? styles.statusDeletion
                          : styles.statusSuspended
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className={styles.dateCell}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}</td>
                      <td className={styles.dateCell}>{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Redemptions */}
          {data.credits.redemptions.length > 0 && (
            <>
              <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 'var(--space-4) 0 var(--space-3)', color: 'var(--text-secondary)' }}>Redemption Log</h4>
              <div className={styles.tableWrap} style={{ maxHeight: '200px', overflow: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Credit Code</th>
                      <th>Amount</th>
                      <th>Salon</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.credits.redemptions.map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.credit_code || '—'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-success)' }}>${Number(r.amount || 0).toFixed(2)}</td>
                        <td style={{ fontSize: '12px' }}>{r.tenant_id?.substring(0, 8) || '—'}</td>
                        <td className={styles.dateCell}>{r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Tenant Health ─── */}
      {activeSection === 'health' && (
        <div>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <MetricCard value={String(data.health.filter(h => h.risk === 'healthy').length)} label="Healthy" color="var(--color-success)" />
            <MetricCard value={String(data.health.filter(h => h.risk === 'warning').length)} label="Warning" color="#f59e0b" />
            <MetricCard value={String(data.health.filter(h => h.risk === 'at_risk').length)} label="At Risk" color="#ef4444" />
            <MetricCard value={`${Math.round(data.health.reduce((s, h) => s + h.score, 0) / Math.max(data.health.length, 1))}`} label="Avg Score" color="var(--color-primary)" />
          </div>

          {/* Health Table */}
          <div className={styles.tableWrap} style={{ maxHeight: '400px', overflow: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Salon</th>
                  <th>Plan</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Appts (30d)</th>
                  <th>New Clients (30d)</th>
                  <th>Total Clients</th>
                  <th>Features</th>
                </tr>
              </thead>
              <tbody>
                {data.health.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <div className={styles.tenantCell}>
                        <strong>{h.name}</strong>
                        <span className={styles.tenantSlug}>/{h.slug}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.planBadge} ${styles[`plan_${h.plan}` as keyof typeof styles] || ''}`}>
                        {h.plan}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '40px', height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${h.score}%`,
                            height: '100%',
                            background: h.risk === 'healthy' ? 'var(--color-success)' : h.risk === 'warning' ? '#f59e0b' : '#ef4444',
                            borderRadius: '3px',
                            transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{h.score}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.statusBadge} ${
                        h.risk === 'healthy' ? styles.statusActive
                        : h.risk === 'warning' ? styles.statusSuspended
                        : styles.statusDeletion
                      }`}>
                        {h.risk === 'healthy' ? '✅ Healthy' : h.risk === 'warning' ? '⚠️ Warning' : '🔴 At Risk'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{h.appts30d}</td>
                    <td>{h.newClients30d}</td>
                    <td>{h.clientsTotal}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {h.features.length === 0 ? (
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>—</span>
                        ) : (
                          h.features.map(f => (
                            <span key={f} style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              background: 'var(--bg-surface)',
                              borderRadius: 'var(--radius-full)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              fontWeight: 600,
                            }}>
                              {f}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable metric card
function MetricCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className={styles.statCard} style={{ padding: 'var(--space-4)' }}>
      <span style={{ fontSize: '22px', fontWeight: 800, color, fontFamily: 'var(--font-display)' }}>{value}</span>
      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
    </div>
  );
}
