"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import { locales, localeNames, localeFlags, type Locale } from "@/i18n/config";
import styles from "./quickstart.module.css";

/* ─── Step Definitions ─── */
interface Step {
  id: string;
  number: number;
  title: string;
  description: string;
  href: string;
  checkComplete: (ctx: SetupContext) => boolean;
}

interface AdvancedFeature {
  icon: string;
  title: string;
  description: string;
  href: string;
}

interface SetupContext {
  tenant: Record<string, unknown> | null;
  staffCount: number;
  serviceCount: number;
  clientCount: number;
}

const ESSENTIAL_STEPS: Step[] = [
  {
    id: "profile",
    number: 1,
    title: "Business Profile & Hours",
    description: "Add your salon name, logo, contact info, address, and set your weekly open/close times.",
    href: "/dashboard/settings?section=profile",
    checkComplete: (ctx) => {
      if (!ctx.tenant) return false;
      const t = ctx.tenant;
      const settings = t.settings as Record<string, unknown> | null;
      return !!(t.name && (t.phone || t.email) && t.address && settings?.business_hours);
    },
  },
  {
    id: "staff",
    number: 2,
    title: "Add Staff Members",
    description: "Add your stylists and technicians with their roles, specialties, and contact info.",
    href: "/dashboard/staff",
    checkComplete: (ctx) => ctx.staffCount > 0,
  },
  {
    id: "services",
    number: 3,
    title: "Create Services",
    description: "Add your service menu — cuts, colors, treatments, etc. — with pricing and duration.",
    href: "/dashboard/services",
    checkComplete: (ctx) => ctx.serviceCount > 0,
  },
  {
    id: "booking",
    number: 4,
    title: "Share Your Booking Link",
    description: "Share your booking link so clients can book and enter their contact info automatically — your client list builds itself over time.",
    href: "/dashboard/settings?section=booking-link",
    checkComplete: (ctx) => {
      if (!ctx.tenant) return false;
      return !!ctx.tenant.slug;
    },
  },
  {
    id: "reminders",
    number: 5,
    title: "Set Up Reminders",
    description: "Enable SMS and email reminders for both clients and staff to reduce no-shows.",
    href: "/dashboard/settings?section=reminders",
    checkComplete: (ctx) => {
      if (!ctx.tenant) return false;
      const settings = ctx.tenant.settings as Record<string, unknown> | null;
      const reminders = settings?.reminders as Record<string, boolean> | null;
      return !!(reminders && reminders.enabled);
    },
  },
  {
    id: "frontdesk",
    number: 6,
    title: "Try the Front Desk",
    description: "Open the full-screen POS mode to check in walk-ins, process payments, and manage your day.",
    href: "/dashboard/checkout",
    checkComplete: () => false,
  },
];

const ADVANCED_FEATURES: AdvancedFeature[] = [
  {
    icon: "🖥️",
    title: "Front Desk / Checkout",
    description: "Full-screen POS mode for walk-ins and checkout — designed for shared tablets at the front desk.",
    href: "/dashboard/checkout",
  },
  {
    icon: "💰",
    title: "Staff Revenue Reports",
    description: "Auto-generate biweekly or monthly itemized revenue statements and email them directly to each staff member.",
    href: "/dashboard/reports",
  },
  {
    icon: "🎁",
    title: "Packages & Bundles",
    description: "Create multi-service packages and gift bundles that increase average ticket value.",
    href: "/dashboard/packages",
  },
  {
    icon: "📇",
    title: "Import or Add Clients",
    description: "Bulk import existing clients via CSV or add them manually. Optional — your client list also builds automatically as clients book online.",
    href: "/dashboard/clients",
  },
  {
    icon: "📸",
    title: "Gallery & Portfolio",
    description: "Showcase your best work with a client-facing photo gallery to attract new bookings.",
    href: "/dashboard/gallery",
  },
  {
    icon: "📊",
    title: "Reports & Analytics",
    description: "Track revenue, busiest times, top services, and staff performance at a glance.",
    href: "/dashboard/reports",
  },
  {
    icon: "📣",
    title: "Campaigns & Marketing",
    description: "Send targeted SMS/email blasts to fill openings, promote specials, or re-engage inactive clients.",
    href: "/dashboard/campaigns",
  },
  {
    icon: "📱",
    title: "Social Media Hub",
    description: "Manage your Instagram, Facebook, and Google presence from one unified dashboard.",
    href: "/dashboard/social",
  },
  {
    icon: "💜",
    title: "Loyalty Program",
    description: "Reward repeat visits with points, punch cards, or tiered VIP perks to increase retention.",
    href: "/dashboard/loyalty",
  },
  {
    icon: "🤖",
    title: "AI Receptionist",
    description: "24/7 virtual front desk that answers questions, suggests times, and books appointments automatically.",
    href: "/dashboard/inbox",
  },
];

export default function QuickStartPage() {
  const { tenant } = useTenant();
  const currentLocale = useLocale() as Locale;
  const [setupCtx, setSetupCtx] = useState<SetupContext>({
    tenant: null,
    staffCount: 0,
    serviceCount: 0,
    clientCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const [staffRes, serviceRes, clientRes] = await Promise.all([
      queryData<{ id: string }[]>("staff.list"),
      queryData<{ id: string }[]>("services.list"),
      queryData<{ id: string }[]>("clients.list"),
    ]);

    setSetupCtx({
      tenant: tenant as unknown as Record<string, unknown>,
      staffCount: staffRes.data?.length || 0,
      serviceCount: serviceRes.data?.length || 0,
      clientCount: clientRes.data?.length || 0,
    });
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const completedSteps = ESSENTIAL_STEPS.filter((s) => s.checkComplete(setupCtx));
  const totalSteps = ESSENTIAL_STEPS.length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps.length / totalSteps) * 100) : 0;
  const allDone = completedSteps.length === totalSteps;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1>🚀 Quick Start Guide</h1>
        <p>
          Get your salon up and running in minutes. Complete these essential steps in order,
          then explore advanced features to grow your business.
        </p>
      </div>

      {/* Language Selection Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(195, 126, 218, 0.12), rgba(155, 89, 182, 0.08))',
        border: '1px solid rgba(195, 126, 218, 0.25)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
          <span style={{ fontSize: '20px' }}>🌐</span>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            Choose your language:
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {locales.map((locale) => (
            <button
              key={locale}
              onClick={() => {
                document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
                window.location.reload();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: currentLocale === locale
                  ? '2px solid var(--color-primary)'
                  : '1px solid var(--border-default)',
                background: currentLocale === locale
                  ? 'var(--color-primary-200)'
                  : 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontWeight: currentLocale === locale ? 700 : 500,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '18px' }}>{localeFlags[locale]}</span>
              {localeNames[locale]}
            </button>
          ))}
        </div>
      </div>

      {/* Progress */}
      <div className={styles.progressSection}>
        <div className={styles.progressMeta}>
          <span className={styles.progressLabel}>Setup Progress</span>
          <span className={styles.progressCount}>
            {loading ? "..." : `${completedSteps.length} of ${totalSteps} complete`}
          </span>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: loading ? "0%" : `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Completion Banner */}
      {allDone && !loading && (
        <div className={styles.completionBanner}>
          <span className={styles.completionEmoji}>🎉</span>
          <div className={styles.completionText}>
            <h3>You&apos;re all set!</h3>
            <p>
              All essential setup steps are complete. Your salon is ready to accept bookings.
              Explore the advanced features below to supercharge your business.
            </p>
          </div>
        </div>
      )}

      {/* Essential Steps */}
      <div className={styles.sectionLabel}>
        ✦ Essential Setup — {completedSteps.length}/{totalSteps}
      </div>
      <div className={styles.stepsList}>
        {ESSENTIAL_STEPS.map((step, index) => {
          const done = step.checkComplete(setupCtx);
          return (
            <div key={step.id}>
              <Link
                href={step.href}
                className={`${styles.stepCard} ${done ? styles.stepCardDone : ""}`}
              >
                <div className={`${styles.stepNumber} ${done ? styles.stepNumberDone : ""}`}>
                  {done ? "✓" : step.number}
                </div>
                <div className={styles.stepContent}>
                  <div className={styles.stepTitle}>{step.title}</div>
                  <div className={styles.stepDesc}>{step.description}</div>
                </div>
                <div className={styles.stepStatus}>
                  <span className={`${styles.stepBadge} ${done ? styles.stepBadgeDone : ""}`}>
                    {done ? "Done" : `Step ${step.number}`}
                  </span>
                  <span className={styles.stepArrow}>→</span>
                </div>
              </Link>
              {index < ESSENTIAL_STEPS.length - 1 && (
                <div className={`${styles.stepConnector} ${done ? styles.stepConnectorDone : ""}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Advanced Features */}
      <div className={styles.sectionLabel}>✦ Advanced Features</div>
      <div className={styles.advancedGrid}>
        {ADVANCED_FEATURES.map((feat) => (
          <Link key={feat.title} href={feat.href} className={styles.advancedCard}>
            <span className={styles.advancedIcon}>{feat.icon}</span>
            <span className={styles.advancedTitle}>{feat.title}</span>
            <span className={styles.advancedDesc}>{feat.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
