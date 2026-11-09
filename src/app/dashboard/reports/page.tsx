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

// label is a reportsPage translation key, except Venmo/Zelle (brand names).
const PAY_METHOD_META: Record<string, { label: string; icon: string; color: string }> = {
  cash: { label: "pmCash", icon: "💵", color: "#2E9E5B" },
  card: { label: "pmCard", icon: "💳", color: "#3B6FD8" },
  venmo: { label: "Venmo", icon: "Ⓥ", color: "#008CFF" },
  zelle: { label: "Zelle", icon: "Ⓩ", color: "#6D1ED4" },
  gift_card: { label: "pmGiftCard", icon: "🎁", color: "#D4A017" },
  mixed: { label: "pmMixed", icon: "🔄", color: "#8A8A8A" },
  other: { label: "notRecorded", icon: "❔", color: "#B0B0B0" },
};
const BRAND_PAY_LABELS = new Set(["Venmo", "Zelle"]);
// The four the owner reconciles are always shown; the rest only when
// something was actually paid that way in the period.
const CORE_PAY_METHODS = ["cash", "card", "venmo", "zelle"];

const TABS = ["Overview", "Staff Performance", "Staff Revenue", "Payment Type", "Client Retention", "Revenue Forecast", "Peak Hours", "Cancellations"] as const;
// Tab ids stay English (they key the fetch switch); these are their label keys.
const TAB_LABEL_KEYS: Record<(typeof TABS)[number], string> = {
  "Overview": "tabOverview",
  "Staff Performance": "tabStaffPerformance",
  "Staff Revenue": "tabStaffRevenue",
  "Payment Type": "paymentType",
  "Client Retention": "tabClientRetention",
  "Revenue Forecast": "tabRevenueForecast",
  "Peak Hours": "tabPeakHours",
  "Cancellations": "tabCancellations",
};

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
          <h1>{t("pageTitle")}</h1>
          <p>{t("pageSubtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {[{ label: t("export90"), days: 90 }, { label: t("export12m"), days: 365 }].map(({ label, days }) => (
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
                if (error || !data) { toast.error(error || t("exportFailed")); return; }
                downloadText(data.filename, data.csv);
                toast.success(t("exportedCount", { count: data.count }));
              }}
            >
              {exporting ? t("exporting") : label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button key={tab} className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`} onClick={() => setActiveTab(tab)}>
            {t(TAB_LABEL_KEYS[tab])}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="pending-fade" style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>{t("loadingAnalytics")}</div>
      ) : (
        <>
          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === "Overview" && overview && (
            <>
              <div className={styles.kpiGrid}>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("monthlyRevenue")}</span>
                  <span className={styles.kpiValue}>{fmt(overview.thisMonth.revenue)}</span>
                  <span className={`${styles.kpiChange} ${overview.thisMonth.revenue >= overview.lastMonth.revenue ? styles.positive : styles.negative}`}>
                    {t("vsLastMonth", { value: overview.lastMonth.revenue > 0 ? `${overview.thisMonth.revenue >= overview.lastMonth.revenue ? '+' : ''}${Math.round(((overview.thisMonth.revenue - overview.lastMonth.revenue) / overview.lastMonth.revenue) * 100)}%` : '—' })}
                  </span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("appointments")}</span>
                  <span className={styles.kpiValue}>{overview.thisMonth.appointments}</span>
                  <span className={`${styles.kpiChange} ${overview.thisMonth.appointments >= overview.lastMonth.appointments ? styles.positive : styles.negative}`}>
                    {t("vsLastMonth", { value: `${overview.thisMonth.appointments - overview.lastMonth.appointments >= 0 ? '+' : ''}${overview.thisMonth.appointments - overview.lastMonth.appointments}` })}
                  </span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("newClients")}</span>
                  <span className={styles.kpiValue}>{overview.thisMonth.newClients}</span>
                  <span className={`${styles.kpiChange} ${overview.thisMonth.newClients >= overview.lastMonth.newClients ? styles.positive : styles.negative}`}>
                    {t("vsLastMonth", { value: `${overview.thisMonth.newClients - overview.lastMonth.newClients >= 0 ? '+' : ''}${overview.thisMonth.newClients - overview.lastMonth.newClients}` })}
                  </span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("noShowRate")}</span>
                  <span className={styles.kpiValue}>{overview.noShowRate || 0}%</span>
                  <span className={styles.kpiChange}>{t("industryAvg")}</span>
                </div>
              </div>

              <div className={`card ${styles.topServicesCard}`}>
                <h2>{t("topServices")}</h2>
                {overview.topServices.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>{t("noCompletedYet")}</p>
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
                        <span className={styles.serviceBookings}>{t("bookingsCount", { count: s.bookings })}</span>
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
                  <h3 style={{ marginBottom: "var(--space-2)" }}>{t("noStaffData")}</h3>
                  <p>{t("noStaffDataHint")}</p>
                </div>
              ) : (
                <div className={styles.staffGrid}>
                  {staffPerf.map((s, i) => (
                    <div key={s.id} className={styles.perfCard} style={i === 0 ? { borderColor: 'rgba(201,160,220,0.4)', boxShadow: 'var(--shadow-glow-soft)' } : {}}>
                      <div className={styles.perfCardHeader}>
                        <div className={styles.perfAvatar}>{s.name.charAt(0)}</div>
                        <div>
                          <div className={styles.perfName}>{i === 0 && '🏆 '}{s.name}</div>
                          <div className={styles.perfRole}>{s.specialties?.[0] || t("teamMember")}</div>
                        </div>
                      </div>
                      <div className={styles.perfStats}>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{fmt(s.revenue)}</div>
                          <div className={styles.perfStatLabel}>{t("revenue")}</div>
                        </div>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{s.completed}</div>
                          <div className={styles.perfStatLabel}>{t("completed")}</div>
                        </div>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{fmt(s.avgTicket)}</div>
                          <div className={styles.perfStatLabel}>{t("avgTicket")}</div>
                        </div>
                        <div className={styles.perfStat}>
                          <div className={styles.perfStatValue}>{s.uniqueClients}</div>
                          <div className={styles.perfStatLabel}>{t("clients")}</div>
                        </div>
                      </div>
                      <div className={styles.perfBar}>
                        <div className={styles.perfBarLabel}>
                          <span>{t("completionRate")}</span>
                          <span>{s.completionRate}%</span>
                        </div>
                        <div className={styles.perfBarTrack}>
                          <div className={styles.perfBarFill} style={{ width: `${s.completionRate}%` }} />
                        </div>
                      </div>
                      {s.commissionRate > 0 && (
                        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                          💰 {t("commissionRate", { rate: s.commissionRate })}: <strong>{fmt(s.commissionEarned)}</strong>
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
                  <div className={styles.retLabel}>{t("retentionRate")}</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: 'var(--color-success)' }}>{retention.summary.active}</div>
                  <div className={styles.retLabel}>{t("active")}</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: '#d97706' }}>{retention.summary.atRisk}</div>
                  <div className={styles.retLabel}>{t("atRisk")}</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: 'var(--color-danger)' }}>{retention.summary.lost}</div>
                  <div className={styles.retLabel}>{t("lost90")}</div>
                </div>
                <div className={styles.retCard}>
                  <div className={styles.retValue} style={{ color: '#3b82f6' }}>{retention.summary.new}</div>
                  <div className={styles.retLabel}>{t("newNoVisit")}</div>
                </div>
              </div>

              <div className={`card ${styles.retListCard}`}>
                <h2>{t("clientHealth")}</h2>
                <div className={styles.retFilters}>
                  {["all", "active", "at_risk", "lost", "new"].map(f => (
                    <button key={f} className={`${styles.retFilterBtn} ${retFilter === f ? styles.retFilterActive : ''}`} onClick={() => setRetFilter(f)}>
                      {t(f === 'all' ? 'filterAll' : f === 'at_risk' ? 'atRisk' : f === 'active' ? 'active' : f === 'lost' ? 'filterLost' : 'filterNew')}
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
                    <span className={styles.retVisits}>{t("visitsCount", { count: c.visit_count })}</span>
                    <span className={styles.retDays} style={{ color: c.daysSinceLastVisit > 90 ? 'var(--color-danger)' : c.daysSinceLastVisit > 45 ? '#d97706' : 'var(--text-secondary)' }}>
                      {c.daysSinceLastVisit > 900 ? t("noVisits") : t("daysAgo", { count: c.daysSinceLastVisit })}
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
                  <span className={styles.kpiLabel}>{t("projected4w")}</span>
                  <span className={styles.kpiValue}>{fmt(forecast.projectedMonthRevenue)}</span>
                  <span className={styles.kpiChange}>{t("fromBooked")}</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("bestCase")}</span>
                  <span className={styles.kpiValue} style={{ color: 'var(--color-success)' }}>{fmt(forecast.bestCase)}</span>
                  <span className={styles.kpiChange}>{t("bestCaseHint")}</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("conservative")}</span>
                  <span className={styles.kpiValue} style={{ color: '#d97706' }}>{fmt(forecast.conservative)}</span>
                  <span className={styles.kpiChange}>{t("conservativeHint")}</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.kpiLabel}>{t("avgWeekly")}</span>
                  <span className={styles.kpiValue}>{fmt(Math.round(forecast.projectedMonthRevenue / 4))}</span>
                  <span className={styles.kpiChange}>{t("perWeekProjected")}</span>
                </div>
              </div>

              <div className={styles.forecastGrid}>
                <div className={`card ${styles.forecastCard}`}>
                  <h2>📅 {t("weeklyForecast")}</h2>
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
                  <h2>📈 {t("sixMonthTrend")}</h2>
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
              <h2>🔥 {t("peakHoursHeatmap")}</h2>
              <p>{t("peakHoursHint")}</p>

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
                          title={`${day} ${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}: ${t("apptCount", { count })}`}
                        >
                          {count > 0 ? count : ''}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>

              <div className={styles.heatmapLegend}>
                <span>{t("low")}</span>
                <div className={styles.heatmapLegendBar}>
                  {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map(op => (
                    <div key={op} className={styles.heatmapLegendSwatch} style={{ background: `rgba(201, 160, 220, ${op})` }} />
                  ))}
                </div>
                <span>{t("high")}</span>
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
                      {d === 365 ? t("months12") : t("daysN", { count: d })}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.kpiGrid}>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>{t("cancelled")}</span>
                  <span className={styles.statValue}>{cancels.total}</span>
                  <span className={styles.statSub}>{t("ofBooked", { count: cancels.booked })}</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>{t("cancellationRate")}</span>
                  <span className={styles.statValue}>{cancels.cancellationRate}%</span>
                  <span className={styles.statSub}>{t("lastNDays", { count: cancels.days })}</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>{t("revenueNotEarned")}</span>
                  <span className={styles.statValue}>{fmt(cancels.lostRevenue)}</span>
                  <span className={styles.statSub}>{t("atListPrice")}</span>
                </div>
                <div className={`card ${styles.kpiCard}`}>
                  <span className={styles.statLabel}>{t("whoCancelled")}</span>
                  <span className={styles.statValue}>
                    {cancels.bySource.client}/{cancels.bySource.salon}
                  </span>
                  <span className={styles.statSub}>{t("clientSalon")}</span>
                </div>
              </div>

              <div className={`card ${styles.revTableCard}`}>
                <h2>{t("whyCancelled")}</h2>
                {cancels.reasons.length === 0 ? (
                  <p className={styles.emptyNote}>{t("noCancellations")}</p>
                ) : (
                  <table className={styles.revTable}>
                    <thead>
                      <tr><th>{t("colReason")}</th><th>{t("colCount")}</th><th>{t("colShare")}</th><th>{t("colValue")}</th></tr>
                    </thead>
                    <tbody>
                      {cancels.reasons.map((r) => (
                        <tr key={r.reason}>
                          <td>{r.reason === "Not recorded" ? <em>{t("notRecorded")}</em> : r.reason}</td>
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
                  <p className={styles.emptyNote}>{t("reasonsSince")}</p>
                )}
              </div>

              <div className={`card ${styles.revTableCard}`}>
                <h2>{t("recentCancellations")}</h2>
                {cancels.recent.length === 0 ? (
                  <p className={styles.emptyNote}>{t("nothingToShow")}</p>
                ) : (
                  <table className={styles.revTable}>
                    <thead>
                      <tr><th>{t("colDate")}</th><th>{t("colClient")}</th><th>{t("colService")}</th><th>{t("colStaff")}</th><th>{t("colReason")}</th><th>{t("colBy")}</th></tr>
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
            const payLabel = (m: string) => { const l = meta(m).label; return BRAND_PAY_LABELS.has(l) ? l : t(l); };
            const rows = (payData?.methods || []).filter(m => CORE_PAY_METHODS.includes(m.method) || m.count > 0);
            const grand = payData?.totals.total || 0;
            const pct = (n: number) => (grand > 0 ? Math.round((n / grand) * 100) : 0);
            const txns = (payData?.transactions || []).filter(tx => payFilter === "all" || tx.method === payFilter);
            return (
              <>
                <div className={styles.revControls}>
                  <div className={styles.revPeriodToggle}>
                    <button className={`${styles.revToggleBtn} ${payPeriodType === 'monthly' ? styles.revToggleActive : ''}`}
                      onClick={() => { setPayPeriodType('monthly'); setPayOffset(0); }}>{t("monthly")}</button>
                    <button className={`${styles.revToggleBtn} ${payPeriodType === 'biweekly' ? styles.revToggleActive : ''}`}
                      onClick={() => { setPayPeriodType('biweekly'); setPayOffset(0); }}>{t("biweekly")}</button>
                  </div>
                  <div className={styles.revPeriodNav}>
                    <button className={styles.revNavBtn} onClick={() => setPayOffset(o => o - 1)}>{t("previous")}</button>
                    <span className={styles.revPeriodLabel}>{payData?.period?.label || '...'}</span>
                    <button className={styles.revNavBtn} onClick={() => setPayOffset(o => Math.min(o + 1, 0))} disabled={payOffset >= 0}>{t("next")}</button>
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
                          title={t("showOnlyThese")}
                        >
                          <span className={styles.kpiLabel}>{meta(m.method).icon} {payLabel(m.method)}</span>
                          <span className={styles.kpiValue}>{money(m.total)}</span>
                          <span className={styles.kpiChange} style={{ color: "var(--text-secondary)" }}>
                            {t("paymentsCount", { count: m.count })} · {pct(m.total)}%
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className={`card ${styles.revTableCard}`}>
                      <h2>{t("incomeByPaymentType")}</h2>
                      {payData.totals.count === 0 ? (
                        <p className={styles.emptyNote}>{t("noCheckedOut")}</p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className={styles.revTable}>
                            <thead>
                              <tr><th>{t("type")}</th><th>{t("colPayments")}</th><th>{t("colServices")}</th><th>{t("colTips")}</th><th>{t("colTotal")}</th><th>{t("colShare")}</th></tr>
                            </thead>
                            <tbody>
                              {rows.map(m => (
                                <tr key={m.method}>
                                  <td><span style={{ color: meta(m.method).color, fontWeight: 700 }}>{meta(m.method).icon}</span> {payLabel(m.method)}</td>
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
                                <td><strong>{t("total")}</strong></td>
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
                        <p className={styles.emptyNote}>{t("mixedNote")}</p>
                      )}
                      {rows.some(m => m.method === "gift_card" && m.count > 0) && (
                        <p className={styles.emptyNote}>{t("giftCardNote")}</p>
                      )}
                    </div>

                    <div className={`card ${styles.revTableCard}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-2)" }}>
                        <h2>{t("payments")}</h2>
                        <select className="input" style={{ width: "auto" }} value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
                          <option value="all">{t("allTypes")}</option>
                          {rows.map(m => <option key={m.method} value={m.method}>{payLabel(m.method)}</option>)}
                        </select>
                      </div>
                      {txns.length === 0 ? (
                        <p className={styles.emptyNote}>{t("noPayments")}</p>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className={styles.revTable}>
                            <thead>
                              <tr><th>{t("colDate")}</th><th>{t("colClient")}</th><th>{t("colService")}</th><th>{t("colStaff")}</th><th>{t("type")}</th><th>{t("colTotal")}</th></tr>
                            </thead>
                            <tbody>
                              {txns.map(tx => (
                                <tr key={tx.id}>
                                  <td>{localeDateStr(new Date(tx.date), { month: "short", day: "numeric" })}</td>
                                  <td>{tx.clientName}</td>
                                  <td>{tx.serviceName}</td>
                                  <td>{tx.staffName}</td>
                                  <td><span style={{ color: meta(tx.method).color, fontWeight: 700 }}>{meta(tx.method).icon}</span> {payLabel(tx.method)}</td>
                                  <td className={styles.revMoney}>
                                    {money(tx.services + tx.tips)}
                                    {tx.tips > 0 && <span className={styles.emptyNote} style={{ display: "block", fontSize: "var(--text-xs)" }}>{t("inclTip", { amount: money(tx.tips) })}</span>}
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
                    onClick={() => { setRevPeriodType('biweekly'); setRevOffset(0); }}>{t("biweekly")}</button>
                  <button className={`${styles.revToggleBtn} ${revPeriodType === 'monthly' ? styles.revToggleActive : ''}`}
                    onClick={() => { setRevPeriodType('monthly'); setRevOffset(0); }}>{t("monthly")}</button>
                </div>
                <div className={styles.revPeriodNav}>
                  <button className={styles.revNavBtn} onClick={() => setRevOffset(o => o - 1)}>{t("previous")}</button>
                  <span className={styles.revPeriodLabel}>{staffRevData?.period?.label || '...'}</span>
                  <button className={styles.revNavBtn} onClick={() => setRevOffset(o => Math.min(o + 1, 0))} disabled={revOffset >= 0}>{t("next")}</button>
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
                      toast.success(`${t("reportsSent", { count: result.data?.sent || 0 })}${result.data?.dry_run ? ' (Dry run — set RESEND_API_KEY for live sending)' : ''}`);
                    } catch { toast.error(t("sendReportsFailed")); }
                    setSendingEmail(null);
                  }}>
                  {sendingEmail === 'all' ? `⏳ ${t("sending")}` : `📧 ${t("emailAllStaff")}`}
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
                  {t("autoEmail")}
                </label>
              </div>

              {/* Summary KPIs */}
              {staffRevData && (
                <div className={styles.kpiGrid}>
                  <div className={`card ${styles.kpiCard}`}>
                    <span className={styles.kpiLabel}>{t("totalRevenue")}</span>
                    <span className={styles.kpiValue}>{fmt(staffRevData.totals.revenue)}</span>
                    <span className={styles.kpiChange}>{staffRevData.period.label}</span>
                  </div>
                  <div className={`card ${styles.kpiCard}`}>
                    <span className={styles.kpiLabel}>{t("totalCommission")}</span>
                    <span className={styles.kpiValue} style={{ color: 'var(--color-success)' }}>{fmt(staffRevData.totals.commission)}</span>
                    <span className={styles.kpiChange}>{t("allStaffCombined")}</span>
                  </div>
                  <div className={`card ${styles.kpiCard}`}>
                    <span className={styles.kpiLabel}>{t("totalTips")}</span>
                    <span className={styles.kpiValue} style={{ color: '#e8b4cb' }}>{fmt(staffRevData.totals.tips)}</span>
                    <span className={styles.kpiChange}>{t("apptCount", { count: staffRevData.totals.appointments })}</span>
                  </div>
                </div>
              )}

              {/* Revenue Table */}
              {staffRevData && staffRevData.staffRevenue.length > 0 ? (
                <div className={`card ${styles.revTableCard}`}>
                  <table className={styles.revTable}>
                    <thead>
                      <tr>
                        <th>{t("colStaff")}</th>
                        <th>{t("colAppts")}</th>
                        <th>{t("revenue")}</th>
                        <th>{t("colRate")}</th>
                        <th>{t("colCommission")}</th>
                        <th>{t("colTips")}</th>
                        <th>{t("avgTicket")}</th>
                        <th>{t("clients")}</th>
                        <th>{t("colTotalEarned")}</th>
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
                              title={t("previewStatement")}
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
                                } catch { toast.error(t("failedPreview")); }
                              }}>
                              👁️
                            </button>
                            <button className={`btn btn-ghost btn-sm ${styles.revEmailBtn}`}
                              disabled={!s.email || sendingEmail === s.id}
                              title={s.email ? t("sendTo", { email: s.email }) : t("noEmailOnFile")}
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
                                  toast.success(`${t("reportSentTo", { name: s.name })}${result.data?.dry_run ? ' (Dry run)' : ''}`);
                                } catch { toast.error(t("failedSend")); }
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
                        <td><strong>{t("totals")}</strong></td>
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
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>{t("noRevenueData")}</h3>
                  <p>{t("noRevenueHint")}</p>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
