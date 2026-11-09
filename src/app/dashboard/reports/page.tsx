"use client";

import { useToast } from "@/components/ui/Toast";
import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData, cachedQuery, cached, hasCached } from "@/lib/api";
import { localeDateStr, downloadText } from "@/lib/utils";
import { dayRangeInTz, addDays, todayInTz, DEFAULT_TZ } from "@/lib/tz";
import styles from "./reports.module.css";

/* ═══ Types ═══ */
interface OverviewData {
  thisMonth: { revenue: number; appointments: number; newClients: number };
  lastMonth: { revenue: number; appointments: number; newClients: number };
  topServices: { name: string; bookings: number; revenue: number }[];
  staffPerformance: { name: string; appointments: number; revenue: number }[];
  noShowRate: number;
}

interface StaffPerf {
  id: string; name: string; specialties: string[];
  appointments: number; revenue: number; completed: number;
  cancelled: number; noShows: number; commissionRate: number;
  uniqueClients: number; avgTicket: number; completionRate: number;
  commissionEarned: number;
}

interface RetentionClient {
  id: string; first_name: string; last_name: string | null;
  visit_count: number; last_visit: string | null;
  daysSinceLastVisit: number; retentionRisk: 'active' | 'at_risk' | 'lost' | 'new';
}

interface ForecastData {
  weeks: { label: string; booked: number; projected: number }[];
  monthlyTrend: { month: string; revenue: number }[];
  projectedMonthRevenue: number; bestCase: number; conservative: number;
}

interface PeakHoursData {
  grid: Record<string, Record<number, number>>;
  days: string[]; hours: number[]; maxCount: number;
}

interface StaffRevenueEntry {
  id: string; name: string; email: string | null; role: string;
  photoUrl: string | null; commissionRate: number;
  appointments: number; revenue: number; tips: number;
  uniqueClients: number; avgTicket: number; commissionEarned: number;
}

interface StaffRevenueData {
  staffRevenue: StaffRevenueEntry[];
  totals: { appointments: number; revenue: number; tips: number; commission: number };
  periodType: string;
  period: { start: string; end: string; label: string };
}

interface PaymentMethodRow { method: string; count: number; services: number; tips: number; total: number }
interface PaymentMethodsData {
  methods: PaymentMethodRow[];
  totals: { count: number; services: number; tips: number; total: number };
  periodType: string;
  period: { start: string; end: string; label: string };
  transactions: {
    id: string; date: string; method: string; clientName: string;
    serviceName: string; staffName: string; services: number; tips: number;
  }[];
}

const PAY_METHOD_META: Record<string, { label: string; icon: string; color: string }> = {
  cash: { label: "Cash", icon: "💵", color: "#2E9E5B" },
  card: { label: "Credit / Debit Card", icon: "💳", color: "#3B6FD8" },
  venmo: { label: "Venmo", icon: "Ⓥ", color: "#008CFF" },
  zelle: { label: "Zelle", icon: "Ⓩ", color: "#6D1ED4" },
  gift_card: { label: "Gift Card", icon: "🎁", color: "#D4A017" },
  mixed: { label: "Mixed", icon: "🔄", color: "#8A8A8A" },
  other: { label: "Not recorded", icon: "❔", color: "#B0B0B0" },
};
// The four the owner reconciles are always shown; the rest only when
// something was actually paid that way in the period.
const CORE_PAY_METHODS = ["cash", "card", "venmo", "zelle"];

const TABS = ["Overview", "Staff Performance", "Staff Revenue", "Payment Type", "Client Retention", "Revenue Forecast", "Peak Hours", "Cancellations"] as const;

type RetentionData = {
  summary: { total: number; active: number; atRisk: number; lost: number; new: number; retentionRate: number };
  clients: RetentionClient[];
} | null;

type CancellationData = {
  days: number;
  total: number;
  booked: number;
  cancellationRate: number;
  lostRevenue: number;
  reasons: { reason: string; count: number; lostRevenue: number }[];
  bySource: { salon: number; client: number; unknown: number };
  recent: {
    id: string; date: string; clientName: string; serviceName: string;
    staffName: string; reason: string; cancelledBy: string; value: number;
  }[];
};

export default function ReportsPage() {
  const { tenant, refetch: refetchTenant } = useTenant();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const t = useTranslations("reportsPage");
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [loading, setLoading] = useState(() => !hasCached("reports.overview"));

  // Data for each tab, seeded from the data cache so a return visit paints
  // whatever this browser last read. See lib/data-cache.
  const [overview, setOverview] = useState<OverviewData | null>(() => cached<OverviewData>("reports.overview") ?? null);
  const [staffPerf, setStaffPerf] = useState<StaffPerf[]>(() => cached<{ staffPerformance: StaffPerf[] }>("reports.staff-performance")?.staffPerformance ?? []);
  const [retention, setRetention] = useState<RetentionData>(() => cached<RetentionData>("reports.retention") ?? null);
  const [forecast, setForecast] = useState<ForecastData | null>(() => cached<ForecastData>("reports.forecast") ?? null);
  const [peakHours, setPeakHours] = useState<PeakHoursData | null>(() => cached<PeakHoursData>("reports.peak-hours") ?? null);
  const [retFilter, setRetFilter] = useState<string>("all");
  const [cancels, setCancels] = useState<CancellationData | null>(null);
  const [cancelDays, setCancelDays] = useState(90);

  // Staff Revenue tab state
  const [staffRevData, setStaffRevData] = useState<StaffRevenueData | null>(null);
  const [revPeriodType, setRevPeriodType] = useState<'biweekly' | 'monthly'>('biweekly');
  const [revOffset, setRevOffset] = useState(0);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // Payment Methods tab state
  const [payData, setPayData] = useState<PaymentMethodsData | null>(null);
  const [payPeriodType, setPayPeriodType] = useState<'biweekly' | 'monthly'>('monthly');
  const [payOffset, setPayOffset] = useState(0);
  const [payFilter, setPayFilter] = useState<string>("all");

  // The read behind the active tab, named once. Having it separate from the
  // dispatch below is what lets the fetch decide whether a loading state is
  // even needed — a tab whose answer is already cached shows it instead.
  const tabRequest = useCallback((): { action: string; payload?: Record<string, unknown> } => {
    switch (activeTab) {
      case "Staff Performance": return { action: "reports.staff-performance" };
      case "Client Retention": return { action: "reports.retention" };
      case "Revenue Forecast": return { action: "reports.forecast" };
      case "Peak Hours": return { action: "reports.peak-hours" };
      case "Staff Revenue": return { action: "reports.staff-revenue", payload: { period: revPeriodType, offset: revOffset } };
      case "Cancellations": return { action: "reports.cancellations", payload: { days: cancelDays } };
      case "Payment Type": return { action: "reports.payment-methods", payload: { period: payPeriodType, offset: payOffset } };
      default: return { action: "reports.overview" };
    }
  }, [activeTab, revPeriodType, revOffset, cancelDays, payPeriodType, payOffset]);

  const fetchTabData = useCallback(async () => {
    if (!tenant) return;
    const { action, payload } = tabRequest();
    // Only announce a load when there is nothing to show. A tab that has been
    // opened before paints its last answer and is corrected when this returns.
    setLoading(!hasCached(action, payload));
    try {
      const { data } = await cachedQuery<unknown>(action, payload);
      switch (activeTab) {
        case "Staff Performance": setStaffPerf((data as { staffPerformance: StaffPerf[] } | null)?.staffPerformance || []); break;
        case "Client Retention": setRetention(data as RetentionData); break;
        case "Revenue Forecast": setForecast(data as ForecastData); break;
        case "Peak Hours": setPeakHours(data as PeakHoursData); break;
        case "Staff Revenue": setStaffRevData(data as StaffRevenueData); break;
        case "Cancellations": setCancels(data as CancellationData); break;
        case "Payment Type": setPayData(data as PaymentMethodsData); break;
        default: setOverview(data as OverviewData); break;
      }
    } finally { setLoading(false); }
  }, [tenant, activeTab, tabRequest]);

  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Reports & Analytics</h1>
          <p>Comprehensive business intelligence dashboard</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {[{ label: "Export last 90 days", days: 90 }, { label: "Export last 12 months", days: 365 }].map(({ label, days }) => (
            <button
              key={days}
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                const tz = tenant?.timezone || DEFAULT_TZ;
                const { data, error } = await queryData<{ csv: string; count: number; filename: string }>("appointments.export", {
                  startDate: dayRangeInTz(addDays(todayInTz(tz), -days), tz).start,
                  endDate: dayRangeInTz(todayInTz(tz), tz).end,
                });
                setExporting(false);
                if (error || !data) { toast.error(error || "Export failed"); return; }
                downloadText(data.filename, data.csv);
                toast.success(`Exported ${data.count} appointments`);
              }}
            >
              {exporting ? "Exporting…" : label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button key={tab} className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === "Payment Type" ? t("paymentType") : tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="pending-fade" style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading analytics...</div>
      ) : (
        <>
          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === "Overview" && overview && (
            <>
              <div className={styles.kpiGrid}>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>Monthly Revenue</span>
                  <span className={styles.kpiValue}>{fmt(overview.thisMonth.revenue)}</span>
                  <span className={`${styles.kpiChange} ${overview.thisMonth.revenue >= overview.lastMonth.revenue ? styles.positive : styles.negative}`}>
                    {overview.lastMonth.revenue > 0 ? `${overview.thisMonth.revenue >= overview.lastMonth.revenue ? '+' : ''}${Math.round(((overview.thisMonth.revenue - overview.lastMonth.revenue) / overview.lastMonth.revenue) * 100)}%` : '—'} vs last month
                  </span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>Appointments</span>
                  <span className={styles.kpiValue}>{overview.thisMonth.appointments}</span>
                  <span className={`${styles.kpiChange} ${overview.thisMonth.appointments >= overview.lastMonth.appointments ? styles.positive : styles.negative}`}>
                    {overview.thisMonth.appointments - overview.lastMonth.appointments >= 0 ? '+' : ''}{overview.thisMonth.appointments - overview.lastMonth.appointments} vs last month
                  </span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>New Clients</span>
                  <span className={styles.kpiValue}>{overview.thisMonth.newClients}</span>
                  <span className={`${styles.kpiChange} ${overview.thisMonth.newClients >= overview.lastMonth.newClients ? styles.positive : styles.negative}`}>
                    {overview.thisMonth.newClients - overview.lastMonth.newClients >= 0 ? '+' : ''}{overview.thisMonth.newClients - overview.lastMonth.newClients} vs last month
                  </span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>No-Show Rate</span>
                  <span className={styles.kpiValue}>{overview.noShowRate || 0}%</span>
                  <span className={styles.kpiChange}>industry avg: 15%</span>
                </div>
              </div>

              <div className={`card ${styles.topServicesCard}`}>
                <h2>Top Services</h2>
                {overview.topServices.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>No completed appointments yet.</p>
                ) : (
                  <div className={styles.servicesList}>
                    {overview.topServices.map((s, i) => (
                      <div key={s.name} className={styles.serviceRow}>
                        <span className={styles.serviceRank}>#{i + 1}</span>
                        <div className={styles.serviceInfo}>
                          <span className={styles.serviceName}>{s.name}</span>
                          <div className={styles.serviceBar}>
                            <div className={styles.serviceBarFill} style={{ width: `${(s.bookings / (overview.topServices[0]?.bookings || 1)) * 100}%` }} />
                          </div>
                        </div>
                        <span className={styles.serviceBookings}>{s.bookings} bookings</span>
                        <span className={styles.serviceRevenue}>{fmt(s.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ STAFF PERFORMANCE TAB ═══ */}
          {activeTab === "Staff Performance" && (
            <>
              {staffPerf.length === 0 ? (
                <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
                  <h3 style={{ marginBottom: "var(--space-2)" }}>No Staff Data Yet</h3>
                  <p>Complete appointments to see staff performance metrics.</p>
                </div>
              ) : (
                <div className={styles.staffGrid}>
                  {staffPerf.map((s, i) => (
                    <div key={s.id} className={styles.perfCard} style={i === 0 ? { borderColor: 'rgba(201,160,220,0.4)', boxShadow: 'var(--shadow-glow-soft)' } : {}}>
                      <div className={styles.perfCardHeader}>
                        <div className={styles.perfAvatar}>{s.name.charAt(0)}</div>
                        <div>
                          <div className={styles.perfName}>{i === 0 && '🏆 '}{s.name}</div>
                          <div className={styles.perfRole}>{s.specialties?.[0] || 'Team Member'}</div>
                        </div>
                      </div>
                      <div className={styles.perfStats}>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{fmt(s.revenue)}</div>
                          <div className={styles.perfStatLabel}>Revenue</div>
                        </div>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{s.completed}</div>
                          <div className={styles.perfStatLabel}>Completed</div>
                        </div>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{fmt(s.avgTicket)}</div>
                          <div className={styles.perfStatLabel}>Avg Ticket</div>
                        </div>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{s.uniqueClients}</div>
                          <div className={styles.perfStatLabel}>Clients</div>
                        </div>
                      </div>
                      <div className={styles.perfBar}>
                        <div className={styles.perfBarLabel}>
                          <span>Completion Rate</span>
                          <span>{s.completionRate}%</span>
                        </div>
                        <div className={styles.perfBarTrack}>
                          <div className={styles.perfBarFill} style={{ width: `${s.completionRate}%` }} />
                        </div>
                      </div>
                      {s.commissionRate > 0 && (
                        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                          💰 Commission ({s.commissionRate}%): <strong>{fmt(s.commissionEarned)}</strong>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═══ CLIENT RETENTION TAB ═══ */}
          {activeTab === "Client Retention" && retention && (
            <>
              <div className={styles.retentionSummary}>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: 'var(--color-primary)' }}>{retention.summary.retentionRate}%</div>
                  <div className={styles.retLabel}>Retention Rate</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: 'var(--color-success)' }}>{retention.summary.active}</div>
                  <div className={styles.retLabel}>Active</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: '#d97706' }}>{retention.summary.atRisk}</div>
                  <div className={styles.retLabel}>At Risk</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: 'var(--color-danger)' }}>{retention.summary.lost}</div>
                  <div className={styles.retLabel}>Lost (90+ days)</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: '#3b82f6' }}>{retention.summary.new}</div>
                  <div className={styles.retLabel}>New / No Visit</div>
                </div>
              </div>

              <div className={`card ${styles.retListCard}`}>
                <h2>Client Health</h2>
                <div className={styles.retFilters}>
                  {["all", "active", "at_risk", "lost", "new"].map(f => (
                    <button key={f} className={`${styles.retFilterBtn} ${retFilter === f ? styles.retFilterActive : ''}`} onClick={() => setRetFilter(f)}>
                      {f === 'all' ? 'All' : f === 'at_risk' ? 'At Risk' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                {retention.clients.filter(c => retFilter === 'all' || c.retentionRisk === retFilter).slice(0, 25).map(c => (
                  <div key={c.id} className={styles.retRow}>
                    <span className={`${styles.retBadge} ${
                      c.retentionRisk === 'active' ? styles.retBadgeActive :
                      c.retentionRisk === 'at_risk' ? styles.retBadgeRisk :
                      c.retentionRisk === 'lost' ? styles.retBadgeLost : styles.retBadgeNew
                    }`}>
                      {c.retentionRisk === 'active' ? '🟢' : c.retentionRisk === 'at_risk' ? '🟡' : c.retentionRisk === 'lost' ? '🔴' : '🔵'}
                    </span>
                    <span className={styles.retName}>{c.first_name} {c.last_name || ''}</span>
                    <span className={styles.retVisits}>{c.visit_count} visits</span>
                    <span className={styles.retDays} style={{ color: c.daysSinceLastVisit > 90 ? 'var(--color-danger)' : c.daysSinceLastVisit > 45 ? '#d97706' : 'var(--text-secondary)' }}>
                      {c.daysSinceLastVisit > 900 ? 'No visits' : `${c.daysSinceLastVisit}d ago`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ REVENUE FORECAST TAB ═══ */}
          {activeTab === "Revenue Forecast" && forecast && (
            <>
              <div className={styles.kpiGrid}>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>Projected (4 Weeks)</span>
                  <span className={styles.kpiValue}>{fmt(forecast.projectedMonthRevenue)}</span>
                  <span className={styles.kpiChange}>from booked appointments</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>Best Case</span>
                  <span className={styles.kpiValue} style={{ color: 'var(--color-success)' }}>{fmt(forecast.bestCase)}</span>
                  <span className={styles.kpiChange}>+30% walk-ins & upsells</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>Conservative</span>
                  <span className={styles.kpiValue} style={{ color: '#d97706' }}>{fmt(forecast.conservative)}</span>
                  <span className={styles.kpiChange}>-15% cancellations</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>Avg Weekly</span>
                  <span className={styles.kpiValue}>{fmt(Math.round(forecast.projectedMonthRevenue / 4))}</span>
                  <span className={styles.kpiChange}>per week projected</span>
                </div>
              </div>

              <div className={styles.forecastGrid}>
                <div className={`card ${styles.forecastCard}`}>
                  <h2>📅 Weekly Forecast</h2>
                  <div className={styles.barChart}>
                    {forecast.weeks.map(w => {
                      const maxVal = Math.max(...forecast.weeks.map(x => x.projected), 1);
                      return (
                        <div key={w.label} className={styles.barRow}>
                          <span className={styles.barLabel}>{w.label}</span>
                          <div className={styles.barTrack}>
                            <div className={`${styles.barFill} ${styles.barFillBooked}`} style={{ width: `${(w.booked / maxVal) * 100}%` }}>
                              <span className={styles.barAmount}>{fmt(w.booked)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`card ${styles.forecastCard}`}>
                  <h2>📈 6-Month Trend</h2>
                  <div className={styles.trendChart}>
                    {forecast.monthlyTrend.map(m => {
                      const maxRev = Math.max(...forecast.monthlyTrend.map(x => x.revenue), 1);
                      const pct = (m.revenue / maxRev) * 100;
                      return (
                        <div key={m.month} className={styles.trendBar} style={{ height: `${Math.max(pct, 5)}%` }}>
                          {pct > 20 && <span className={styles.trendBarValue}>{fmt(m.revenue)}</span>}
                          <span className={styles.trendBarLabel}>{m.month}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══ PEAK HOURS HEATMAP TAB ═══ */}
          {activeTab === "Peak Hours" && peakHours && (
            <div className={`card ${styles.heatmapCard}`}>
              <h2>🔥 Peak Hours Heatmap</h2>
              <p>Appointment density over the past 3 months. Darker = busier.</p>

              <div className={styles.heatmapGrid} style={{ gridTemplateColumns: `80px repeat(${peakHours.hours.length}, 1fr)` }}>
                {/* Header row */}
                <div />
                {peakHours.hours.map(h => (
                  <div key={h} className={styles.heatmapHeader}>
                    {h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`}
                  </div>
                ))}

                {/* Data rows */}
                {peakHours.days.map(day => (
                  <React.Fragment key={day}>
                    <div key={`label-${day}`} className={styles.heatmapDayLabel}>{day.slice(0, 3)}</div>
                    {peakHours.hours.map(hour => {
                      const count = peakHours.grid[day]?.[hour] || 0;
                      const intensity = count / peakHours.maxCount;
                      const bg = count === 0
                        ? 'var(--bg-surface)'
                        : `rgba(201, 160, 220, ${0.15 + intensity * 0.75})`;
                      const textColor = intensity > 0.5 ? 'white' : 'var(--text-secondary)';
                      return (
                        <div
                          key={`${day}-${hour}`}
                          className={styles.heatmapCell}
                          style={{ background: bg, color: textColor }}
                          title={`${day} ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}: ${count} appointments`}
                        >
                          {count > 0 ? count : ''}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>

              <div className={styles.heatmapLegend}>
                <span>Low</span>
                <div className={styles.heatmapLegendBar}>
                  {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map(op => (
                    <div key={op} className={styles.heatmapLegendSwatch} style={{ background: `rgba(201, 160, 220, ${op})` }} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </div>
          )}

          {/* ═══ CANCELLATIONS TAB ═══ */}
          {activeTab === "Cancellations" && cancels && (
            <>
              <div className={styles.revControls}>
                <div className={styles.revPeriodToggle}>
                  {[30, 90, 365].map((d) => (
                    <button
                      key={d}
                      className={`${styles.revToggleBtn} ${cancelDays === d ? styles.revToggleActive : ""}`}
                      onClick={() => setCancelDays(d)}
                    >
                      {d === 365 ? "12 months" : `${d} days`}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.kpiGrid}>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>Cancelled</span>
                  <span className={styles.statValue}>{cancels.total}</span>
                  <span className={styles.statSub}>of {cancels.booked} booked</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>Cancellation Rate</span>
                  <span className={styles.statValue}>{cancels.cancellationRate}%</span>
                  <span className={styles.statSub}>last {cancels.days} days</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>Revenue Not Earned</span>
                  <span className={styles.statValue}>{fmt(cancels.lostRevenue)}</span>
                  <span className={styles.statSub}>at list price</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>Who Cancelled</span>
                  <span className={styles.statValue}>
                    {cancels.bySource.client}/{cancels.bySource.salon}
                  </span>
                  <span className={styles.statSub}>client / salon</span>
                </div>
              </div>

              <div className={`card ${styles.revTableCard}`}>
                <h2>Why appointments were cancelled</h2>
                {cancels.reasons.length === 0 ? (
                  <p className={styles.emptyNote}>No cancellations in this period.</p>
                ) : (
                  <table className={styles.revTable}>
                    <thead>
                      <tr><th>Reason</th><th>Count</th><th>Share</th><th>Value</th></tr>
                    </thead>
                    <tbody>
                      {cancels.reasons.map((r) => (
                        <tr key={r.reason}>
                          <td>{r.reason === "Not recorded" ? <em>Not recorded</em> : r.reason}</td>
                          <td>{r.count}</td>
                          <td>
                            <div className={styles.reasonBarTrack}>
                              <div
                                className={styles.reasonBarFill}
                                style={{ width: `${cancels.total ? (r.count / cancels.total) * 100 : 0}%` }}
                              />
                              <span>{cancels.total ? Math.round((r.count / cancels.total) * 100) : 0}%</span>
                            </div>
                          </td>
                          <td>{fmt(r.lostRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {cancels.reasons.some((r) => r.reason === "Not recorded") && (
                  <p className={styles.emptyNote}>
                    Reasons have only been captured since 11 Aug 2026 — anything cancelled before that shows as
                    &ldquo;Not recorded&rdquo;.
                  </p>
                )}
              </div>

              <div className={`card ${styles.revTableCard}`}>
                <h2>Recent cancellations</h2>
                {cancels.recent.length === 0 ? (
                  <p className={styles.emptyNote}>Nothing to show.</p>
                ) : (
                  <table className={styles.revTable}>
                    <thead>
                      <tr><th>Date</th><th>Client</th><th>Service</th><th>Staff</th><th>Reason</th><th>By</th></tr>
                    </thead>
                    <tbody>
                      {cancels.recent.map((r) => (
                        <tr key={r.id}>
                          <td>{localeDateStr(new Date(r.date), { month: "short", day: "numeric" })}</td>
                          <td>{r.clientName}</td>
                          <td>{r.serviceName}</td>
                          <td>{r.staffName}</td>
                          <td>{r.reason || <span className={styles.emptyNote}>—</span>}</td>
                          <td>{r.cancelledBy || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ═══ PAYMENT METHODS TAB ═══ */}
          {activeTab === "Payment Type" && (() => {
            const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const meta = (m: string) => PAY_METHOD_META[m] || PAY_METHOD_META.other;
            const rows = (payData?.methods || []).filter(m => CORE_PAY_METHODS.includes(m.method) || m.count > 0);
            const grand = payData?.totals.total || 0;
            const pct = (n: number) => (grand > 0 ? Math.round((n / grand) * 100) : 0);
            const txns = (payData?.transactions || []).filter(t => payFilter === "all" || t.method === payFilter);
            return (
              <>
                <div className={styles.revControls}>
                  <div className={styles.revPeriodToggle}>
                    <button className={`${styles.revToggleBtn} ${payPeriodType === 'monthly' ? styles.revToggleActive : ''}`}
                      onClick={() => { setPayPeriodType('monthly'); setPayOffset(0); }}>Monthly</button>
                    <button className={`${styles.revToggleBtn} ${payPeriodType === 'biweekly' ? styles.revToggleActive : ''}`}
                      onClick={() => { setPayPeriodType('biweekly'); setPayOffset(0); }}>Biweekly</button>
                  </div>
                  <div className={styles.revPeriodNav}>
                    <button className={styles.revNavBtn} onClick={() => setPayOffset(o => o - 1)}>← Previous</button>
                    <span className={styles.revPeriodLabel}>{payData?.period?.label || '...'}</span>
                    <button className={styles.revNavBtn} onClick={() => setPayOffset(o => Math.min(o + 1, 0))} disabled={payOffset >= 0}>Next →</button>
                  </div>
                </div>

                {payData && (
                  <>
                    <div className={styles.kpiGrid}>
                      {rows.filter(m => CORE_PAY_METHODS.includes(m.method)).map(m => (
                        <button
                          key={m.method}
                          type="button"
                          className={`card ${styles.kpiCard} ${styles.payTile} ${payFilter === m.method ? styles.payTileActive : ''}`}
                          style={{ borderTopColor: meta(m.method).color }}
                          onClick={() => setPayFilter(f => (f === m.method ? "all" : m.method))}
                          title="Show only these payments below"
                        >
                          <span className={styles.kpiLabel}>{meta(m.method).icon} {meta(m.method).label}</span>
                          <span className={styles.kpiValue}>{money(m.total)}</span>
                          <span className={styles.kpiChange} style={{ color: "var(--text-secondary)" }}>
                            {m.count} {m.count === 1 ? "payment" : "payments"} · {pct(m.total)}%
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className={`card ${styles.revTableCard}`}>
                      <h2>{t("incomeByPaymentType")}</h2>
                      {payData.totals.count === 0 ? (
                        <p className={styles.emptyNote}>No checked-out appointments in this period.</p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className={styles.revTable}>
                            <thead>
                              <tr><th>{t("type")}</th><th>Payments</th><th>Services</th><th>Tips</th><th>Total</th><th>Share</th></tr>
                            </thead>
                            <tbody>
                              {rows.map(m => (
                                <tr key={m.method}>
                                  <td><span style={{ color: meta(m.method).color, fontWeight: 700 }}>{meta(m.method).icon}</span> {meta(m.method).label}</td>
                                  <td>{m.count}</td>
                                  <td className={styles.revMoney}>{money(m.services)}</td>
                                  <td className={styles.revMoney}>{money(m.tips)}</td>
                                  <td className={styles.revMoney}><strong>{money(m.total)}</strong></td>
                                  <td>
                                    <div className={styles.reasonBarTrack}>
                                      <div className={styles.reasonBarFill} style={{ width: `${pct(m.total)}%`, background: meta(m.method).color }} />
                                      <span>{pct(m.total)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              <tr className={styles.revTotalsRow}>
                                <td><strong>Total</strong></td>
                                <td><strong>{payData.totals.count}</strong></td>
                                <td className={styles.revMoney}><strong>{money(payData.totals.services)}</strong></td>
                                <td className={styles.revMoney}><strong>{money(payData.totals.tips)}</strong></td>
                                <td className={styles.revMoney}><strong>{money(payData.totals.total)}</strong></td>
                                <td></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      {rows.some(m => m.method === "mixed" && m.count > 0) && (
                        <p className={styles.emptyNote}>&ldquo;Mixed&rdquo; payments are shown on their own, because checkout doesn&rsquo;t record how they were split.</p>
                      )}
                      {rows.some(m => m.method === "gift_card" && m.count > 0) && (
                        <p className={styles.emptyNote}>Gift card payments use money collected when the card was sold.</p>
                      )}
                    </div>

                    <div className={`card ${styles.revTableCard}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
                        <h2>Payments</h2>
                        <select className="input" style={{ width: "auto" }} value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
                          <option value="all">All methods</option>
                          {rows.map(m => <option key={m.method} value={m.method}>{meta(m.method).label}</option>)}
                        </select>
                      </div>
                      {txns.length === 0 ? (
                        <p className={styles.emptyNote}>No payments to show.</p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className={styles.revTable}>
                            <thead>
                              <tr><th>Date</th><th>Client</th><th>Service</th><th>Staff</th><th>{t("type")}</th><th>Total</th></tr>
                            </thead>
                            <tbody>
                              {txns.map(t => (
                                <tr key={t.id}>
                                  <td>{localeDateStr(new Date(t.date), { month: "short", day: "numeric" })}</td>
                                  <td>{t.clientName}</td>
                                  <td>{t.serviceName}</td>
                                  <td>{t.staffName}</td>
                                  <td><span style={{ color: meta(t.method).color, fontWeight: 700 }}>{meta(t.method).icon}</span> {meta(t.method).label}</td>
                                  <td className={styles.revMoney}>
                                    {money(t.services + t.tips)}
                                    {t.tips > 0 && <span className={styles.emptyNote} style={{ display: "block", fontSize: "var(--text-xs)" }}>incl. {money(t.tips)} tip</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            );
          })()}

          {/* ═══ STAFF REVENUE TAB ═══ */}
          {activeTab === "Staff Revenue" && (
            <>
              {/* Period Controls */}
              <div className={styles.revControls}>
                <div className={styles.revPeriodToggle}>
                  <button className={`${styles.revToggleBtn} ${revPeriodType === 'biweekly' ? styles.revToggleActive : ''}`}
                    onClick={() => { setRevPeriodType('biweekly'); setRevOffset(0); }}>Biweekly</button>
                  <button className={`${styles.revToggleBtn} ${revPeriodType === 'monthly' ? styles.revToggleActive : ''}`}
                    onClick={() => { setRevPeriodType('monthly'); setRevOffset(0); }}>Monthly</button>
                </div>
                <div className={styles.revPeriodNav}>
                  <button className={styles.revNavBtn} onClick={() => setRevOffset(o => o - 1)}>← Previous</button>
                  <span className={styles.revPeriodLabel}>{staffRevData?.period?.label || '...'}</span>
                  <button className={styles.revNavBtn} onClick={() => setRevOffset(o => Math.min(o + 1, 0))} disabled={revOffset >= 0}>Next →</button>
                </div>
                <button className={`btn btn-primary ${styles.revEmailAllBtn}`}
                  disabled={sendingEmail === 'all' || !staffRevData?.staffRevenue?.length}
                  onClick={async () => {
                    setSendingEmail('all');
                    try {
                      const res = await fetch('/api/send-staff-reports', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ period: revPeriodType, offset: revOffset }),
                      });
                      const result = await res.json();
                      toast.success(`Reports sent! ${result.data?.sent || 0} emails delivered.${result.data?.dry_run ? ' (Dry run — set RESEND_API_KEY for live sending)' : ''}`);
                    } catch { toast.error('Failed to send reports.'); }
                    setSendingEmail(null);
                  }}>
                  {sendingEmail === 'all' ? '⏳ Sending...' : '📧 Email All Staff'}
                </button>
                {/* Auto-send toggle — this flag is what the biweekly cron
                    checks; without it the scheduled statements never fire */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!((tenant?.settings as Record<string, unknown>)?.automations as Record<string, boolean> | undefined)?.auto_staff_reports}
                    onChange={async (e) => {
                      await fetch('/api/save-settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ settings: { automations: { auto_staff_reports: e.target.checked } } }),
                      });
                      refetchTenant();
                    }}
                  />
                  Auto-email on the 1st &amp; 16th
                </label>
              </div>

              {/* Summary KPIs */}
              {staffRevData && (
                <div className={styles.kpiGrid}>
                  <div className={`card ${styles.kpiCard}`}>
                    <span className={styles.kpiLabel}>Total Revenue</span>
                    <span className={styles.kpiValue}>{fmt(staffRevData.totals.revenue)}</span>
                    <span className={styles.kpiChange}>{staffRevData.period.label}</span>
                  </div>
                  <div className={`card ${styles.kpiCard}`}>
                    <span className={styles.kpiLabel}>Total Commission</span>
                    <span className={styles.kpiValue} style={{ color: 'var(--color-success)' }}>{fmt(staffRevData.totals.commission)}</span>
                    <span className={styles.kpiChange}>all staff combined</span>
                  </div>
                  <div className={`card ${styles.kpiCard}`}>
                    <span className={styles.kpiLabel}>Total Tips</span>
                    <span className={styles.kpiValue} style={{ color: '#e8b4cb' }}>{fmt(staffRevData.totals.tips)}</span>
                    <span className={styles.kpiChange}>{staffRevData.totals.appointments} appointments</span>
                  </div>
                </div>
              )}

              {/* Revenue Table */}
              {staffRevData && staffRevData.staffRevenue.length > 0 ? (
                <div className={`card ${styles.revTableCard}`}>
                  <table className={styles.revTable}>
                    <thead>
                      <tr>
                        <th>Staff</th>
                        <th>Appts</th>
                        <th>Revenue</th>
                        <th>Rate</th>
                        <th>Commission</th>
                        <th>Tips</th>
                        <th>Avg Ticket</th>
                        <th>Clients</th>
                        <th>Total Earned</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRevData.staffRevenue.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className={styles.revStaffCell}>
                              <div className={styles.revAvatar}>{s.name.charAt(0)}</div>
                              <div>
                                <div className={styles.revName}>{s.name}</div>
                                <div className={styles.revRole}>{s.role}</div>
                              </div>
                            </div>
                          </td>
                          <td>{s.appointments}</td>
                          <td className={styles.revMoney}>{fmt(s.revenue)}</td>
                          <td>{s.commissionRate}%</td>
                          <td className={styles.revMoney} style={{ color: 'var(--color-success)' }}>{fmt(s.commissionEarned)}</td>
                          <td className={styles.revMoney} style={{ color: '#e8b4cb' }}>{fmt(s.tips)}</td>
                          <td>{fmt(s.avgTicket)}</td>
                          <td>{s.uniqueClients}</td>
                          <td className={styles.revMoney} style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(s.commissionEarned + s.tips)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className={`btn btn-ghost btn-sm ${styles.revEmailBtn}`}
                              title="Preview statement"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch('/api/staff-statement/preview', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ staffId: s.id, period: revPeriodType, offset: revOffset }),
                                  });
                                  const result = await res.json();
                                  if (result.data?.url) window.open(result.data.url, '_blank');
                                } catch { toast.error('Failed to generate preview.'); }
                              }}>
                              👁️
                            </button>
                            <button className={`btn btn-ghost btn-sm ${styles.revEmailBtn}`}
                              disabled={!s.email || sendingEmail === s.id}
                              title={s.email ? `Send to ${s.email}` : 'No email on file'}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSendingEmail(s.id);
                                try {
                                  const res = await fetch('/api/send-staff-reports', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ period: revPeriodType, offset: revOffset, staffIds: [s.id] }),
                                  });
                                  const result = await res.json();
                                  toast.success(`Report sent to ${s.name}!${result.data?.dry_run ? ' (Dry run)' : ''}`);
                                } catch { toast.error('Failed to send.'); }
                                setSendingEmail(null);
                              }}>
                              {sendingEmail === s.id ? '⏳' : '📧'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.revTotalsRow}>
                        <td><strong>TOTALS</strong></td>
                        <td><strong>{staffRevData.totals.appointments}</strong></td>
                        <td className={styles.revMoney}><strong>{fmt(staffRevData.totals.revenue)}</strong></td>
                        <td></td>
                        <td className={styles.revMoney} style={{ color: 'var(--color-success)' }}><strong>{fmt(staffRevData.totals.commission)}</strong></td>
                        <td className={styles.revMoney} style={{ color: '#e8b4cb' }}><strong>{fmt(staffRevData.totals.tips)}</strong></td>
                        <td></td>
                        <td></td>
                        <td className={styles.revMoney} style={{ color: 'var(--color-primary)' }}><strong>{fmt(staffRevData.totals.commission + staffRevData.totals.tips)}</strong></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : staffRevData ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>No Revenue Data</h3>
                  <p>No completed appointments found for this period.</p>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
