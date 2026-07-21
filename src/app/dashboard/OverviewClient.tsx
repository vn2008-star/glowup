"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./overview.module.css";
import type { Appointment, Client } from "@/lib/types";
import type { OverviewData } from "@/lib/overview-query";
import { localeDateStr } from "@/lib/utils";

export default function OverviewClient({ initialOverview }: { initialOverview: OverviewData | null }) {
  const { tenant, currentStaff } = useTenant();
  const t = useTranslations("overviewPage");
  const router = useRouter();

  // When the server page pre-fetched the overview, hydrate straight from props
  // — first paint shows real data instead of a spinner.
  const [todayAppointments, setTodayAppointments] = useState<(Appointment & { client?: Client })[]>(
    (initialOverview?.todayAppointments as (Appointment & { client?: Client })[]) ?? []
  );
  const [metrics, setMetrics] = useState({
    todayRevenue: initialOverview?.todayRevenue ?? 0,
    todayAppointments: initialOverview?.todayAppointments?.length ?? 0,
    pendingCount: initialOverview?.pendingCount ?? 0,
    newClientsWeek: initialOverview?.newClientsWeek ?? 0,
    totalClients: initialOverview?.totalClients ?? 0,
    retentionRate: initialOverview?.retentionRate ?? 0,
  });
  const [recentClients, setRecentClients] = useState<Client[]>((initialOverview?.recentClients as Client[]) ?? []);
  const [atRiskClients, setAtRiskClients] = useState<Client[]>((initialOverview?.atRiskClients as Client[]) ?? []);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<(Client & { days_away: number })[]>(
    (initialOverview?.upcomingBirthdays as (Client & { days_away: number })[]) ?? []
  );
  const [promoSent, setPromoSent] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [loading, setLoading] = useState(!initialOverview);

  const fetchDashboardData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const { data } = await queryData<OverviewData>("dashboard.overview");

    if (data) {
      setTodayAppointments(data.todayAppointments as (Appointment & { client?: Client })[]);
      setMetrics({
        todayRevenue: data.todayRevenue,
        todayAppointments: data.todayAppointments.length,
        pendingCount: data.pendingCount,
        newClientsWeek: data.newClientsWeek,
        totalClients: data.totalClients,
        retentionRate: data.retentionRate,
      });
      setRecentClients(data.recentClients as Client[]);
      setAtRiskClients(data.atRiskClients as Client[]);
      setUpcomingBirthdays((data.upcomingBirthdays as (Client & { days_away: number })[]) || []);
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    if (initialOverview) return; // server already provided the first payload
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDashboardData]);

  async function sendBirthdayPromo(clientId: string) {
    setPromoSent((p) => ({ ...p, [clientId]: "sending" }));
    const { data, error } = await queryData<{ sent: number }>("clients.send_birthday_promo", { id: clientId });
    setPromoSent((p) => ({ ...p, [clientId]: !error && data && data.sent > 0 ? "sent" : "error" }));
  }

  // Redirect new subscribers to Quick Start until essential setup is done
  useEffect(() => {
    if (!tenant || loading) return;
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const hasHours = !!settings.business_hours;
    // Check if basic setup is missing: no hours, no staff, no services
    if (!hasHours && metrics.todayAppointments === 0 && metrics.totalClients === 0) {
      // Likely a new subscriber — check staff/services count (in parallel)
      Promise.all([
        queryData<{ id: string }[]>("staff.list"),
        queryData<{ id: string }[]>("services.list"),
      ]).then(([{ data: staffData }, { data: serviceData }]) => {
        const staffCount = staffData?.length || 0;
        const serviceCount = serviceData?.length || 0;
        if (staffCount === 0 || serviceCount === 0 || !hasHours) {
          router.replace("/dashboard/quick-start");
        }
      });
    }
  }, [tenant, loading, metrics, router]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? t("goodMorning") : hour < 17 ? t("goodAfternoon") : t("goodEvening");
  const staffName = currentStaff?.name === 'Admin'
    ? (tenant?.name?.split(' ')[0] || 'there')
    : (currentStaff?.name?.split(" ")[0] || "there");

  const dayName = localeDateStr(now, { weekday: "long" });
  const dateStr = localeDateStr(now, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className={styles.overview}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <div>
          <h1 className={styles.greetingText}>{greeting}, {staffName} ✨</h1>
          <p className={styles.greetingSub}>
            {metrics.todayAppointments > 0
              ? t("appointmentsToday", { count: metrics.todayAppointments })
              : t("noAppointmentsToday")}
          </p>
        </div>
        <div className={styles.dateDisplay}>
          <span className={styles.dateDay}>{dayName}, {dateStr}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.metricsGrid}>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>💰</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>{t("todaysRevenue")}</span>
            <span className={styles.metricValue}>{loading ? "..." : `$${metrics.todayRevenue}`}</span>
            <span className={styles.metricChange}>{metrics.totalClients} {t("totalClients")}</span>
          </div>
        </div>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>📅</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>{t("appointmentsLabel")}</span>
            <span className={styles.metricValue}>{loading ? "..." : metrics.todayAppointments}</span>
            <span className={styles.metricChange}>{metrics.pendingCount} {t("pending")}</span>
          </div>
        </div>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>✨</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>{t("newClientsWeek")}</span>
            <span className={styles.metricValue}>{loading ? "..." : metrics.newClientsWeek}</span>
            <span className={styles.metricChange}>{metrics.totalClients} {t("total")}</span>
          </div>
        </div>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>💜</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>{t("retentionRate")}</span>
            <span className={styles.metricValue}>{loading ? "..." : `${metrics.retentionRate}%`}</span>
            <span className={styles.metricChange}>{t("repeatVisitors")}</span>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className={styles.mainGrid}>
        {/* Today's Schedule */}
        <div className={`card ${styles.scheduleCard}`}>
          <div className={styles.cardHeader}>
            <h2>{t("todaysSchedule")}</h2>
            <a href="/dashboard/calendar" className={styles.viewAll}>{t("viewCalendar")}</a>
          </div>
          {loading ? (
            <p className={styles.emptySchedule}>{t("loadingAppointments")}</p>
          ) : todayAppointments.length === 0 ? (
            <p className={styles.emptySchedule}>{t("noAppointments")}</p>
          ) : (
            <div className={styles.appointmentList}>
              {todayAppointments.map((apt) => {
                const time = new Date(apt.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                return (
                  <div key={apt.id} className={styles.appointmentRow}>
                    <span className={styles.aptTime}>{time}</span>
                    <div className={styles.aptDetails}>
                      <span className={styles.aptClient}>
                        {apt.client ? `${apt.client.first_name} ${apt.client.last_name || ""}` : "Walk-in"}
                      </span>
                      <span className={styles.aptService}>{apt.service?.name || "Service"}</span>
                    </div>
                    <span className={`badge ${apt.status === "confirmed" ? "badge-success" : apt.status === "pending" ? "badge-warning" : "badge-primary"}`}>
                      {apt.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className={styles.rightCol}>
          {/* Upcoming Birthdays */}
          <div className={`card ${styles.recentCard}`} style={{ border: "1px solid var(--color-primary)" }}>
            <div className={styles.scheduleHeader}>
              <h2>🎂 Upcoming Birthdays</h2>
              <a href="/dashboard/loyalty" className={styles.viewAll}>Birthday Special</a>
            </div>
            {loading ? (
              <p className={styles.emptySchedule}>Loading...</p>
            ) : upcomingBirthdays.length === 0 ? (
              <p className={styles.emptySchedule}>No birthdays in the next 30 days</p>
            ) : (
              <div className={styles.recentList}>
                {upcomingBirthdays.map((c) => {
                  const bday = c.birthday ? new Date(c.birthday + "T00:00:00") : null;
                  const when = c.days_away === 0 ? "Today! 🎉" : c.days_away === 1 ? "Tomorrow" : `in ${c.days_away} days`;
                  const status = promoSent[c.id];
                  return (
                    <div key={c.id} className={styles.recentRow}>
                      <div className={styles.clientAvatar} style={{ background: "var(--color-primary)" }}>🎂</div>
                      <div className={styles.clientInfo}>
                        <span className={styles.clientName}>{c.first_name} {c.last_name || ""}</span>
                        <span className={styles.clientMeta}>
                          {bday ? localeDateStr(bday, { month: "short", day: "numeric" }) : ""} · {when}
                        </span>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
                        disabled={status === "sending" || status === "sent"}
                        onClick={() => sendBirthdayPromo(c.id)}
                        title="Send this client your birthday special now"
                      >
                        {status === "sent" ? "✓ Sent" : status === "sending" ? "Sending…" : status === "error" ? "Retry" : "🎁 Send Special"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Clients */}
          <div className={`card ${styles.recentCard}`}>
            <h2>{t("recentClients")}</h2>
            {recentClients.length === 0 ? (
              <p className={styles.emptySchedule}>{t("noClientsYet")}</p>
            ) : (
              <div className={styles.recentList}>
                {recentClients.map((c) => (
                  <div key={c.id} className={styles.recentRow}>
                    <div className={styles.clientAvatar}>{c.first_name[0]}{c.last_name?.[0] || ""}</div>
                    <div className={styles.clientInfo}>
                      <span className={styles.clientName}>{c.first_name} {c.last_name || ""}</span>
                      <span className={styles.clientMeta}>{c.visit_count} {t("visits")} · ${c.lifetime_spend}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* At-Risk Clients */}
          <div className={`card ${styles.atRiskCard}`}>
            <div className={styles.scheduleHeader}>
              <h2>{t("atRiskClients")}</h2>
              <a href="/dashboard/campaigns" className={styles.viewAll}>{t("sendCampaign")}</a>
            </div>
            {atRiskClients.length === 0 ? (
              <p className={styles.emptySchedule}>{t("noAtRisk")}</p>
            ) : (
              <div className={styles.recentList}>
                {atRiskClients.map((c) => (
                  <div key={c.id} className={styles.recentRow}>
                    <div className={styles.clientAvatar} style={{ background: "var(--color-danger)" }}>
                      {c.first_name[0]}{c.last_name?.[0] || ""}
                    </div>
                    <div className={styles.clientInfo}>
                      <span className={styles.clientName}>{c.first_name} {c.last_name || ""}</span>
                      <span className={styles.clientMeta}>
                        {t("lastVisit")}: {c.last_visit ? localeDateStr(new Date(c.last_visit), { month: 'short', day: 'numeric' }) : t("never")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fill My Openings CTA */}
          <a href="/dashboard/campaigns?tab=fill_openings" className={`card ${styles.fillCta}`} style={{ textDecoration: "none" }}>
            <div className={styles.fillCtaContent}>
              <span className={styles.fillCtaBolt}>⚡</span>
              <div>
                <h3 className={styles.fillCtaTitle}>{t("fillMyOpenings")}</h3>
                <p className={styles.fillCtaDesc}>{t("fillDesc")}</p>
              </div>
              <span className={styles.fillCtaArrow}>→</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
