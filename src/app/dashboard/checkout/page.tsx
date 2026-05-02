"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import { GlowUpLogo } from "@/components/GlowUpLogo";
import styles from "./checkout.module.css";
import { useRouter } from "next/navigation";
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mixed" | "venmo" | "zelle" | "gift_card" | "">("")
  const [showQrModal, setShowQrModal] = useState<"venmo" | "zelle" | null>(null);;
  const [upsellServiceId, setUpsellServiceId] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [editingCheckout, setEditingCheckout] = useState(false);
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);

  // Daily tally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tally, setTally] = useState<any>(null);

  // Staff selector (shared tablet mode)
  const [activeStaffId, setActiveStaffId] = useState("all");

  // PIN gate state
  const [pinModalStaffId, setPinModalStaffId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [unlockedStaffId, setUnlockedStaffId] = useState<string | null>(null);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [dashboardExit, setDashboardExit] = useState(false);
  const router = useRouter();

  // Walk-in modal
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInStaff, setWalkInStaff] = useState("");
  const [walkInService, setWalkInService] = useState("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInBirthday, setWalkInBirthday] = useState("");
  const [creatingWalkIn, setCreatingWalkIn] = useState(false);

  // Welcome screen panels
  const [waitlistQueue, setWaitlistQueue] = useState<{ id: string; position: number; client_name: string; service_name: string; staff_name: string; staff_id: string | null; estimated_wait_minutes: number }[]>([]);
  const [staffWaits, setStaffWaits] = useState<{ id: string; name: string; role: string; estimated_wait_minutes: number }[]>([]);
  const [anyStaffWait, setAnyStaffWait] = useState(0);
  const [wlName, setWlName] = useState("");
  const [wlPhone, setWlPhone] = useState("");
  const [wlEmail, setWlEmail] = useState("");
  const [wlBirthday, setWlBirthday] = useState("");
  const [wlService, setWlService] = useState("");
  const [wlStaff, setWlStaff] = useState(""); // "" = Any Staff
  const [wlSubmitting, setWlSubmitting] = useState(false);
  const [wlSuccess, setWlSuccess] = useState(false);
  const [wlShowForm, setWlShowForm] = useState(false);
  const [ciQuery, setCiQuery] = useState("");
  const [ciResults, setCiResults] = useState<{ id: string; start_time: string; client_name: string; service_name: string; staff_name: string; checked_in_at: string | null }[]>([]);
  const [ciSearching, setCiSearching] = useState(false);
  const [ciChecking, setCiChecking] = useState<string | null>(null);

  // Staff-facing waitlist (for Accept flow)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [staffWaitlist, setStaffWaitlist] = useState<any[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);

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
    if (data) setTally(data);
  }, [tenant, selectedDate]);

  useEffect(() => {
    fetchTally();
  }, [fetchTally]);

  // ── Waitlist queue fetching ──
  const fetchWaitlist = useCallback(async () => {
    if (!tenant?.slug) return;
    try {
      const res = await fetch(`/api/public-waitlist?slug=${tenant.slug}`);
      const json = await res.json();
      if (json.queue) setWaitlistQueue(json.queue);
      if (json.staffWaits) setStaffWaits(json.staffWaits);
      if (json.anyStaffWait !== undefined) setAnyStaffWait(json.anyStaffWait);
    } catch { /* silent */ }
  }, [tenant?.slug]);

  useEffect(() => {
    fetchWaitlist();
    // Refresh every 30 seconds
    const iv = setInterval(fetchWaitlist, 30000);
    return () => clearInterval(iv);
  }, [fetchWaitlist]);

  // ── Staff-facing waitlist fetch (raw entries for Accept flow) ──
  const fetchStaffWaitlist = useCallback(async () => {
    if (!tenant) return;
    try {
      const { data } = await queryData<
        { id: string; staff_id: string | null; service_id: string | null; client_id: string | null; client: { first_name: string; last_name?: string } | null; service: { name: string } | null }[]
      >("waitlist.list", {});
      setStaffWaitlist(data || []);
    } catch { /* silent */ }
  }, [tenant]);

  useEffect(() => {
    if (unlockedStaffId) {
      fetchStaffWaitlist();
      const iv = setInterval(fetchStaffWaitlist, 15000);
      return () => clearInterval(iv);
    }
  }, [unlockedStaffId, fetchStaffWaitlist]);

  // ── Accept walk-in handler ──
  async function handleClaimWalkin(waitlistId: string) {
    if (!unlockedStaffId || !tenant) return;
    setClaimingId(waitlistId);

    // Optimistic: remove from waitlist immediately so UI feels instant
    setStaffWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));

    try {
      const { data } = await queryData("waitlist.claim", {
        waitlist_id: waitlistId,
        staff_id: unlockedStaffId,
      });
      if (data) {
        // Refresh appointments + waitlist to sync with server
        await Promise.all([fetchData(), fetchStaffWaitlist(), fetchWaitlist()]);
      }
    } catch {
      // Revert optimistic update on failure
      fetchStaffWaitlist();
    }
    setClaimingId(null);
  }

  async function handleJoinWaitlist() {
    if (!wlName.trim() || !tenant?.slug) return;
    setWlSubmitting(true);
    try {
      const res = await fetch('/api/public-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: tenant.slug,
          client_name: wlName.trim(),
          client_phone: wlPhone.trim() || null,
          client_email: wlEmail.trim() || null,
          client_birthday: wlBirthday || null,
          service_id: wlService || null,
          staff_id: wlStaff || null, // null = "Any Staff"
        }),
      });
      if (res.ok) {
        setWlName("");
        setWlPhone("");
        setWlEmail("");
        setWlBirthday("");
        setWlService("");
        setWlStaff("");
        setWlShowForm(false);
        setWlSuccess(true);
        setTimeout(() => setWlSuccess(false), 4000);
        fetchWaitlist();
      }
    } catch { /* silent */ }
    setWlSubmitting(false);
  }

  async function handleCheckInSearch(query: string) {
    setCiQuery(query);
    if (!query.trim() || query.trim().length < 2 || !tenant?.slug) {
      setCiResults([]);
      return;
    }
    setCiSearching(true);
    try {
      const res = await fetch(`/api/public-checkin?slug=${tenant.slug}&q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      setCiResults(json.appointments || []);
    } catch { /* silent */ }
    setCiSearching(false);
  }

  async function handleCheckIn(appointmentId: string) {
    if (!tenant?.slug) return;
    setCiChecking(appointmentId);
    try {
      const res = await fetch('/api/public-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: tenant.slug, appointment_id: appointmentId }),
      });
      if (res.ok) {
        // Update local results to show checked-in
        setCiResults(prev => prev.map(a =>
          a.id === appointmentId ? { ...a, checked_in_at: new Date().toISOString() } : a
        ));
        // Refresh main appointments list so staff sees the badge
        fetchData();
      }
    } catch { /* silent */ }
    setCiChecking(null);
  }

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
    setPaymentMethod((selectedApt.payment_method as "cash" | "card" | "mixed" | "venmo" | "zelle" | "gift_card") || "");
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

  function getInitials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  // Filter appointments by selected staff
  const filteredApts = appointments.filter((a) => {
    if (activeStaffId === "all") return true;
    // Owners and managers see all appointments
    const selectedStaff = staffMembers.find((s) => s.id === activeStaffId);
    if (selectedStaff?.role === "owner" || selectedStaff?.role === "manager") return true;
    return a.staff_id === activeStaffId;
  });

  const activeStaff = staffMembers.filter((s) => s.is_active).sort((a, b) => {
    const order: Record<string, number> = { owner: 0, manager: 1, technician: 2 };
    return (order[a.role] ?? 9) - (order[b.role] ?? 9);
  });

  // Filtered tally: staff sees only their own, owner/manager sees all
  const filteredTally = useMemo(() => {
    if (!tally) return null;
    if (activeStaffId === "all") return tally;

    // If the selected staff member is an owner or manager, show all staff data
    const selectedStaff = staffMembers.find((s) => s.id === activeStaffId);
    if (selectedStaff?.role === "owner" || selectedStaff?.role === "manager") {
      return tally;
    }

    // Filter to the selected staff member only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffRow = tally.staff.find((s: any) => s.id === activeStaffId);
    const filtered = staffRow ? [staffRow] : [];

    // Recalculate totals from filtered staff
    const totals = {
      services: filtered.reduce((sum: number, s: { services_total: number }) => sum + s.services_total, 0),
      upsells: filtered.reduce((sum: number, s: { upsell_total: number }) => sum + s.upsell_total, 0),
      tips: filtered.reduce((sum: number, s: { tips_total: number }) => sum + s.tips_total, 0),
      appointments: filtered.reduce((sum: number, s: { appointments: number }) => sum + s.appointments, 0),
      commission: filtered.reduce((sum: number, s: { commission_earned: number }) => sum + s.commission_earned, 0),
      cash: staffRow ? (tally.totals.cash * (staffRow.services_total / (tally.totals.services || 1))) : 0,
      card: staffRow ? (tally.totals.card * (staffRow.services_total / (tally.totals.services || 1))) : 0,
    };

    return { staff: filtered, totals };
  }, [tally, activeStaffId, staffMembers]);

  // ── Walk-in ──
  async function handleCreateWalkIn() {
    if (!walkInStaff || !walkInService) return;
    setCreatingWalkIn(true);

    const { data } = await queryData<FullAppointment>("appointments.walk-in", {
      staff_id: walkInStaff,
      service_id: walkInService,
      client_name: walkInName || null,
      client_phone: walkInPhone || null,
      client_birthday: walkInBirthday || null,
    });

    if (data) {
      setAppointments((prev) =>
        [...prev, data].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )
      );
      setSelectedApt(data);
      setShowWalkIn(false);
      setWalkInStaff("");
      setWalkInService("");
      setWalkInName("");
      setWalkInPhone("");
      setWalkInBirthday("");
    }
    setCreatingWalkIn(false);
  }

  // ── Charge management ──
  async function addUpsellCharge() {
    if (!selectedApt || !upsellServiceId) return;
    const svc = services.find((s) => s.id === upsellServiceId);
    if (!svc) return;

    // If no charges exist yet, add the original service as the base charge first
    let currentCharges = [...charges];
    if (currentCharges.length === 0 && selectedApt.service) {
      const { data: baseCharge } = await queryData<AppointmentCharge>("charges.add", {
        appointment_id: selectedApt.id,
        staff_id: selectedApt.staff_id,
        service_id: selectedApt.service.id,
        description: selectedApt.service.name,
        amount: selectedApt.service.price,
        is_upsell: false,
      });
      if (baseCharge) {
        currentCharges = [baseCharge];
      }
    }

    const { data } = await queryData<AppointmentCharge>("charges.add", {
      appointment_id: selectedApt.id,
      staff_id: selectedApt.staff_id,
      service_id: svc.id,
      description: svc.name,
      amount: svc.price,
      is_upsell: true,
    });

    if (data) {
      setCharges([...currentCharges, data]);
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
      setAppointments((prev) =>
        prev.map((a) => (a.id === selectedApt.id ? { ...a, ...data } : a))
      );
      setSelectedApt({ ...selectedApt, ...data });
      fetchTally();

      // Save before/after photos to gallery if any were uploaded
      if (beforePhoto || afterPhoto) {
        await queryData("gallery.create", {
          appointment_id: selectedApt.id,
          client_id: selectedApt.client_id,
          staff_id: selectedApt.staff_id,
          service_id: selectedApt.service_id,
          date: selectedApt.start_time?.split("T")[0] || selectedDate,
          before_photo_urls: beforePhoto ? [beforePhoto] : [],
          after_photo_urls: afterPhoto ? [afterPhoto] : [],
          total_paid: chargeTotal + tip,
        });
        setBeforePhoto(null);
        setAfterPhoto(null);
      }
    }
    setCheckingOut(false);
  }

  const chargesTotal = charges.reduce((sum, c) => sum + Number(c.amount), 0);
  const tip = Number(tipAmount) || 0;
  const grandTotal = chargesTotal + tip;
  const isCheckedOut = selectedApt?.status === "completed" && selectedApt?.checked_out_at && !editingCheckout;

  // Reset editing state when selecting a different appointment
  function handleSelectApt(apt: FullAppointment) {
    setSelectedApt(apt);
    setEditingCheckout(false);
    setBeforePhoto(null);
    setAfterPhoto(null);
  }

  // Reopen a checked-out appointment for editing
  function handleReopenCheckout() {
    if (!selectedApt) return;
    setEditingCheckout(true);
    setTipAmount(String(selectedApt.tip_amount || ""));
    setPaymentMethod((selectedApt.payment_method as "cash" | "card" | "mixed" | "venmo" | "zelle" | "gift_card") || "");
  }

  // ── PIN Gate Logic ──
  function handleStaffTap(staffId: string) {
    // If already unlocked for this staff, just switch
    if (unlockedStaffId === staffId) {
      setActiveStaffId(staffId);
      setSelectedApt(null);
      setEditingCheckout(false);
      return;
    }

    // Find the staff member to check if they have a PIN
    if (staffId === "all") {
      // Owner view — find the owner staff member
      const owner = staffMembers.find((s) => s.role === "owner" || s.role === "manager");
      if (owner?.pin) {
        setPinModalStaffId("all");
        setPinInput("");
        setPinError(false);
        return;
      }
      // No owner PIN set — allow access
      setActiveStaffId("all");
      setUnlockedStaffId("all");
      setSelectedApt(null);
      setEditingCheckout(false);
      return;
    }

    const staff = staffMembers.find((s) => s.id === staffId);
    if (staff?.pin) {
      // PIN required — show keypad
      setPinModalStaffId(staffId);
      setPinInput("");
      setPinError(false);
    } else {
      // No PIN set — allow access
      setActiveStaffId(staffId);
      setUnlockedStaffId(staffId);
      setSelectedApt(null);
      setEditingCheckout(false);
    }
  }

  async function handlePinSubmit(pinValue?: string) {
    const pin = pinValue || pinInput;
    if (!pinModalStaffId || pin.length !== 4) return;
    setPinVerifying(true);

    // For dashboard exit, verify against owner only; for "all" view, owner or manager
    const staffIdToVerify = pinModalStaffId === "dashboard-exit"
      ? (staffMembers.find((s) => s.role === "owner")?.id || "")
      : pinModalStaffId === "all"
      ? (staffMembers.find((s) => s.role === "owner" || s.role === "manager")?.id || "")
      : pinModalStaffId;

    const { data } = await queryData<{ valid: boolean }>("staff.verify-pin", {
      staff_id: staffIdToVerify,
      pin,
    });

    setPinVerifying(false);

    if (data?.valid) {
      if (dashboardExit) {
        // Owner verified — navigate to dashboard
        setDashboardExit(false);
        setPinModalStaffId(null);
        setPinInput("");
        router.push("/dashboard");
        return;
      }
      setActiveStaffId(pinModalStaffId);
      setUnlockedStaffId(pinModalStaffId);
      setSelectedApt(null);
      setEditingCheckout(false);
      setPinModalStaffId(null);
      setPinInput("");
    } else {
      setPinError(true);
      setPinInput("");
      setTimeout(() => setPinError(false), 600);
    }
  }

  function handleLock() {
    setActiveStaffId("all");
    setUnlockedStaffId(null);
    setSelectedApt(null);
    setEditingCheckout(false);
  }

  // Get the name for the PIN modal
  const pinModalStaffName = pinModalStaffId === "all"
    ? t("allStaff")
    : pinModalStaffId === "dashboard-exit"
    ? "Dashboard"
    : staffMembers.find((s) => s.id === pinModalStaffId)?.name || "";

  // ── Render ──
  return (
    <div className={styles.page}>
      {/* ── Welcome Screen (no staff unlocked) ── */}
      {!unlockedStaffId && !loading ? (
        <div className={styles.welcomeScreen}>
          {/* Salon branding */}
          <div className={styles.welcomeBrand}>
            {tenant?.logo_url ? (
              <div className={styles.welcomeLogoWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tenant.logo_url} alt={tenant?.name || "Salon"} className={styles.welcomeLogo} />
              </div>
            ) : (
              <div className={styles.welcomeLogoFallback}>✦</div>
            )}
            <h1 className={styles.welcomeTitle}>{tenant?.name || "Welcome"}</h1>
            <p className={styles.welcomeSubtitle}>{formatDate(selectedDate)}</p>
          </div>

          {/* Staff cards — sorted: owner → manager → technician */}
          <div className={styles.welcomeStaffGrid}>
            {[...activeStaff].sort((a, b) => {
              const order = { owner: 0, manager: 1, technician: 2 } as Record<string, number>;
              return (order[a.role] ?? 9) - (order[b.role] ?? 9);
            }).map((s, i) => {
              const colors = [
                "linear-gradient(135deg, #D4A0D4, #E8B4CB)",
                "linear-gradient(135deg, #B8C9E8, #C4A8D8)",
                "linear-gradient(135deg, #F0C4B8, #E8A0B4)",
                "linear-gradient(135deg, #C4D8C0, #A8C8B8)",
                "linear-gradient(135deg, #E8C4D8, #D4B0C8)",
                "linear-gradient(135deg, #C8B8E0, #B4A0D0)",
              ];
              const count = appointments.filter((a) => a.staff_id === s.id && !a.checked_out_at).length;
              return (
                <button
                  key={s.id}
                  className={styles.welcomeCard}
                  onClick={() => handleStaffTap(s.id)}
                >
                  <div className={styles.welcomeCardAvatar} style={{ background: colors[i % colors.length] }}>
                    {s.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photo_url} alt={s.name} className={styles.welcomeCardImg} />
                    ) : (
                      <span className={styles.welcomeCardInitials}>{getInitials(s.name)}</span>
                    )}
                  </div>
                  <span className={styles.welcomeCardName}>{s.name}</span>
                </button>
              );
            })}
          </div>

          <p className={styles.welcomeHint}>Tap your name to sign in</p>

          {/* ── Walk-in Waitlist + Client Check-in Panels ── */}
          <div className={styles.welcomePanels}>
            {/* Walk-in Waitlist Panel */}
            <div className={styles.welcomePanel}>
              <div className={styles.panelHeader}>
                <div className={`${styles.panelIcon} ${styles.panelIconWaitlist}`}>🚶</div>
                <h3>{t("waitlistTitle")}</h3>
              </div>

              {wlSuccess && (
                <div className={styles.waitlistSuccess}>
                  <span>✅ {t("waitlistJoined")}</span>
                </div>
              )}

              {/* Current Queue — shown first */}
              <div className={styles.queueDivider}>{t("currentQueue")} ({waitlistQueue.length})</div>
              {waitlistQueue.length === 0 ? (
                <p className={styles.queueEmpty}>{t("noOneWaiting")}</p>
              ) : (
                <ul className={styles.queueList}>
                  {waitlistQueue.map((entry) => (
                    <li key={entry.id} className={styles.queueItem}>
                      <div className={styles.queuePosition}>{entry.position}</div>
                      <div className={styles.queueInfo}>
                        <div className={styles.queueName}>{entry.client_name}</div>
                        <div className={styles.queueService}>{entry.service_name} · {entry.staff_name}</div>
                      </div>
                      <div className={styles.queueWait}>~{entry.estimated_wait_minutes} min</div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Join Waitlist Button */}
              <button
                className={`${styles.panelSubmitBtn} ${styles.waitlistSubmitBtn}`}
                onClick={() => setWlShowForm(true)}
              >
                🚶 {t("joinWaitlist")}
              </button>

              {/* Join Waitlist Modal */}
              {wlShowForm && (
                <div className={styles.wlModalOverlay} onClick={() => setWlShowForm(false)}>
                  <div className={styles.wlModal} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.wlModalHeader}>
                      <h3>🚶 {t("joinWaitlist")}</h3>
                      <button className={styles.wlModalClose} onClick={() => setWlShowForm(false)}>✕</button>
                    </div>

                    <div className={styles.panelField}>
                      <label className={styles.panelLabel}>{t("waitlistName")} *</label>
                      <input
                        type="text"
                        className={styles.panelInput}
                        value={wlName}
                        onChange={(e) => setWlName(e.target.value)}
                        placeholder="Jane Smith"
                        autoFocus
                      />
                    </div>

                    <div className={styles.panelField}>
                      <label className={styles.panelLabel}>{t("waitlistPhone")}</label>
                      <input
                        type="tel"
                        className={styles.panelInput}
                        value={wlPhone}
                        onChange={(e) => setWlPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                        required
                      />
                    </div>

                    <div className={styles.panelField}>
                      <label className={styles.panelLabel}>Email (optional)</label>
                      <input
                        type="email"
                        className={styles.panelInput}
                        value={wlEmail}
                        onChange={(e) => setWlEmail(e.target.value)}
                        placeholder="jane@email.com"
                      />
                    </div>

                    <div className={styles.panelField}>
                      <label className={styles.panelLabel}>🎂 Birthday (optional)</label>
                      <input
                        type="date"
                        className={styles.panelInput}
                        value={wlBirthday}
                        onChange={(e) => setWlBirthday(e.target.value)}
                      />
                      <span className={styles.birthdayHint}>We&apos;ll send you a special birthday surprise! 🎁</span>
                    </div>

                    <div className={styles.panelField}>
                      <label className={styles.panelLabel}>{t("waitlistService")}</label>
                      <select
                        className={styles.panelSelect}
                        value={wlService}
                        onChange={(e) => setWlService(e.target.value)}
                      >
                        <option value="">— {t("selectService")} —</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                        ))}
                      </select>
                    </div>

                    {/* Staff Selector with wait times */}
                    <div className={styles.panelField}>
                      <label className={styles.panelLabel}>{t("selectStaff")}</label>
                      <select
                        className={styles.panelSelect}
                        value={wlStaff}
                        onChange={(e) => setWlStaff(e.target.value)}
                      >
                        <option value="">✨ Any Staff — ~{anyStaffWait} min wait</option>
                        {staffWaits.map((sw) => (
                          <option key={sw.id} value={sw.id}>
                            {sw.name} — ~{sw.estimated_wait_minutes} min wait
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      className={`${styles.panelSubmitBtn} ${styles.waitlistSubmitBtn}`}
                      onClick={handleJoinWaitlist}
                      disabled={!wlName.trim() || !wlPhone.trim() || wlSubmitting}
                    >
                      {wlSubmitting ? t("processing") : `🚶 ${t("joinWaitlist")}`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Client Check-in Panel */}
            <div className={styles.welcomePanel}>
              <div className={styles.panelHeader}>
                <div className={`${styles.panelIcon} ${styles.panelIconCheckin}`}>✓</div>
                <h3>{t("checkinTitle")}</h3>
              </div>

              <div className={styles.panelField}>
                <label className={styles.panelLabel}>{t("checkinSearch")}</label>
                <input
                  type="text"
                  className={styles.panelInput}
                  value={ciQuery}
                  onChange={(e) => handleCheckInSearch(e.target.value)}
                  placeholder="Sarah Chen or (555) 123-4567"
                />
              </div>

              <div className={styles.checkinResults}>
                {ciQuery.trim().length < 2 ? (
                  <p className={styles.checkinEmpty}>{t("searchToCheckin")}</p>
                ) : ciSearching ? (
                  <p className={styles.checkinEmpty}>{t("processing")}</p>
                ) : ciResults.length === 0 ? (
                  <p className={styles.checkinEmpty}>{t("noMatchingAppts")}</p>
                ) : (
                  ciResults.map((apt) => {
                    const d = new Date(apt.start_time);
                    const hours = d.getHours();
                    const mins = String(d.getMinutes()).padStart(2, "0");
                    const ampm = hours >= 12 ? "PM" : "AM";
                    const h12 = hours % 12 || 12;
                    const alreadyCheckedIn = !!apt.checked_in_at;

                    return (
                      <div key={apt.id} className={`${styles.checkinItem} ${alreadyCheckedIn ? styles.checkinItemChecked : ""}`}>
                        <div className={styles.checkinTime}>
                          <div className={styles.checkinTimeHour}>{h12}:{mins}</div>
                          <div className={styles.checkinTimePeriod}>{ampm}</div>
                        </div>
                        <div className={styles.checkinInfo}>
                          <div className={styles.checkinClient}>{apt.client_name}</div>
                          <div className={styles.checkinService}>{apt.service_name} · {t("withStaff")} {apt.staff_name}</div>
                        </div>
                        {alreadyCheckedIn ? (
                          <span className={styles.checkinDone}>{t("checkedInStatus")}</span>
                        ) : (
                          <button
                            className={styles.checkinAction}
                            onClick={() => handleCheckIn(apt.id)}
                            disabled={ciChecking === apt.id}
                          >
                            {ciChecking === apt.id ? "..." : t("checkinBtn")}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className={styles.poweredBy}>
            <span className={styles.poweredByText}>powered by</span>
            <GlowUpLogo size={28} />
            <span className={styles.poweredByBrand}>GlowUp</span>
          </div>

          {/* Gear icon for owner escape — below branding */}
          <button
            className={styles.dashboardLink}
            title="Back to Dashboard"
            onClick={() => {
              const owner = staffMembers.find((s) => s.role === "owner");
              if (owner?.pin) {
                setDashboardExit(true);
                setPinModalStaffId("dashboard-exit");
                setPinInput("");
                setPinError(false);
              } else {
                router.push("/dashboard");
              }
            }}
          >
            ⚙️
          </button>
        </div>
      ) : (
        <>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <button
          className={styles.dashboardLink}
          title="Back to Dashboard"
          onClick={() => {
            const owner = staffMembers.find((s) => s.role === "owner");
            if (!owner) return; // Only owners can access dashboard
            if (owner.pin) {
              setDashboardExit(true);
              setPinModalStaffId("dashboard-exit");
              setPinInput("");
              setPinError(false);
            } else {
              router.push("/dashboard");
            }
          }}
        >
          ⚙️
        </button>
        <h1>{t("title")}</h1>
        <div className={styles.headerActions}>
          <div className={styles.dateNav}>
            <button onClick={() => changeDate(-1)}>‹</button>
            <span className={styles.dateLabel}>{formatDate(selectedDate)}</span>
            <button onClick={() => changeDate(1)}>›</button>
          </div>
        </div>
      </div>

      {/* ── Staff Avatar Bar ── */}
      <div className={styles.staffBar}>
        {/* Only show All Staff to unlocked owner/manager */}
        {unlockedStaffId && (staffMembers.find((s) => s.id === unlockedStaffId)?.role === "owner" || staffMembers.find((s) => s.id === unlockedStaffId)?.role === "manager" || unlockedStaffId === "all") && (
          <button
            className={`${styles.staffAvatar} ${activeStaffId === "all" ? styles.staffAvatarActive : ""}`}
            onClick={() => { setActiveStaffId("all"); setSelectedApt(null); }}
          >
            <div className={styles.avatarCircle} style={{ background: "var(--color-primary)" }}>
              ✦
            </div>
            <span className={styles.avatarName}>{t("allStaff")}</span>
          </button>
        )}
        {activeStaff.map((s, i) => {
          const colors = [
            "linear-gradient(135deg, #8B5CF6, #EC4899)",
            "linear-gradient(135deg, #06B6D4, #3B82F6)",
            "linear-gradient(135deg, #F59E0B, #EF4444)",
            "linear-gradient(135deg, #10B981, #059669)",
            "linear-gradient(135deg, #F472B6, #FB923C)",
            "linear-gradient(135deg, #6366F1, #8B5CF6)",
          ];
          return (
            <button
              key={s.id}
              className={`${styles.staffAvatar} ${activeStaffId === s.id ? styles.staffAvatarActive : ""}`}
              onClick={() => handleStaffTap(s.id)}
            >
              <div className={styles.avatarCircle} style={{ background: colors[i % colors.length] }}>
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt={s.name} className={styles.avatarImg} />
                ) : (
                  getInitials(s.name)
                )}
              </div>
              <span className={styles.avatarName}>{s.name.split(" ")[0]}</span>
              {/* Show appointment count badge */}
              {(() => {
                const count = appointments.filter((a) => a.staff_id === s.id && !a.checked_out_at).length;
                return count > 0 ? <span className={styles.avatarBadge}>{count}</span> : null;
              })()}
            </button>
          );
        })}
        {unlockedStaffId && (
          <button className={styles.lockBtn} onClick={handleLock} title={t("lock")}>
            🔒 {t("lock")}
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      ) : (
        <>
          {/* ── Main Layout ── */}
          <div className={`${styles.mainLayout} ${!selectedApt ? styles.mainLayoutFull : ""}`}>
            {/* ── Left: Calendar Day View ── */}
            <div className={styles.aptList}>
              <div className={styles.aptListHeader}>
                <span>{t("todaysAppointments")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span>{filteredApts.length} {t("total")}</span>
                  <button className={styles.walkInBtn} onClick={() => setShowWalkIn(true)}>
                    + {t("walkInBtn")}
                  </button>
                </div>
              </div>

              {/* ── Waitlist: Claimable Walk-ins ── */}
              {(() => {
                // Show entries for this staff, or unclaimed (Any Staff) entries
                const claimable = staffWaitlist.filter((w: { staff_id: string | null }) =>
                  w.staff_id === unlockedStaffId || !w.staff_id
                );
                if (claimable.length === 0) return null;
                return (
                  <div className={styles.waitlistClaimSection}>
                    <div className={styles.waitlistClaimHeader}>
                      <span>🚶 Walk-in Waitlist ({claimable.length})</span>
                    </div>
                    {claimable.map((w: { id: string; staff_id: string | null; client: { first_name: string; last_name?: string } | null; service: { name: string } | null }) => (
                      <div key={w.id} className={styles.waitlistClaimItem}>
                        <div className={styles.queueInfo}>
                          <div className={styles.queueName}>
                            {w.client ? `${w.client.first_name} ${w.client.last_name || ''}`.trim() : 'Guest'}
                          </div>
                          <div className={styles.queueService}>
                            {w.service?.name || 'Service'} · {w.staff_id === unlockedStaffId ? '💜 Requested you' : '👋 Any Staff'}
                          </div>
                        </div>
                        <button
                          className={styles.claimBtn}
                          onClick={() => handleClaimWalkin(w.id)}
                          disabled={claimingId === w.id}
                        >
                          {claimingId === w.id ? '...' : '✋ Accept'}
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div className={styles.aptListBody}>
                {filteredApts.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span style={{ fontSize: 40 }}>📋</span>
                    <p>{t("noAppointments")}</p>
                    <button className={styles.walkInBtnLarge} onClick={() => setShowWalkIn(true)}>
                      + {t("walkInBtn")}
                    </button>
                  </div>
                ) : (() => {
                  // Calendar time grid constants — dynamic based on appointments
                  const CAL_SLOT_H = 80; // px per hour
                  const DEFAULT_START = 9;
                  const DEFAULT_END = 19;

                  // Find earliest and latest appointments to expand grid if needed
                  let earliestHour = DEFAULT_START;
                  let latestHour = DEFAULT_END;
                  filteredApts.forEach(a => {
                    const s = new Date(a.start_time);
                    const e = new Date(a.end_time);
                    const sH = s.getHours() + s.getMinutes() / 60;
                    const eH = e.getHours() + e.getMinutes() / 60;
                    if (sH < earliestHour) earliestHour = sH;
                    if (eH > latestHour) latestHour = eH;
                  });

                  const CAL_START = Math.min(DEFAULT_START, Math.floor(earliestHour));
                  const CAL_END = Math.max(DEFAULT_END, Math.ceil(latestHour));
                  const HOURS = Array.from({ length: CAL_END - CAL_START }, (_, i) => i + CAL_START);

                  const fmtHour = (h: number) => {
                    const ampm = h >= 12 ? "PM" : "AM";
                    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                    return `${h12} ${ampm}`;
                  };

                  const getPos = (time: string) => {
                    const d = new Date(time);
                    const hDec = d.getHours() + d.getMinutes() / 60;
                    return (hDec - CAL_START) * CAL_SLOT_H;
                  };

                  const getH = (start: string, end: string) => {
                    const s = new Date(start);
                    const e = new Date(end);
                    const hrs = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
                    return Math.max(hrs * CAL_SLOT_H, 40);
                  };

                  const aptColor = (status: string) => {
                    switch (status) {
                      case "completed": return "var(--color-success)";
                      case "cancelled": return "#ef4444";
                      default: return "var(--color-primary)";
                    }
                  };

                  // Current time marker
                  const now = new Date();
                  const nowHDec = now.getHours() + now.getMinutes() / 60;
                  const isToday = selectedDate === now.toISOString().split("T")[0];

                  const staffColors = [
                    "linear-gradient(135deg, #8B5CF6, #EC4899)",
                    "linear-gradient(135deg, #06B6D4, #3B82F6)",
                    "linear-gradient(135deg, #F59E0B, #EF4444)",
                    "linear-gradient(135deg, #10B981, #059669)",
                    "linear-gradient(135deg, #F472B6, #FB923C)",
                    "linear-gradient(135deg, #6366F1, #8B5CF6)",
                  ];

                  // Determine columns: multi-staff for "all", single for individual
                  const isAllStaff = activeStaffId === "all";
                  const columns = isAllStaff
                    ? activeStaff.map((s, i) => ({ staff: s, color: staffColors[i % staffColors.length] }))
                    : [{ staff: activeStaff.find(s => s.id === activeStaffId) || activeStaff[0], color: staffColors[0] }];

                  // Helper: get open slots for a staff's appointments
                  const getOpenSlots = (staffApts: FullAppointment[]) => {
                    const sorted = [...staffApts].sort(
                      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                    );
                    const slots: { start: number; end: number }[] = [];
                    let cur = CAL_START;
                    for (const apt of sorted) {
                      const aStart = new Date(apt.start_time).getHours() + new Date(apt.start_time).getMinutes() / 60;
                      const aEnd = new Date(apt.end_time).getHours() + new Date(apt.end_time).getMinutes() / 60;
                      if (aStart > cur) slots.push({ start: cur, end: aStart });
                      cur = Math.max(cur, aEnd);
                    }
                    if (cur < CAL_END) slots.push({ start: cur, end: CAL_END });
                    return slots;
                  };

                  return isAllStaff ? (
                    /* ═══ All Staff: Multi-Column Grid ═══ */
                    <div className={styles.calMulti}>
                      {/* Time labels column */}
                      <div className={styles.calTimeCol}>
                        <div className={styles.calTimeHeader} />
                        <div className={styles.calTimeBody}>
                          {HOURS.map((h) => (
                            <div key={h} className={styles.calTimeSlot}>
                              <span className={styles.calSlotLabel}>{fmtHour(h)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Staff columns */}
                      {columns.map(({ staff, color }, colIdx) => {
                        if (!staff) return null;
                        const staffApts = filteredApts.filter(a => a.staff_id === staff.id);
                        const openSlots = getOpenSlots(staffApts);
                        return (
                          <div key={staff.id} className={styles.calStaffCol}>
                            {/* Column header */}
                            <div className={styles.calColHeader}>
                              <div className={styles.calColAvatar} style={{ background: color }}>
                                {staff.photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={staff.photo_url} alt={staff.name} className={styles.avatarImg} />
                                ) : (
                                  getInitials(staff.name)
                                )}
                              </div>
                              <span className={styles.calColName}>{staff.name}</span>
                              <span className={styles.calColCount}>{staffApts.length}</span>
                            </div>
                            {/* Column body */}
                            <div className={styles.calColBody}>
                              {/* Hour gridlines */}
                              {HOURS.map((h) => (
                                <div key={h} className={styles.calColLine} style={{ top: `${(h - CAL_START) * CAL_SLOT_H}px` }} />
                              ))}
                              {/* Open slots */}
                              {openSlots.map((slot, i) => (
                                <div
                                  key={`open-${colIdx}-${i}`}
                                  className={styles.calOpen}
                                  style={{
                                    top: `${(slot.start - CAL_START) * CAL_SLOT_H}px`,
                                    height: `${(slot.end - slot.start) * CAL_SLOT_H}px`,
                                    left: 4, right: 4,
                                  }}
                                  onClick={() => setShowWalkIn(true)}
                                />
                              ))}
                              {/* Appointment blocks */}
                              {staffApts.map((apt) => {
                                const clientName = apt.client
                                  ? `${apt.client.first_name} ${apt.client.last_name || ""}`.trim()
                                  : t("walkIn");
                                return (
                                  <div
                                    key={apt.id}
                                    className={`${styles.calApt} ${selectedApt?.id === apt.id ? styles.calAptActive : ""} ${apt.checked_out_at ? styles.calAptDone : ""}`}
                                    style={{
                                      top: `${getPos(apt.start_time)}px`,
                                      height: `${getH(apt.start_time, apt.end_time)}px`,
                                      borderLeftColor: aptColor(apt.status),
                                      left: 4, right: 4,
                                    }}
                                    onClick={() => handleSelectApt(apt)}
                                  >
                                    <span className={styles.calAptClient}>{clientName}</span>
                                    <span className={styles.calAptService}>{apt.service?.name || "Service"}</span>
                                    <span className={styles.calAptTime}>
                                      {formatTime(apt.start_time)} – {formatTime(apt.end_time)}
                                    </span>
                                    {apt.checked_in_at && !apt.checked_out_at && <span className={styles.checkedInBadge}>ARRIVED</span>}
                                    {apt.checked_out_at && <span className={styles.calAptBadge}>✓</span>}
                                  </div>
                                );
                              })}
                              {/* Now marker */}
                              {isToday && nowHDec >= CAL_START && nowHDec <= CAL_END && (
                                <div className={styles.calNow} style={{ top: `${(nowHDec - CAL_START) * CAL_SLOT_H}px` }}>
                                  <span className={styles.calNowDot} />
                                  <span className={styles.calNowLine} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ═══ Single Staff: Original Single Column ═══ */
                    <div className={styles.calGrid}>
                      {/* Hour lines */}
                      {HOURS.map((h) => (
                        <div key={h} className={styles.calSlot}>
                          <span className={styles.calSlotLabel}>{fmtHour(h)}</span>
                          <div className={styles.calSlotLine} />
                        </div>
                      ))}

                      {/* Open slots */}
                      {(() => {
                        const openSlots = getOpenSlots(filteredApts);
                        return openSlots.map((slot, i) => (
                          <div
                            key={`open-${i}`}
                            className={styles.calOpen}
                            style={{
                              top: `${(slot.start - CAL_START) * CAL_SLOT_H}px`,
                              height: `${(slot.end - slot.start) * CAL_SLOT_H}px`,
                            }}
                            onClick={() => setShowWalkIn(true)}
                            title={`Open: ${fmtHour(slot.start)} – ${fmtHour(slot.end)}`}
                          >
                            <span className={styles.calOpenLabel}>+ Fill Opening</span>
                          </div>
                        ));
                      })()}

                      {/* Appointment blocks */}
                      {filteredApts.map((apt) => {
                        const clientName = apt.client
                          ? `${apt.client.first_name} ${apt.client.last_name || ""}`.trim()
                          : t("walkIn");
                        return (
                          <div
                            key={apt.id}
                            className={`${styles.calApt} ${selectedApt?.id === apt.id ? styles.calAptActive : ""} ${apt.checked_out_at ? styles.calAptDone : ""}`}
                            style={{
                              top: `${getPos(apt.start_time)}px`,
                              height: `${getH(apt.start_time, apt.end_time)}px`,
                              borderLeftColor: aptColor(apt.status),
                            }}
                            onClick={() => handleSelectApt(apt)}
                          >
                            <span className={styles.calAptClient}>{clientName}</span>
                            <span className={styles.calAptService}>{apt.service?.name || "Service"}</span>
                            <span className={styles.calAptTime}>
                              {formatTime(apt.start_time)} – {formatTime(apt.end_time)}
                            </span>
                            {apt.checked_in_at && !apt.checked_out_at && <span className={styles.checkedInBadge}>ARRIVED</span>}
                            {apt.checked_out_at && <span className={styles.calAptBadge}>✓</span>}
                          </div>
                        );
                      })}

                      {/* Now marker */}
                      {isToday && nowHDec >= CAL_START && nowHDec <= CAL_END && (
                        <div className={styles.calNow} style={{ top: `${(nowHDec - CAL_START) * CAL_SLOT_H}px` }}>
                          <span className={styles.calNowDot} />
                          <span className={styles.calNowLine} />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Right: Checkout Panel (only when appointment selected) ── */}
            {selectedApt && (
            <div className={styles.checkoutPanel}>
              {(() => { return (
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

                    {charges.length === 0 && selectedApt.service && (
                      <div className={styles.chargeRow}>
                        <span className={styles.chargeName}>{selectedApt.service.name}</span>
                        <span className={styles.chargeAmount}>${Number(selectedApt.service.price).toFixed(2)}</span>
                      </div>
                    )}

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
                      <button
                        className={styles.editCheckoutBtn}
                        onClick={handleReopenCheckout}
                      >
                        ✏️ {t("editCheckout")}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.paymentSection}>
                      <div className={styles.subtotalRow}>
                        <span>{t("subtotal")}</span>
                        <strong>${(charges.length > 0 ? chargesTotal : Number(selectedApt.service?.price || 0)).toFixed(2)}</strong>
                      </div>

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

                      <div className={styles.totalRow}>
                        <span>{t("total")}</span>
                        <span>${(charges.length > 0 ? grandTotal : Number(selectedApt.service?.price || 0) + tip).toFixed(2)}</span>
                      </div>

                      <div className={styles.paymentMethods}>
                        {(["cash", "card", "venmo", "zelle", "gift_card", "mixed"] as const).map((m) => {
                          const icons: Record<string, string> = { cash: "💵", card: "💳", mixed: "🔄", venmo: "Ⓥ", zelle: "Ⓩ", gift_card: "🎁" };
                          const labels: Record<string, string> = { cash: t("cash"), card: t("card"), mixed: t("mixed"), venmo: "Venmo", zelle: "Zelle", gift_card: "Gift Card" };
                          const colors: Record<string, string> = { venmo: "#008CFF", zelle: "#6D1ED4", gift_card: "#D4A017" };
                          return (
                            <button
                              key={m}
                              className={`${styles.paymentBtn} ${paymentMethod === m ? styles.paymentBtnActive : ""}`}
                              onClick={() => {
                                setPaymentMethod(m);
                                if (m === "venmo" || m === "zelle") {
                                  const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>;
                                  const paymentSettings = (tenantSettings.payment_qr || {}) as Record<string, string>;
                                  if (paymentSettings[`${m}_qr`]) {
                                    setShowQrModal(m);
                                  }
                                }
                              }}
                              style={paymentMethod === m && colors[m] ? { borderColor: colors[m], background: `${colors[m]}18` } : {}}
                            >
                              <span className={styles.paymentIcon} style={colors[m] ? { fontSize: "1.25rem", fontWeight: 800, color: colors[m] } : {}}>
                                {icons[m]}
                              </span>
                              {labels[m]}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        className={styles.checkoutBtn}
                        onClick={handleCheckout}
                        disabled={!paymentMethod || checkingOut}
                      >
                        {checkingOut ? t("processing") : `✓ ${t("completeCheckout")}`}
                      </button>
                    </div>
                  )}
                  {/* ── Before & After Photos ── */}
                  {!isCheckedOut && (
                    <div className={styles.photoSection}>
                      <div className={styles.photoSectionTitle}>📸 Before & After</div>
                      <div className={styles.photoUploads}>
                        <label className={styles.photoSlot}>
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) { alert("Max 2 MB"); return; }
                            const r = new FileReader();
                            r.onload = () => setBeforePhoto(r.result as string);
                            r.readAsDataURL(file);
                          }} />
                          {beforePhoto ? (
                            <div className={styles.photoThumb}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={beforePhoto} alt="Before" />
                              <button className={styles.photoRemove} onClick={(e) => { e.preventDefault(); setBeforePhoto(null); }}>✕</button>
                            </div>
                          ) : (
                            <div className={styles.photoPlaceholder}>
                              <span>＋</span>
                              <small>Before</small>
                            </div>
                          )}
                        </label>
                        <label className={styles.photoSlot}>
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) { alert("Max 2 MB"); return; }
                            const r = new FileReader();
                            r.onload = () => setAfterPhoto(r.result as string);
                            r.readAsDataURL(file);
                          }} />
                          {afterPhoto ? (
                            <div className={styles.photoThumb}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={afterPhoto} alt="After" />
                              <button className={styles.photoRemove} onClick={(e) => { e.preventDefault(); setAfterPhoto(null); }}>✕</button>
                            </div>
                          ) : (
                            <div className={styles.photoPlaceholder}>
                              <span>＋</span>
                              <small>After</small>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  )}
                </>
              ) })()}
            </div>
            )}
          </div>

          {/* ── Daily Tally ── */}
          {filteredTally && (
            <div className={styles.tallySection}>
              <div className={styles.tallyHeader}>
                <h2>📊 {t("dailyTally")}{activeStaffId !== "all" ? ` — ${filteredTally.staff[0]?.name || ""}` : ""}</h2>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
                  {formatDate(selectedDate)}
                </span>
              </div>

              <table className={styles.tallyTable}>
                <thead>
                  <tr>
                    <th>{t("staffMember")}</th>
                    <th>{t("client")}</th>
                    <th>{t("services")}</th>
                    <th>{t("upsells")}</th>
                    <th>{t("tips")}</th>
                    <th>{t("commission")}</th>
                    <th>{t("payout")}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {filteredTally.staff.map((s: any) => (
                    <Fragment key={s.id}>
                      {/* Staff summary row */}
                      <tr key={s.id} className={styles.tallyStaffRow}>
                        <td rowSpan={s.details?.length > 0 ? 1 : 1}>
                          <strong>{s.name}</strong>
                          <span className={styles.tallySubtext}>{s.appointments} appt{s.appointments !== 1 ? 's' : ''}</span>
                        </td>
                        <td colSpan={4} className={styles.tallyStaffSummary}>
                          Total: ${s.services_total.toFixed(2)} services · ${s.upsell_total.toFixed(2)} add-ons · ${s.tips_total.toFixed(2)} tips
                        </td>
                        <td>{s.commission_rate}%</td>
                        <td className={styles.commissionCell}>${s.commission_earned.toFixed(2)}</td>
                      </tr>
                      {/* Detail rows per appointment */}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(s.details || []).map((d: any) => (
                        <tr key={d.appointment_id} className={styles.tallyDetailRow}>
                          <td></td>
                          <td>{d.client_name}</td>
                          <td>{d.service_name} <span className={styles.tallyPrice}>${d.service_price.toFixed(2)}</span></td>
                          <td>
                            {d.add_ons.length > 0
                              ? d.add_ons.map((a: any, i: number) => (
                                  <span key={i} className={styles.tallyAddOn}>
                                    {a.name} <span className={styles.tallyPrice}>${a.amount.toFixed(2)}</span>
                                    {i < d.add_ons.length - 1 ? ', ' : ''}
                                  </span>
                                ))
                              : <span className={styles.tallyMuted}>—</span>
                            }
                          </td>
                          <td>{d.tip > 0 ? `$${d.tip.toFixed(2)}` : <span className={styles.tallyMuted}>—</span>}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {activeStaffId === "all" && (
                    <tr className={styles.tallyTotalRow}>
                      <td>{t("total")}</td>
                      <td>{filteredTally.totals.appointments} appts</td>
                      <td>${filteredTally.totals.services.toFixed(2)}</td>
                      <td>${filteredTally.totals.upsells.toFixed(2)}</td>
                      <td>${filteredTally.totals.tips.toFixed(2)}</td>
                      <td>—</td>
                      <td className={styles.commissionCell}>${filteredTally.totals.commission.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className={styles.paymentSplit}>
                <div className={styles.splitBadge}>
                  <span className={styles.splitIcon}>💵</span>
                  {t("cash")}: ${filteredTally.totals.cash.toFixed(2)}
                </div>
                <div className={styles.splitBadge}>
                  <span className={styles.splitIcon}>💳</span>
                  {t("card")}: ${filteredTally.totals.card.toFixed(2)}
                </div>
                {activeStaffId === "all" && (
                  <div className={styles.splitBadge}>
                    <span className={styles.splitIcon}>🏪</span>
                    {t("ownerRevenue")}: ${(filteredTally.totals.services - filteredTally.totals.commission + filteredTally.totals.tips).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* ── Walk-in Modal ── */}
      {showWalkIn && (
        <div className={styles.modalOverlay} onClick={() => setShowWalkIn(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>🚶 {t("walkInTitle")}</h2>
              <button className={styles.modalClose} onClick={() => setShowWalkIn(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {/* Service */}
              <label className={styles.formLabel}>{t("selectService")} *</label>
              <select className={styles.formSelect} value={walkInService} onChange={(e) => setWalkInService(e.target.value)}>
                <option value="">{t("selectService")}...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>
                ))}
              </select>

              {/* Staff */}
              <label className={styles.formLabel}>{t("selectStaff")} *</label>
              <select className={styles.formSelect} value={walkInStaff} onChange={(e) => setWalkInStaff(e.target.value)}>
                <option value="">{t("selectStaff")}...</option>
                {activeStaff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {/* Client Name (optional) */}
              <label className={styles.formLabel}>{t("clientName")}</label>
              <input
                type="text"
                className={styles.formInput}
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Jane Smith"
              />

              {/* Phone (optional) */}
              <label className={styles.formLabel}>{t("clientPhone")}</label>
              <input
                type="tel"
                className={styles.formInput}
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />

              {/* Birthday (optional) */}
              <label className={styles.formLabel}>🎂 {t("clientBirthday")}</label>
              <input
                type="date"
                className={styles.formInput}
                value={walkInBirthday}
                onChange={(e) => setWalkInBirthday(e.target.value)}
              />
              <span className={styles.birthdayHint}>🎁 {t("birthdaySurprise")}</span>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.walkInSubmitBtn}
                onClick={handleCreateWalkIn}
                disabled={!walkInStaff || !walkInService || creatingWalkIn}
              >
                {creatingWalkIn ? t("processing") : `🚶 ${t("createWalkIn")}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Keypad Modal ── */}
      {pinModalStaffId && (
        <div className={styles.pinOverlay} onClick={() => setPinModalStaffId(null)}>
          <div className={`${styles.pinModal} ${pinError ? styles.pinShake : ""}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pinHeader}>
              <span className={styles.pinLockIcon}>🔒</span>
              <h3>{pinModalStaffName}</h3>
              <p>{t("enterPin")}</p>
            </div>
            <div className={styles.pinDots}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`${styles.pinDot} ${pinInput.length > i ? styles.pinDotFilled : ""}`} />
              ))}
            </div>
            {pinError && <p className={styles.pinErrorText}>{t("wrongPin")}</p>}
            <div className={styles.pinKeypad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  className={styles.pinKey}
                  onClick={() => {
                    const next = pinInput + String(n);
                    setPinInput(next);
                    if (next.length === 4) {
                      setTimeout(() => handlePinSubmit(next), 150);
                    }
                  }}
                  disabled={pinInput.length >= 4}
                >
                  {n}
                </button>
              ))}
              <button className={`${styles.pinKey} ${styles.pinKeyMuted}`} onClick={() => setPinModalStaffId(null)}>
                ✕
              </button>
              <button
                className={styles.pinKey}
                onClick={() => {
                  const next = pinInput + "0";
                  setPinInput(next);
                  if (next.length === 4) {
                    setTimeout(() => handlePinSubmit(next), 150);
                  }
                }}
                disabled={pinInput.length >= 4}
              >
                0
              </button>
              <button className={`${styles.pinKey} ${styles.pinKeyMuted}`} onClick={() => setPinInput(pinInput.slice(0, -1))}>
                ⌫
              </button>
            </div>
            {pinVerifying && <p className={styles.pinVerifying}>{t("processing")}</p>}
          </div>
        </div>
      )}

      {/* ── Venmo / Zelle QR Code Modal ── */}
      {showQrModal && (() => {
        const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>;
        const paymentSettings = (tenantSettings.payment_qr || {}) as Record<string, string>;
        const qrImage = paymentSettings[`${showQrModal}_qr`];
        const brandColor = showQrModal === "venmo" ? "#008CFF" : "#6D1ED4";
        const brandName = showQrModal === "venmo" ? "Venmo" : "Zelle";

        return (
          <div className={styles.qrOverlay} onClick={() => setShowQrModal(null)}>
            <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
              <button className={styles.qrClose} onClick={() => setShowQrModal(null)}>×</button>
              <div className={styles.qrBrand} style={{ color: brandColor }}>
                <span className={styles.qrBrandIcon}>{showQrModal === "venmo" ? "Ⓥ" : "Ⓩ"}</span>
                {brandName}
              </div>
              <p className={styles.qrInstruction}>Show this QR code to the client</p>
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrImage} alt={`${brandName} QR Code`} className={styles.qrImage} />
              ) : (
                <div className={styles.qrPlaceholder}>
                  <p>No QR code uploaded</p>
                  <small>Go to Settings → Payment Methods to upload</small>
                </div>
              )}
              <button className={styles.qrDoneBtn} style={{ background: brandColor }} onClick={() => setShowQrModal(null)}>
                Done
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
