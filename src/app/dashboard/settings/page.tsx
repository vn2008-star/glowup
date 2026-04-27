"use client";

import { useState, useEffect, useCallback } from "react";

import { useTenant } from "@/lib/tenant-context";
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

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

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

  // Load current settings from tenant
  const loadSettings = useCallback(() => {
    if (!tenant) return;
    setName(tenant.name || "");
    setPhone(tenant.phone || "");
    setEmail(tenant.email || "");
    setWebsite(tenant.website || "");
    setAddress(tenant.address || "");

    // Load business hours from tenant settings JSON
    if (tenant.settings && typeof tenant.settings === "object") {
      const s = tenant.settings as Record<string, unknown>;
      if (s.business_hours) setHours(s.business_hours as BusinessHours);
      if (s.booking) setBookingSettings(s.booking as typeof bookingSettings);
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
          <h1>Settings</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Settings</h1>
        <p>Manage your salon profile, business hours, and preferences</p>
      </div>

      {/* Business Profile */}
      <div className={`card ${styles.section}`}>
        <h2>Business Profile</h2>
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
                      const { url } = await res.json();
                      if (url) window.location.href = url;
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

      <div className={styles.saveBar}>
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
