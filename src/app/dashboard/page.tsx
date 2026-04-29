"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./overview.module.css";
import type { Appointment, Client } from "@/lib/types";

export default function DashboardOverview() {
  const { tenant, currentStaff } = useTenant();
  const t = useTranslations("overviewPage");

  const [todayAppointments, setTodayAppointments] = useState<(Appointment & { client?: Client })[]>([]);
  const [metrics, setMetrics] = useState({
    todayRevenue: 0,
    todayAppointments: 0,
    pendingCount: 0,
    newClientsWeek: 0,
    totalClients: 0,
    retentionRate: 0,
  });
  const [recentClients, setRecentClients] = useState<Client[]>([]);
  const [atRiskClients, setAtRiskClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const { data } = await queryData<{
      todayAppointments: (Appointment & { client?: Client })[];
      todayRevenue: number;
      pendingCount: number;
      totalClients: number;
      newClientsWeek: number;
      retentionRate: number;
      recentClients: Client[];
      atRiskClients: Client[];
    }>("dashboard.overview");

    if (data) {
      setTodayAppointments(data.todayAppointments);
      setMetrics({
        todayRevenue: data.todayRevenue,
        todayAppointments: data.todayAppointments.length,
        pendingCount: data.pendingCount,
        newClientsWeek: data.newClientsWeek,
        totalClients: data.totalClients,
        retentionRate: data.retentionRate,
      });
      setRecentClients(data.recentClients);
      setAtRiskClients(data.atRiskClients);
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? t("goodMorning") : hour < 17 ? t("goodAfternoon") : t("goodEvening");
  const staffName = currentStaff?.name?.split(" ")[0] || "there";

  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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
                        {t("lastVisit")}: {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : t("never")}
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
