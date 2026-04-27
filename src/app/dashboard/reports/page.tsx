"use client";

import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./reports.module.css";

interface ReportData {
  thisMonth: { revenue: number; appointments: number; newClients: number };
  lastMonth: { revenue: number; appointments: number; newClients: number };
  topServices: { name: string; bookings: number; revenue: number }[];
}

export default function ReportsPage() {
  const { tenant } = useTenant();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data: reportData } = await queryData<ReportData>("reports.overview");
    setData(reportData);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const thisMonth = data?.thisMonth || { revenue: 0, appointments: 0, newClients: 0 };
  const lastMonth = data?.lastMonth || { revenue: 0, appointments: 0, newClients: 0 };
  const revenueGrowth = lastMonth.revenue > 0
    ? Math.round(((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100)
    : 0;
  const apptGrowth = thisMonth.appointments - lastMonth.appointments;
  const clientGrowth = thisMonth.newClients - lastMonth.newClients;
  const avgTicket = thisMonth.appointments > 0 ? Math.round(thisMonth.revenue / thisMonth.appointments) : 0;
  const topServices = data?.topServices || [];
  const maxBookings = topServices.length > 0 ? topServices[0].bookings : 1;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Reports & Analytics</h1>
          <p>Business performance overview</p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading reports...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className={styles.kpiGrid}>
            <div className={`card ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Monthly Revenue</span>
              <span className={styles.kpiValue}>${thisMonth.revenue.toLocaleString()}</span>
              <span className={`${styles.kpiChange} ${revenueGrowth >= 0 ? styles.positive : styles.negative}`}>
                {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth}% vs last month
              </span>
            </div>
            <div className={`card ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Appointments</span>
              <span className={styles.kpiValue}>{thisMonth.appointments}</span>
              <span className={`${styles.kpiChange} ${apptGrowth >= 0 ? styles.positive : styles.negative}`}>
                {apptGrowth >= 0 ? "+" : ""}{apptGrowth} vs last month
              </span>
            </div>
            <div className={`card ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>New Clients</span>
              <span className={styles.kpiValue}>{thisMonth.newClients}</span>
              <span className={`${styles.kpiChange} ${clientGrowth >= 0 ? styles.positive : styles.negative}`}>
                {clientGrowth >= 0 ? "+" : ""}{clientGrowth} vs last month
              </span>
            </div>
            <div className={`card ${styles.kpiCard}`}>
              <span className={styles.kpiLabel}>Avg. Ticket</span>
              <span className={styles.kpiValue}>${avgTicket}</span>
              <span className={styles.kpiChange}>per appointment</span>
            </div>
          </div>

          {/* Top Services */}
          <div className={`card ${styles.topServicesCard}`}>
            <h2>Top Services</h2>
            {topServices.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>No completed appointments yet. Book and complete services to see rankings.</p>
            ) : (
              <div className={styles.servicesList}>
                {topServices.map((s, i) => (
                  <div key={s.name} className={styles.serviceRow}>
                    <span className={styles.serviceRank}>#{i + 1}</span>
                    <div className={styles.serviceInfo}>
                      <span className={styles.serviceName}>{s.name}</span>
                      <div className={styles.serviceBar}>
                        <div className={styles.serviceBarFill} style={{ width: `${(s.bookings / maxBookings) * 100}%` }} />
                      </div>
                    </div>
                    <span className={styles.serviceBookings}>{s.bookings} bookings</span>
                    <span className={styles.serviceRevenue}>${s.revenue.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
