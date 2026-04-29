"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./checkout.module.css";
import type { Appointment, Service, AppointmentCharge, Staff } from "@/lib/types";

type FullAppointment = Appointment & {
  client?: { first_name: string; last_name: string | null; phone: string | null };
  staff_member?: Staff;
  service?: Service;
};

export default function CheckoutPage() {
  const { tenant } = useTenant();
  const t = useTranslations("checkoutPage");
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<FullAppointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // Checkout state
  const [selectedApt, setSelectedApt] = useState<FullAppointment | null>(null);
  const [charges, setCharges] = useState<AppointmentCharge[]>([]);
  const [tipAmount, setTipAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mixed" | "">("");
  const [upsellServiceId, setUpsellServiceId] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  // Daily tally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tally, setTally] = useState<any>(null);
  const [staffFilter, setStaffFilter] = useState("all");

  // Current user info
  const [currentStaffId, setCurrentStaffId] = useState("");
  const [currentStaffRole, setCurrentStaffRole] = useState("");

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const dayStart = `${selectedDate}T00:00:00`;
    const dayEnd = `${selectedDate}T23:59:59`;

    const [aptsRes, svcRes, staffRes] = await Promise.all([
      queryData<FullAppointment[]>("appointments.list", { startDate: dayStart, endDate: dayEnd }),
      queryData<Service[]>("services.list"),
      queryData<Staff[]>("staff.list"),
    ]);

    setAppointments(
      (aptsRes.data || []).sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    );
    setServices((svcRes.data || []).filter((s) => s.is_active));
    setStaffMembers(staffRes.data || []);
    setLoading(false);
  }, [tenant, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch tally data
  const fetchTally = useCallback(async () => {
    if (!tenant) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await queryData<any>("reports.daily-tally", { date: selectedDate });
    if (data) {
      setTally(data);
      setCurrentStaffId(data.currentStaffId);
      setCurrentStaffRole(data.currentStaffRole);
    }
  }, [tenant, selectedDate]);

  useEffect(() => {
    fetchTally();
  }, [fetchTally]);

  // Fetch charges when appointment is selected
  useEffect(() => {
    if (!selectedApt) {
      setCharges([]);
      return;
    }
    (async () => {
      const { data } = await queryData<AppointmentCharge[]>("charges.list", {
        appointment_id: selectedApt.id,
      });
      setCharges(data || []);
    })();
    setTipAmount(String(selectedApt.tip_amount || ""));
    setPaymentMethod((selectedApt.payment_method as "cash" | "card" | "mixed") || "");
  }, [selectedApt]);

  // ── Helpers ──
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  function changeDate(delta: number) {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    const newDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setSelectedDate(newDate);
    setSelectedApt(null);
  }

  const isOwnerOrManager = currentStaffRole === "owner" || currentStaffRole === "manager";

  // Filter appointments based on role
  const filteredApts = appointments.filter((a) => {
    if (isOwnerOrManager) {
      if (staffFilter === "all") return true;
      return a.staff_id === staffFilter;
    }
    // Technicians see only their own
    return a.staff_id === currentStaffId;
  });

  // ── Charge management ──
  async function addUpsellCharge() {
    if (!selectedApt || !upsellServiceId) return;
    const svc = services.find((s) => s.id === upsellServiceId);
    if (!svc) return;

    const { data } = await queryData<AppointmentCharge>("charges.add", {
      appointment_id: selectedApt.id,
      staff_id: selectedApt.staff_id,
      service_id: svc.id,
      description: svc.name,
      amount: svc.price,
      is_upsell: true,
    });

    if (data) {
      setCharges((prev) => [...prev, data]);
      setUpsellServiceId("");
    }
  }

  async function removeCharge(chargeId: string) {
    await queryData("charges.delete", { id: chargeId });
    setCharges((prev) => prev.filter((c) => c.id !== chargeId));
  }

  // ── Checkout ──
  async function handleCheckout() {
    if (!selectedApt || !paymentMethod) return;
    setCheckingOut(true);

    // If no charges exist yet, auto-create the original service charge
    let currentCharges = charges;
    if (currentCharges.length === 0 && selectedApt.service) {
      const { data } = await queryData<AppointmentCharge>("charges.add", {
        appointment_id: selectedApt.id,
        staff_id: selectedApt.staff_id,
        service_id: selectedApt.service.id,
        description: selectedApt.service.name,
        amount: selectedApt.service.price,
        is_upsell: false,
      });
      if (data) currentCharges = [data];
    }

    const chargeTotal = currentCharges.reduce((sum, c) => sum + Number(c.amount), 0);
    const tip = Number(tipAmount) || 0;

    const { data } = await queryData<FullAppointment>("appointments.checkout", {
      id: selectedApt.id,
      payment_method: paymentMethod,
      tip_amount: tip,
      total_price: chargeTotal,
    });

    if (data) {
      // Update local state
      setAppointments((prev) =>
        prev.map((a) => (a.id === selectedApt.id ? { ...a, ...data } : a))
      );
      setSelectedApt({ ...selectedApt, ...data });
      fetchTally();
    }
    setCheckingOut(false);
  }

  const chargesTotal = charges.reduce((sum, c) => sum + Number(c.amount), 0);
  const tip = Number(tipAmount) || 0;
  const grandTotal = chargesTotal + tip;
  const isCheckedOut = selectedApt?.status === "completed" && selectedApt?.checked_out_at;

  // ── Render ──
  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <h1>{t("title")}</h1>
        <div className={styles.headerActions}>
          {isOwnerOrManager && (
            <select
              className={styles.staffFilter}
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
            >
              <option value="all">{t("allStaff")}</option>
              {staffMembers.filter((s) => s.is_active).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className={styles.dateNav}>
            <button onClick={() => changeDate(-1)}>‹</button>
            <span className={styles.dateLabel}>{formatDate(selectedDate)}</span>
            <button onClick={() => changeDate(1)}>›</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      ) : (
        <>
          {/* ── Main Layout ── */}
          <div className={styles.mainLayout}>
            {/* ── Left: Appointment List ── */}
            <div className={styles.aptList}>
              <div className={styles.aptListHeader}>
                <span>{t("todaysAppointments")}</span>
                <span>{filteredApts.length} {t("total")}</span>
              </div>
              <div className={styles.aptListBody}>
                {filteredApts.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span style={{ fontSize: 40 }}>📋</span>
                    <p>{t("noAppointments")}</p>
                  </div>
                ) : (
                  filteredApts.map((apt) => (
                    <div
                      key={apt.id}
                      className={`${styles.aptItem} ${selectedApt?.id === apt.id ? styles.aptItemActive : ""} ${apt.checked_out_at ? styles.aptItemCheckedOut : ""}`}
                      onClick={() => setSelectedApt(apt)}
                    >
                      <div
                        className={`${styles.aptDot} ${
                          apt.status === "completed" ? styles.aptDotCompleted :
                          apt.status === "confirmed" ? styles.aptDotConfirmed :
                          apt.status === "cancelled" ? styles.aptDotCancelled :
                          styles.aptDotPending
                        }`}
                      />
                      <div className={styles.aptInfo}>
                        <div className={styles.aptTime}>{formatTime(apt.start_time)} – {formatTime(apt.end_time)}</div>
                        <div className={styles.aptClient}>
                          {apt.client ? `${apt.client.first_name} ${apt.client.last_name || ""}`.trim() : t("walkIn")}
                        </div>
                        <div className={styles.aptService}>
                          {apt.service?.name || "Service"} • {apt.staff_member?.name || "Unassigned"}
                        </div>
                      </div>
                      <div>
                        {apt.checked_out_at ? (
                          <span className={`${styles.aptStatus} ${styles.statusCompleted}`}>✓ {t("done")}</span>
                        ) : apt.status === "confirmed" ? (
                          <span className={`${styles.aptStatus} ${styles.statusConfirmed}`}>{t("confirmed")}</span>
                        ) : (
                          <span className={`${styles.aptStatus} ${styles.statusPending}`}>{apt.status}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Right: Checkout Panel ── */}
            <div className={styles.checkoutPanel}>
              {!selectedApt ? (
                <div className={styles.checkoutEmpty}>
                  <span>💳</span>
                  <p>{t("selectAppointment")}</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className={styles.checkoutHeader}>
                    <h2>{t("checkoutTitle")}</h2>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                      {formatTime(selectedApt.start_time)}
                    </span>
                  </div>

                  {/* Client Info */}
                  <div className={styles.checkoutClientInfo}>
                    <div className={styles.clientAvatar}>
                      {selectedApt.client
                        ? `${selectedApt.client.first_name[0]}${(selectedApt.client.last_name || "")[0] || ""}`
                        : "W"}
                    </div>
                    <div className={styles.clientDetails}>
                      <h3>
                        {selectedApt.client
                          ? `${selectedApt.client.first_name} ${selectedApt.client.last_name || ""}`.trim()
                          : t("walkIn")}
                      </h3>
                      <p>{selectedApt.staff_member?.name || "Unassigned"} • {selectedApt.service?.name}</p>
                    </div>
                  </div>

                  {/* Charges */}
                  <div className={styles.chargesSection}>
                    <div className={styles.chargesTitle}>
                      <span>{t("services")}</span>
                    </div>

                    {/* Original service (always shown) */}
                    {charges.length === 0 && selectedApt.service && (
                      <div className={styles.chargeRow}>
                        <span className={styles.chargeName}>{selectedApt.service.name}</span>
                        <span className={styles.chargeAmount}>${Number(selectedApt.service.price).toFixed(2)}</span>
                      </div>
                    )}

                    {/* Logged charges */}
                    {charges.map((ch) => (
                      <div key={ch.id} className={styles.chargeRow}>
                        <span className={styles.chargeName}>
                          {ch.description}
                          {ch.is_upsell && <span className={styles.chargeUpsell}>{t("upsell")}</span>}
                        </span>
                        <span className={styles.chargeAmount}>
                          ${Number(ch.amount).toFixed(2)}
                          {!isCheckedOut && (
                            <button className={styles.chargeDelete} onClick={() => removeCharge(ch.id)}>✕</button>
                          )}
                        </span>
                      </div>
                    ))}

                    {/* Add upsell */}
                    {!isCheckedOut && (
                      <div className={styles.addUpsellRow}>
                        <select value={upsellServiceId} onChange={(e) => setUpsellServiceId(e.target.value)}>
                          <option value="">+ {t("addService")}</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                          ))}
                        </select>
                        <button
                          className={styles.addUpsellBtn}
                          onClick={addUpsellCharge}
                          disabled={!upsellServiceId}
                        >
                          {t("add")}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payment */}
                  {isCheckedOut ? (
                    <div className={styles.alreadyCheckedOut}>
                      <div className={styles.checkedOutBadge}>
                        ✓ {t("checkedOut")} — {selectedApt.payment_method?.toUpperCase()} — ${Number(selectedApt.total_price || 0).toFixed(2)}
                        {Number(selectedApt.tip_amount) > 0 && ` + $${Number(selectedApt.tip_amount).toFixed(2)} tip`}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.paymentSection}>
                      {/* Subtotal */}
                      <div className={styles.subtotalRow}>
                        <span>{t("subtotal")}</span>
                        <strong>${(charges.length > 0 ? chargesTotal : Number(selectedApt.service?.price || 0)).toFixed(2)}</strong>
                      </div>

                      {/* Tip */}
                      <div className={styles.tipRow}>
                        <label>{t("tip")}</label>
                        <span>$</span>
                        <input
                          type="number"
                          className={styles.tipInput}
                          value={tipAmount}
                          onChange={(e) => setTipAmount(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      {/* Total */}
                      <div className={styles.totalRow}>
                        <span>{t("total")}</span>
                        <span>${(charges.length > 0 ? grandTotal : Number(selectedApt.service?.price || 0) + tip).toFixed(2)}</span>
                      </div>

                      {/* Payment method */}
                      <div className={styles.paymentMethods}>
                        {(["cash", "card", "mixed"] as const).map((m) => (
                          <button
                            key={m}
                            className={`${styles.paymentBtn} ${paymentMethod === m ? styles.paymentBtnActive : ""}`}
                            onClick={() => setPaymentMethod(m)}
                          >
                            <span className={styles.paymentIcon}>
                              {m === "cash" ? "💵" : m === "card" ? "💳" : "🔄"}
                            </span>
                            {t(m)}
                          </button>
                        ))}
                      </div>

                      {/* Checkout button */}
                      <button
                        className={styles.checkoutBtn}
                        onClick={handleCheckout}
                        disabled={!paymentMethod || checkingOut}
                      >
                        {checkingOut ? t("processing") : `✓ ${t("completeCheckout")}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Daily Tally (owner/manager only) ── */}
          {isOwnerOrManager && tally && (
            <div className={styles.tallySection}>
              <div className={styles.tallyHeader}>
                <h2>📊 {t("dailyTally")}</h2>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
                  {formatDate(selectedDate)}
                </span>
              </div>

              {/* KPI Cards */}
              <div className={styles.tallyKPIs}>
                <div className={styles.tallyKPI}>
                  <div className="kpiLabel">{t("totalRevenue")}</div>
                  <div className={`kpiValue ${styles.tallyKPI}`}>
                    <span className="kpiValueAccent">${tally.totals.services.toFixed(2)}</span>
                  </div>
                </div>
                <div className={styles.tallyKPI}>
                  <div className="kpiLabel">{t("totalTips")}</div>
                  <div className="kpiValue kpiValueSuccess">${tally.totals.tips.toFixed(2)}</div>
                </div>
                <div className={styles.tallyKPI}>
                  <div className="kpiLabel">{t("upsellRevenue")}</div>
                  <div className="kpiValue">${tally.totals.upsells.toFixed(2)}</div>
                </div>
                <div className={styles.tallyKPI}>
                  <div className="kpiLabel">{t("appointments")}</div>
                  <div className="kpiValue">{tally.totals.appointments}</div>
                </div>
                <div className={styles.tallyKPI}>
                  <div className="kpiLabel">{t("commissionPayout")}</div>
                  <div className="kpiValue kpiValueSuccess">${tally.totals.commission.toFixed(2)}</div>
                </div>
              </div>

              {/* Staff Breakdown Table */}
              <table className={styles.tallyTable}>
                <thead>
                  <tr>
                    <th>{t("staffMember")}</th>
                    <th>{t("appointments")}</th>
                    <th>{t("services")}</th>
                    <th>{t("upsells")}</th>
                    <th>{t("tips")}</th>
                    <th>{t("commission")}</th>
                    <th>{t("payout")}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {tally.staff.map((s: any) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.appointments}</td>
                      <td>${s.services_total.toFixed(2)}</td>
                      <td>${s.upsell_total.toFixed(2)}</td>
                      <td>${s.tips_total.toFixed(2)}</td>
                      <td>{s.commission_rate}%</td>
                      <td className={styles.commissionCell}>${s.commission_earned.toFixed(2)}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className={styles.tallyTotalRow}>
                    <td>{t("total")}</td>
                    <td>{tally.totals.appointments}</td>
                    <td>${tally.totals.services.toFixed(2)}</td>
                    <td>${tally.totals.upsells.toFixed(2)}</td>
                    <td>${tally.totals.tips.toFixed(2)}</td>
                    <td>—</td>
                    <td className={styles.commissionCell}>${tally.totals.commission.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Payment Split */}
              <div className={styles.paymentSplit}>
                <div className={styles.splitBadge}>
                  <span className={styles.splitIcon}>💵</span>
                  {t("cash")}: ${tally.totals.cash.toFixed(2)}
                </div>
                <div className={styles.splitBadge}>
                  <span className={styles.splitIcon}>💳</span>
                  {t("card")}: ${tally.totals.card.toFixed(2)}
                </div>
                <div className={styles.splitBadge}>
                  <span className={styles.splitIcon}>🏪</span>
                  {t("ownerRevenue")}: ${(tally.totals.services - tally.totals.commission + tally.totals.tips).toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
