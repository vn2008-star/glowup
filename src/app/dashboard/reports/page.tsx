"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
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

const TABS = ["Overview", "Staff Performance", "Staff Revenue", "Client Retention", "Revenue Forecast", "Peak Hours"] as const;

export default function ReportsPage() {
  const { tenant } = useTenant();
  const t = useTranslations("reportsPage");
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [loading, setLoading] = useState(true);

  // Data for each tab
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [staffPerf, setStaffPerf] = useState<StaffPerf[]>([]);
  const [retention, setRetention] = useState<{ summary: { total: number; active: number; atRisk: number; lost: number; new: number; retentionRate: number }; clients: RetentionClient[] } | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHoursData | null>(null);
  const [retFilter, setRetFilter] = useState<string>("all");

  // Staff Revenue tab state
  const [staffRevData, setStaffRevData] = useState<StaffRevenueData | null>(null);
  const [revPeriodType, setRevPeriodType] = useState<'biweekly' | 'monthly'>('biweekly');
  const [revOffset, setRevOffset] = useState(0);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const fetchTabData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      switch (activeTab) {
        case "Overview": {
          const { data } = await queryData<OverviewData>("reports.overview");
          setOverview(data);
          break;
        }
        case "Staff Performance": {
          const { data } = await queryData<{ staffPerformance: StaffPerf[] }>("reports.staff-performance");
          setStaffPerf(data?.staffPerformance || []);
          break;
        }
        case "Client Retention": {
          const { data } = await queryData<typeof retention>("reports.retention");
          setRetention(data);
          break;
        }
        case "Revenue Forecast": {
          const { data } = await queryData<ForecastData>("reports.forecast");
          setForecast(data);
          break;
        }
        case "Peak Hours": {
          const { data } = await queryData<PeakHoursData>("reports.peak-hours");
          setPeakHours(data);
          break;
        }
        case "Staff Revenue": {
          const { data } = await queryData<StaffRevenueData>("reports.staff-revenue", { period: revPeriodType, offset: revOffset });
          setStaffRevData(data);
          break;
        }
      }
    } finally { setLoading(false); }
  }, [tenant, activeTab, revPeriodType, revOffset]);

  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Reports & Analytics</h1>
          <p>Comprehensive business intelligence dashboard</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button key={tab} className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading analytics...</div>
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
                      alert(`Reports sent! ${result.data?.sent || 0} emails delivered.${result.data?.dry_run ? ' (Dry run — set RESEND_API_KEY for live sending)' : ''}`);
                    } catch { alert('Failed to send reports.'); }
                    setSendingEmail(null);
                  }}>
                  {sendingEmail === 'all' ? '⏳ Sending...' : '📧 Email All Staff'}
                </button>
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
                                } catch { alert('Failed to generate preview.'); }
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
                                  alert(`Report sent to ${s.name}!${result.data?.dry_run ? ' (Dry run)' : ''}`);
                                } catch { alert('Failed to send.'); }
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
