"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./settings.module.css";

interface BusinessHours {
  [day: string]: { open: string; close: string; closed: boolean };
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_HOURS: BusinessHours = DAYS.reduce((acc, day) => {
  acc[day] = day === "Sunday"
    ? { open: "", close: "", closed: true }
    : { open: "09:00", close: "18:00", closed: false };
  return acc;
}, {} as BusinessHours);

export default function SettingsPage() {
  const { tenant, refetch } = useTenant();
  const t = useTranslations("settingsPage");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [clientCount, setClientCount] = useState(0);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);
  const [bookingSettings, setBookingSettings] = useState({
    advanceBookingDays: "30",
    cancellationPolicy: "24 hours before",
    depositRequired: "No deposit",
    bufferMinutes: "0",
  });
  const [reminderSettings, setReminderSettings] = useState({
    enabled: true,
    r24h_sms: true,
    r24h_email: true,
    r2h_sms: false,
    r2h_email: false,
    r1h_sms: false,
    r1h_email: false,
  });
  const [staffReminderSettings, setStaffReminderSettings] = useState({
    enabled: false,
    r24h_sms: false,
    r24h_email: true,
    r2h_sms: false,
    r2h_email: false,
    r1h_sms: true,
    r1h_email: false,
  });
  const [reminderTemplates, setReminderTemplates] = useState({
    sms: "Hi {client_name}! This is a reminder that your {service} appointment at {business_name} is tomorrow, {date} at {time}. Reply STOP to opt out.",
    email_subject: "Appointment Reminder — {business_name}",
    email: "Hi {client_name},\n\nThis is a friendly reminder about your upcoming appointment:\n\n📋 Service: {service}\n📅 Date: {date}\n🕐 Time: {time}\n📍 At: {business_name}\n\nNeed to reschedule? Please contact us as soon as possible.\n\nSee you soon!\n— {business_name}",
  });
  const [staffReminderTemplates, setStaffReminderTemplates] = useState({
    sms: "Hi {staff_name}, reminder: {client_name} has a {service} appointment with you on {date} at {time}.",
    email_subject: "Upcoming Appointment — {client_name} at {time}",
    email: "Hi {staff_name},\n\nYou have an upcoming appointment:\n\n👤 Client: {client_name}\n📋 Service: {service}\n📅 Date: {date}\n🕐 Time: {time}\n📍 At: {business_name}\n\nPlease make sure you're prepared and on time.\n\n— {business_name}",
  });

  const [paymentQr, setPaymentQr] = useState({ venmo_qr: "", zelle_qr: "" });

  // Load current settings from tenant
  const loadSettings = useCallback(() => {
    if (!tenant) return;
    setName(tenant.name || "");
    setPhone(tenant.phone || "");
    setEmail(tenant.email || "");
    setWebsite(tenant.website || "");
    setAddress(tenant.address || "");
    setLogoUrl(tenant.logo_url || null);

    // Load business hours from tenant settings JSON
    if (tenant.settings && typeof tenant.settings === "object") {
      const s = tenant.settings as Record<string, unknown>;
      if (s.business_hours) setHours(s.business_hours as BusinessHours);
      if (s.booking) setBookingSettings(s.booking as typeof bookingSettings);
      if (s.reminders) setReminderSettings({ ...reminderSettings, ...(s.reminders as Record<string, boolean>) });
      if (s.staff_reminders) setStaffReminderSettings({ ...staffReminderSettings, ...(s.staff_reminders as Record<string, boolean>) });
      if (s.reminder_templates) setReminderTemplates({ ...reminderTemplates, ...(s.reminder_templates as Record<string, string>) });
      if (s.staff_reminder_templates) setStaffReminderTemplates({ ...staffReminderTemplates, ...(s.staff_reminder_templates as Record<string, string>) });
      if (s.payment_qr) setPaymentQr({ venmo_qr: "", zelle_qr: "", ...(s.payment_qr as Record<string, string>) });
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Fetch client count for cost estimator
  useEffect(() => {
    if (!tenant) return;
    queryData<{ id: string }[]>("clients.list").then(({ data }) => {
      setClientCount(data?.length || 0);
    });
  }, [tenant]);

  function updateHour(day: string, field: "open" | "close", value: string) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  function toggleClosed(day: string) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], closed: !prev[day].closed },
    }));
  }

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    setSaved(false);

    const settings = {
      ...(typeof tenant.settings === "object" && tenant.settings ? tenant.settings : {}),
      business_hours: hours,
      booking: bookingSettings,
      reminders: reminderSettings,
      staff_reminders: staffReminderSettings,
      reminder_templates: reminderTemplates,
      staff_reminder_templates: staffReminderTemplates,
      payment_qr: paymentQr,
    };

    const res = await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: phone || null,
        email: email || null,
        website: website || null,
        address: address || null,
        logo_url: logoUrl,
        settings,
      }),
    });

    if (res.ok) {
      setSaved(true);
      await refetch();
      setTimeout(() => setSaved(false), 3000);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1>{t("title")}</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>{t("title")}</h1>
        <p>Manage your salon profile, business hours, and preferences</p>
      </div>

      {/* Business Profile */}
      <div className={`card ${styles.section}`}>
        <h2>Business Profile</h2>

        {/* Logo Upload */}
        <div className={styles.logoUploadRow}>
          <label className={styles.logoUpload}>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  alert("Image must be under 2 MB");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setLogoUrl(reader.result as string);
                reader.readAsDataURL(file);
              }}
            />
            {logoUrl ? (
              <div className={styles.logoPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Business logo" />
                <div className={styles.logoOverlay}>Change</div>
              </div>
            ) : (
              <div className={styles.logoPlaceholder}>
                <span>＋</span>
                <small>Upload Logo</small>
              </div>
            )}
          </label>
          {logoUrl && (
            <button
              className={styles.logoRemoveBtn}
              onClick={() => setLogoUrl(null)}
              type="button"
            >
              Remove
            </button>
          )}
        </div>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className="label">Business Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label className="label">Business Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(415) 555-0001" />
          </div>
          <div className={styles.formGroup}>
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@yoursalon.com" />
          </div>
          <div className={styles.formGroup}>
            <label className="label">Website</label>
            <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yoursalon.com" />
          </div>
          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <label className="label">Address</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, State ZIP" />
          </div>
        </div>
      </div>

      {/* Business Hours */}
      <div className={`card ${styles.section}`}>
        <h2>Business Hours</h2>
        <div className={styles.hoursList}>
          {DAYS.map((day) => (
            <div key={day} className={styles.hoursRow}>
              <span className={styles.dayName}>{day}</span>
              <div className={styles.hoursInputs}>
                <input
                  className="input"
                  type="time"
                  value={hours[day]?.open || ""}
                  onChange={(e) => updateHour(day, "open", e.target.value)}
                  disabled={hours[day]?.closed}
                  style={{ width: 120 }}
                />
                <span>to</span>
                <input
                  className="input"
                  type="time"
                  value={hours[day]?.close || ""}
                  onChange={(e) => updateHour(day, "close", e.target.value)}
                  disabled={hours[day]?.closed}
                  style={{ width: 120 }}
                />
              </div>
              <label className={styles.closedToggle}>
                <input
                  type="checkbox"
                  checked={hours[day]?.closed || false}
                  onChange={() => toggleClosed(day)}
                />
                Closed
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Booking Settings */}
      <div className={`card ${styles.section}`}>
        <h2>Booking Settings</h2>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className="label">Advance Booking Limit</label>
            <select
              className="input"
              value={bookingSettings.advanceBookingDays}
              onChange={(e) => setBookingSettings({ ...bookingSettings, advanceBookingDays: e.target.value })}
            >
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className="label">Cancellation Policy</label>
            <select
              className="input"
              value={bookingSettings.cancellationPolicy}
              onChange={(e) => setBookingSettings({ ...bookingSettings, cancellationPolicy: e.target.value })}
            >
              <option>24 hours before</option>
              <option>48 hours before</option>
              <option>No cancellation</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className="label">Deposit Required</label>
            <select
              className="input"
              value={bookingSettings.depositRequired}
              onChange={(e) => setBookingSettings({ ...bookingSettings, depositRequired: e.target.value })}
            >
              <option>No deposit</option>
              <option>$10 flat</option>
              <option>20% of service</option>
              <option>50% of service</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className="label">Buffer Between Appointments</label>
            <select
              className="input"
              value={bookingSettings.bufferMinutes}
              onChange={(e) => setBookingSettings({ ...bookingSettings, bufferMinutes: e.target.value })}
            >
              <option value="0">No buffer</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className={`card ${styles.section}`}>
        <h2>💰 Payment Methods</h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
          Upload your Venmo and Zelle QR codes. Staff can show these to clients during checkout.
        </p>
        <div className={styles.formGrid}>
          {/* Venmo */}
          <div className={styles.formGroup}>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ color: '#008CFF', fontWeight: 800, fontSize: '1.1rem' }}>Ⓥ</span> Venmo QR Code
            </label>
            <div className={styles.qrUploadBox}>
              <label className={styles.qrUploadLabel}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { alert("Max 2 MB"); return; }
                    const reader = new FileReader();
                    reader.onload = () => setPaymentQr(prev => ({ ...prev, venmo_qr: reader.result as string }));
                    reader.readAsDataURL(file);
                  }}
                />
                {paymentQr.venmo_qr ? (
                  <div className={styles.qrPreviewWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={paymentQr.venmo_qr} alt="Venmo QR" className={styles.qrPreviewImg} />
                    <div className={styles.qrPreviewOverlay}>Change</div>
                  </div>
                ) : (
                  <div className={styles.qrUploadPlaceholder}>
                    <span style={{ fontSize: '1.5rem' }}>📷</span>
                    <span>Upload QR Code</span>
                  </div>
                )}
              </label>
              {paymentQr.venmo_qr && (
                <button
                  type="button"
                  className={styles.qrRemoveBtn}
                  onClick={() => setPaymentQr(prev => ({ ...prev, venmo_qr: "" }))}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Zelle */}
          <div className={styles.formGroup}>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ color: '#6D1ED4', fontWeight: 800, fontSize: '1.1rem' }}>Ⓩ</span> Zelle QR Code
            </label>
            <div className={styles.qrUploadBox}>
              <label className={styles.qrUploadLabel}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { alert("Max 2 MB"); return; }
                    const reader = new FileReader();
                    reader.onload = () => setPaymentQr(prev => ({ ...prev, zelle_qr: reader.result as string }));
                    reader.readAsDataURL(file);
                  }}
                />
                {paymentQr.zelle_qr ? (
                  <div className={styles.qrPreviewWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={paymentQr.zelle_qr} alt="Zelle QR" className={styles.qrPreviewImg} />
                    <div className={styles.qrPreviewOverlay}>Change</div>
                  </div>
                ) : (
                  <div className={styles.qrUploadPlaceholder}>
                    <span style={{ fontSize: '1.5rem' }}>📷</span>
                    <span>Upload QR Code</span>
                  </div>
                )}
              </label>
              {paymentQr.zelle_qr && (
                <button
                  type="button"
                  className={styles.qrRemoveBtn}
                  onClick={() => setPaymentQr(prev => ({ ...prev, zelle_qr: "" }))}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Receptionist */}
      <div className={`card ${styles.section}`}>
        <h2>🤖 AI Receptionist</h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
          Your 24/7 virtual front desk. Automatically answers questions, suggests available times, and books appointments across Website, SMS, Instagram, and Facebook.
        </p>
        <div className={styles.aiStatusRow}>
          <div className={styles.aiStatusBadges}>
            <span className={`badge ${(() => {
              const bc = ((tenant?.settings || {}) as Record<string, unknown>).bot_config as { enabled?: boolean; channels?: Record<string, boolean> } | undefined;
              return bc?.enabled ? 'badge-success' : 'badge-warning';
            })()}`}>
              {(() => {
                const bc = ((tenant?.settings || {}) as Record<string, unknown>).bot_config as { enabled?: boolean } | undefined;
                return bc?.enabled ? '● Active' : '○ Inactive';
              })()}
            </span>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
              {(() => {
                const bc = ((tenant?.settings || {}) as Record<string, unknown>).bot_config as { channels?: Record<string, boolean> } | undefined;
                const count = bc?.channels ? Object.values(bc.channels).filter(Boolean).length : 0;
                return `${count} channel${count !== 1 ? 's' : ''} connected`;
              })()}
            </span>
          </div>
          <Link href="/dashboard/inbox" className="btn btn-secondary">
            Configure AI →
          </Link>
        </div>
      </div>

      {/* Appointment Reminders */}
      <div className={`card ${styles.section}`}>
        <h2>🔔 Appointment Reminders</h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
          Automatically send reminders before appointments. Reduces no-shows by up to 60%.
        </p>

        {/* Enable toggles */}
        <div className={styles.reminderEnableRow}>
          <label className={styles.protectionToggle}>
            <input
              type="checkbox"
              checked={reminderSettings.enabled}
              onChange={(e) => setReminderSettings({ ...reminderSettings, enabled: e.target.checked })}
            />
            <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
            <span>👤 Client reminders</span>
          </label>
          <label className={styles.protectionToggle}>
            <input
              type="checkbox"
              checked={staffReminderSettings.enabled}
              onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, enabled: e.target.checked })}
            />
            <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
            <span>💇 Staff reminders</span>
          </label>
        </div>

        {/* Unified Reminder Grid */}
        {(reminderSettings.enabled || staffReminderSettings.enabled) && (
          <div
            className={styles.reminderGridUnified}
            style={{
              ['--reminder-cols' as string]:
                reminderSettings.enabled && staffReminderSettings.enabled
                  ? '1fr repeat(4, 80px)'
                  : '1fr repeat(2, 90px)',
            }}
          >
            {/* Super header row */}
            <div className={styles.reminderSuperHeader}>
              <span></span>
              {reminderSettings.enabled && <span className={styles.superHeaderGroup}>👤 Client</span>}
              {staffReminderSettings.enabled && <span className={styles.superHeaderGroup}>💇 Staff</span>}
            </div>
            {/* Sub-header row */}
            <div className={styles.reminderSubHeader}>
              <span>Timing</span>
              {reminderSettings.enabled && <><span>📱 SMS</span><span>📧 Email</span></>}
              {staffReminderSettings.enabled && <><span>📱 SMS</span><span>📧 Email</span></>}
            </div>
            {/* 24-Hour Row */}
            <div className={styles.reminderUnifiedRow}>
              <span className={styles.reminderTimingLabel}>🕐 24 hours before</span>
              {reminderSettings.enabled && (
                <>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={reminderSettings.r24h_sms} onChange={(e) => setReminderSettings({ ...reminderSettings, r24h_sms: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={reminderSettings.r24h_email} onChange={(e) => setReminderSettings({ ...reminderSettings, r24h_email: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </>
              )}
              {staffReminderSettings.enabled && (
                <>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={staffReminderSettings.r24h_sms} onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, r24h_sms: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={staffReminderSettings.r24h_email} onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, r24h_email: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </>
              )}
            </div>
            {/* 2-Hour Row */}
            <div className={styles.reminderUnifiedRow}>
              <span className={styles.reminderTimingLabel}>⏳ 2 hours before</span>
              {reminderSettings.enabled && (
                <>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={reminderSettings.r2h_sms} onChange={(e) => setReminderSettings({ ...reminderSettings, r2h_sms: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={reminderSettings.r2h_email} onChange={(e) => setReminderSettings({ ...reminderSettings, r2h_email: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </>
              )}
              {staffReminderSettings.enabled && (
                <>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={staffReminderSettings.r2h_sms} onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, r2h_sms: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={staffReminderSettings.r2h_email} onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, r2h_email: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </>
              )}
            </div>
            {/* 1-Hour Row */}
            <div className={styles.reminderUnifiedRow}>
              <span className={styles.reminderTimingLabel}>⏰ 1 hour before</span>
              {reminderSettings.enabled && (
                <>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={reminderSettings.r1h_sms} onChange={(e) => setReminderSettings({ ...reminderSettings, r1h_sms: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={reminderSettings.r1h_email} onChange={(e) => setReminderSettings({ ...reminderSettings, r1h_email: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </>
              )}
              {staffReminderSettings.enabled && (
                <>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={staffReminderSettings.r1h_sms} onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, r1h_sms: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                  <label className={styles.protectionToggle}>
                    <input type="checkbox" checked={staffReminderSettings.r1h_email} onChange={(e) => setStaffReminderSettings({ ...staffReminderSettings, r1h_email: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        {/* Message Templates */}
        {(reminderSettings.enabled || staffReminderSettings.enabled) && (
          <div className={styles.reminderTemplates}>
            <h3 style={{ marginTop: "var(--space-5)", marginBottom: "var(--space-3)", fontSize: "var(--text-base)" }}>Message Templates</h3>

            {/* Client Templates */}
            {reminderSettings.enabled && (
              <div className={styles.templateGroup}>
                <div className={styles.templateGroupLabel}>👤 Client Templates</div>
                <small style={{ color: "var(--text-tertiary)", display: "block", marginBottom: "var(--space-3)" }}>
                  Merge tags: {'{client_name}'}, {'{service}'}, {'{staff}'}, {'{business_name}'}, {'{date}'}, {'{time}'}
                </small>

                {(reminderSettings.r24h_sms || reminderSettings.r2h_sms || reminderSettings.r1h_sms) && (
                  <div className={styles.formGroup}>
                    <label className="label">SMS Template</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={reminderTemplates.sms}
                      onChange={(e) => setReminderTemplates({ ...reminderTemplates, sms: e.target.value })}
                    />
                    <small style={{ color: "var(--text-tertiary)" }}>Max ~160 chars recommended for single SMS</small>
                  </div>
                )}

                {(reminderSettings.r24h_email || reminderSettings.r2h_email || reminderSettings.r1h_email) && (
                  <>
                    <div className={styles.formGroup}>
                      <label className="label">Email Subject</label>
                      <input
                        className="input"
                        value={reminderTemplates.email_subject}
                        onChange={(e) => setReminderTemplates({ ...reminderTemplates, email_subject: e.target.value })}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className="label">Email Body</label>
                      <textarea
                        className="input"
                        rows={5}
                        value={reminderTemplates.email}
                        onChange={(e) => setReminderTemplates({ ...reminderTemplates, email: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Staff Templates */}
            {staffReminderSettings.enabled && (
              <div className={styles.templateGroup}>
                <div className={styles.templateGroupLabel}>💇 Staff Templates</div>
                <small style={{ color: "var(--text-tertiary)", display: "block", marginBottom: "var(--space-3)" }}>
                  Merge tags: {'{staff_name}'}, {'{client_name}'}, {'{service}'}, {'{business_name}'}, {'{date}'}, {'{time}'}
                </small>

                {(staffReminderSettings.r24h_sms || staffReminderSettings.r2h_sms || staffReminderSettings.r1h_sms) && (
                  <div className={styles.formGroup}>
                    <label className="label">SMS Template</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={staffReminderTemplates.sms}
                      onChange={(e) => setStaffReminderTemplates({ ...staffReminderTemplates, sms: e.target.value })}
                    />
                    <small style={{ color: "var(--text-tertiary)" }}>Max ~160 chars recommended for single SMS</small>
                  </div>
                )}

                {(staffReminderSettings.r24h_email || staffReminderSettings.r2h_email || staffReminderSettings.r1h_email) && (
                  <>
                    <div className={styles.formGroup}>
                      <label className="label">Email Subject</label>
                      <input
                        className="input"
                        value={staffReminderTemplates.email_subject}
                        onChange={(e) => setStaffReminderTemplates({ ...staffReminderTemplates, email_subject: e.target.value })}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className="label">Email Body</label>
                      <textarea
                        className="input"
                        rows={5}
                        value={staffReminderTemplates.email}
                        onChange={(e) => setStaffReminderTemplates({ ...staffReminderTemplates, email: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking Link */}
      {tenant?.slug && (
        <div className={`card ${styles.section}`}>
          <h2>🔗 Booking Link</h2>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
            Share this link with clients so they can book appointments online. Add it to your Instagram bio, website, or Google profile.
          </p>
          <div className={styles.bookingLinkRow}>
            <input
              className="input"
              readOnly
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/book/${tenant.slug}`}
              onFocus={(e) => e.target.select()}
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--text-sm)" }}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/book/${tenant.slug}`);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
            >
              {linkCopied ? "✓ Copied!" : "Copy Link"}
            </button>
          </div>
          <div style={{ marginTop: "var(--space-3)" }}>
            <a
              href={`/book/${tenant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "var(--text-sm)", color: "var(--color-primary)", fontWeight: 600 }}
            >
              Preview booking page →
            </a>
          </div>
        </div>
      )}

      {/* Client Protection */}
      <div className={`card ${styles.section}`}>
        <h2>🛡️ Client Protection</h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
          When enabled, technician-level staff will see masked phone numbers and email addresses. Owners and managers always see full contact info.
        </p>
        <label className={styles.protectionToggle}>
          <input
            type="checkbox"
            checked={!!((tenant?.settings as Record<string, unknown>)?.client_protection)}
            onChange={(e) => {
              // Will be persisted via the save button below
              const settings = {
                ...(typeof tenant?.settings === "object" && tenant.settings ? tenant.settings : {}),
                client_protection: e.target.checked,
              };
              // Immediately save this toggle
              fetch("/api/save-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
              }).then(() => refetch());
            }}
          />
          <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
          <span>Enable masked communications for technicians</span>
        </label>
      </div>
      {/* Billing & Subscription */}
      <div className={`card ${styles.section}`}>
        <h2>💳 Billing & Subscription</h2>
        <div className={styles.billingCard}>
          <div className={styles.billingInfo}>
            <div className={styles.billingPlan}>
              <span className={styles.planName}>
                {tenant?.subscription_status === 'active'
                  ? (tenant.stripe_price_id ? 'Paid Plan' : 'Active')
                  : tenant?.subscription_status === 'trialing'
                  ? 'Free Trial'
                  : tenant?.subscription_status === 'past_due'
                  ? 'Payment Issue'
                  : tenant?.subscription_status === 'canceled'
                  ? 'Canceled'
                  : 'Free Trial'}
              </span>
              <span className={`badge ${
                tenant?.subscription_status === 'active' ? 'badge-success' :
                tenant?.subscription_status === 'trialing' ? 'badge-info' :
                tenant?.subscription_status === 'past_due' ? 'badge-danger' :
                tenant?.subscription_status === 'canceled' ? 'badge-warning' :
                'badge-info'
              }`}>
                {tenant?.subscription_status || 'trialing'}
              </span>
            </div>
            {tenant?.subscription_status === 'trialing' && tenant?.trial_ends_at && (
              <p className={styles.billingDetail}>
                ⏰ Trial ends: <strong>{new Date(tenant.trial_ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                {(() => {
                  const days = Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / (1000*60*60*24));
                  return days > 0 ? ` (${days} days left)` : ' (expired)';
                })()}
              </p>
            )}
            {tenant?.subscription_status === 'active' && tenant?.current_period_end && (
              <p className={styles.billingDetail}>
                Next billing: <strong>{new Date(tenant.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
              </p>
            )}
            {tenant?.subscription_status === 'past_due' && (
              <p className={styles.billingDetail} style={{ color: 'var(--color-danger)' }}>
                ⚠️ Your last payment failed. Please update your payment method to avoid service interruption.
              </p>
            )}
          </div>
          <div className={styles.billingActions}>
            {tenant?.stripe_customer_id ? (
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  const res = await fetch('/api/stripe/portal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tenantId: tenant.id }),
                  });
                  const { url } = await res.json();
                  if (url) window.location.href = url;
                }}
              >
                Manage Subscription
              </button>
            ) : null}
            {(!tenant?.subscription_status || tenant.subscription_status === 'trialing' || tenant.subscription_status === 'canceled') && (
              <div className={styles.upgradePlans}>
                {[
                  { key: 'starter', name: 'Starter', price: '$25/mo' },
                  { key: 'growth', name: 'Growth', price: '$75/mo' },
                  { key: 'professional', name: 'Professional', price: '$150/mo' },
                ].map(plan => (
                  <button
                    key={plan.key}
                    className={`btn ${plan.key === 'growth' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/stripe/checkout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            planKey: plan.key,
                            tenantId: tenant!.id,
                            tenantEmail: tenant!.email,
                            tenantName: tenant!.name,
                          }),
                        });
                        const data = await res.json();
                        if (data.url) {
                          window.location.href = data.url;
                        } else {
                          alert(`Checkout failed: ${data.error || 'Unable to create checkout session. Please verify your Stripe Price IDs are configured correctly.'}`);
                        }
                      } catch (err) {
                        alert(`Checkout error: ${err instanceof Error ? err.message : 'Network error. Please try again.'}`);
                      }
                    }}
                  >
                    {plan.name} — {plan.price}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className={`card ${styles.section} ${styles.dangerZone}`}>
        <h2>⚠️ Danger Zone</h2>

        {/* Suspend / Reactivate */}
        <div className={styles.dangerItem}>
          <div className={styles.dangerInfo}>
            <h3>Disable Account</h3>
            <p>Suspend your account temporarily. Staff won&apos;t be able to log in and your booking page will be hidden. All data is preserved.</p>
          </div>
          <button
            className={`btn ${tenant?.is_active === false ? 'btn-primary' : 'btn-secondary'} ${styles.dangerBtn}`}
            onClick={async () => {
              const action = tenant?.is_active === false ? 'enable' : 'disable';
              if (action === 'disable' && !confirm('Are you sure you want to suspend your account? Staff will be logged out and bookings will be paused.')) return;
              const res = await fetch('/api/account-management', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
              });
              if (res.ok) {
                await refetch();
                alert(action === 'disable' ? 'Account suspended.' : 'Account reactivated!');
              } else {
                const d = await res.json();
                alert(d.error || 'Failed');
              }
            }}
          >
            {tenant?.is_active === false ? '✓ Reactivate Account' : 'Disable Account'}
          </button>
        </div>

        {/* Deletion scheduled banner */}
        {tenant?.deletion_scheduled_at && (
          <div className={styles.deletionBanner}>
            <div>
              <strong>🗑️ Account scheduled for deletion</strong>
              <p>Your account and all data will be permanently deleted on <strong>{new Date(tenant.deletion_scheduled_at as string).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const res = await fetch('/api/account-management', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'cancel-delete' }),
                });
                if (res.ok) {
                  await refetch();
                  alert('Deletion cancelled! Your account has been reactivated.');
                }
              }}
            >
              Cancel Deletion
            </button>
          </div>
        )}

        {/* Delete Account */}
        <div className={styles.dangerItem}>
          <div className={styles.dangerInfo}>
            <h3>Delete Account</h3>
            <p>Permanently delete your business account and all associated data (clients, appointments, staff, services). This action has a 30-day grace period before data is permanently removed.</p>
          </div>
          <button
            className={`btn ${styles.deleteBtn}`}
            onClick={async () => {
              const confirmName = prompt(`To confirm, please type your business name: "${tenant?.name}"`);
              if (!confirmName) return;
              const res = await fetch('/api/account-management', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', confirm_name: confirmName }),
              });
              const d = await res.json();
              if (res.ok) {
                await refetch();
                alert(`Account scheduled for deletion on ${new Date(d.deletion_date).toLocaleDateString()}. You have 30 days to cancel.`);
              } else {
                alert(d.error || 'Deletion failed');
              }
            }}
          >
            Delete Account
          </button>
        </div>
      </div>

      <div className={styles.saveBar}>
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
