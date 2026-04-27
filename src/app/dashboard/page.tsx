"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./overview.module.css";
import type { Appointment, Client } from "@/lib/types";

export default function DashboardOverview() {
  const { tenant, currentStaff } = useTenant();

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
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
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
              ? `You have ${metrics.todayAppointments} appointment${metrics.todayAppointments > 1 ? "s" : ""} today`
              : "No appointments today — perfect time to focus on growth!"}
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
            <span className={styles.metricLabel}>TODAY&apos;S REVENUE</span>
            <span className={styles.metricValue}>{loading ? "..." : `$${metrics.todayRevenue}`}</span>
            <span className={styles.metricChange}>{metrics.totalClients} total clients</span>
          </div>
        </div>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>📅</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>APPOINTMENTS TODAY</span>
            <span className={styles.metricValue}>{loading ? "..." : metrics.todayAppointments}</span>
            <span className={styles.metricChange}>{metrics.pendingCount} pending</span>
          </div>
        </div>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>✨</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>NEW CLIENTS THIS WEEK</span>
            <span className={styles.metricValue}>{loading ? "..." : metrics.newClientsWeek}</span>
            <span className={styles.metricChange}>{metrics.totalClients} total</span>
          </div>
        </div>
        <div className={`card ${styles.metricCard}`}>
          <span className={styles.metricIcon}>💜</span>
          <div className={styles.metricInfo}>
            <span className={styles.metricLabel}>RETENTION RATE</span>
            <span className={styles.metricValue}>{loading ? "..." : `${metrics.retentionRate}%`}</span>
            <span className={styles.metricChange}>repeat visitors</span>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className={styles.mainGrid}>
        {/* Today's Schedule */}
        <div className={`card ${styles.scheduleCard}`}>
          <div className={styles.cardHeader}>
            <h2>Today&apos;s Schedule</h2>
            <a href="/dashboard/calendar" className={styles.viewAll}>View Calendar →</a>
          </div>
          {loading ? (
            <p className={styles.emptySchedule}>Loading appointments...</p>
          ) : todayAppointments.length === 0 ? (
            <p className={styles.emptySchedule}>No appointments scheduled for today</p>
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
            <h2>Recent Clients</h2>
            {recentClients.length === 0 ? (
              <p className={styles.emptySchedule}>No clients yet. Add your first client!</p>
            ) : (
              <div className={styles.recentList}>
                {recentClients.map((c) => (
                  <div key={c.id} className={styles.recentRow}>
                    <div className={styles.clientAvatar}>{c.first_name[0]}{c.last_name?.[0] || ""}</div>
                    <div className={styles.clientInfo}>
                      <span className={styles.clientName}>{c.first_name} {c.last_name || ""}</span>
                      <span className={styles.clientMeta}>{c.visit_count} visits · ${c.lifetime_spend}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* At-Risk Clients */}
          <div className={`card ${styles.atRiskCard}`}>
            <div className={styles.scheduleHeader}>
              <h2>⚠️ At-Risk Clients</h2>
              <a href="/dashboard/campaigns" className={styles.viewAll}>Send Campaign</a>
            </div>
            {atRiskClients.length === 0 ? (
              <p className={styles.emptySchedule}>No at-risk clients — great retention!</p>
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
                        Last visit: {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : "Never"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
