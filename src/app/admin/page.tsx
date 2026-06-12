"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";
import GrowthDashboard from "./GrowthDashboard";
import FeedbackCenter from "./FeedbackCenter";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  plan: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  deleted_at: string | null;
  deletion_scheduled_at: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
  staff_count: number;
  client_count: number;
  usage: {
    appointments_this_month: number;
    campaign_sends_this_month: number;
  };
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  pendingDeletion: number;
}

interface StaffDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  specialties: string[];
  commission_rate: number;
  schedule: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

interface ClientDetail {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  lifetime_spend: number;
  visit_count: number;
  last_visit: string | null;
  status: string;
  tags: string[];
  loyalty_points: number;
  notes: string | null;
  created_at: string;
}

interface AppointmentDetail {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  staff: { name: string } | null;
  client: { first_name: string; last_name: string | null } | null;
  services: unknown;
}

interface TenantDetail {
  tenant: Record<string, unknown>;
  staff: StaffDetail[];
  clients: ClientDetail[];
  appointments: AppointmentDetail[];
}

interface OutreachLead {
  salon_name: string;
  owner_name: string;
  owner_email: string;
  phone?: string;
  city?: string;
  state?: string;
}

interface OutreachResult {
  salon_name: string;
  owner_name: string;
  owner_email: string;
  status: string;
  code?: string;
  error?: string;
}

interface CampaignRow {
  id: string;
  salon_name: string;
  owner_name: string;
  owner_email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  referral_code: string | null;
  status: string;
  signed_up: boolean;
  sent_at: string | null;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, suspended: 0, pendingDeletion: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "deletion" | "paying" | "trialing" | "past_due">("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rewardAmount, setRewardAmount] = useState('25');
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardToast, setRewardToast] = useState('');

  // Detail panel state
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Record<string, TenantDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'staff' | 'clients'>('info');
  const [clientSearch, setClientSearch] = useState('');

  // Outreach state
  const [outreachTab, setOutreachTab] = useState<'upload' | 'sms' | 'history' | 'followups'>('upload');
  const [csvLeads, setCsvLeads] = useState<OutreachLead[]>([]);
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<{ summary: { total: number; sent: number; queued?: number; skipped: number; failed: number }; results: OutreachResult[] } | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('feature_showcase');
  const [followUpCandidates, setFollowUpCandidates] = useState<CampaignRow[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpSending, setFollowUpSending] = useState(false);
  const [followUpResults, setFollowUpResults] = useState<{ summary: { total: number; sent: number; skipped: number; failed: number } } | null>(null);
  const [queueStats, setQueueStats] = useState<{ queued: number; sent_today: number; daily_limit: number; remaining_today: number; estimated_days: number } | null>(null);
  const [dbLeadsLoading, setDbLeadsLoading] = useState(false);
  const [dbLeadsInfo, setDbLeadsInfo] = useState<{ total_in_db: number; already_contacted: number; ready_to_send: number } | null>(null);

  // SMS outreach state
  const [smsLeads, setSmsLeads] = useState<OutreachLead[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsInfo, setSmsInfo] = useState<{ total_in_db: number; already_contacted: number; ready_to_send: number } | null>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResults, setSmsResults] = useState<{ summary: { total: number; sent: number; queued?: number; skipped: number; failed: number }; results: Array<{ salon_name: string; phone: string; status: string; code?: string; error?: string }> } | null>(null);
  const [smsTemplate, setSmsTemplate] = useState('sms_intro');
  const [smsError, setSmsError] = useState('');

  const templateOptions = [
    { id: 'feature_showcase', name: '🚀 Feature Showcase', desc: 'Highlights top features & stats — best for first cold outreach' },
    { id: 'success_story', name: '⭐ Success Story', desc: 'Social proof with salon success metrics — best for warm leads' },
    { id: 'limited_offer', name: '🔥 Limited-Time Offer', desc: 'Urgency-driven exclusive deal — best for conversion push' },
    { id: 'follow_up', name: '💬 Friendly Follow-Up', desc: 'Gentle reminder for previously contacted salons' },
  ];

  const fetchTenants = useCallback(async () => {
    const res = await fetch("/api/admin/tenants");
    if (res.status === 403) {
      const d = await res.json();
      setError(`Access denied. You are logged in as: ${d.your_email || 'unknown'}. This email is not in the admin list.`);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError("Failed to load tenants");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setTenants(data.tenants);
    setStats(data.stats);
    setLoading(false);

    // Fetch referral reward setting
    const settingsRes = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-settings' }),
    });
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      if (s.client_referral_reward) setRewardAmount(s.client_referral_reward);
    }
  }, []);

  useEffect(() => {
    // Check auth first
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth/login");
        return;
      }
      fetchTenants();
    });
  }, [fetchTenants, router]);

  async function handleAction(tenantId: string, action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActionLoading(tenantId);

    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, action }),
    });

    if (res.ok) {
      await fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error || "Action failed");
    }
    setActionLoading(null);
  }

  async function handleExtendTrial(tenantId: string, tenantName: string, months: number) {
    if (!confirm(`Extend free trial for "${tenantName}" by ${months} months?`)) return;
    setActionLoading(tenantId);
    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, action: "extend-trial", months }),
    });
    if (res.ok) {
      const d = await res.json();
      const newDate = new Date(d.new_trial_ends_at).toLocaleDateString();
      alert(`✅ Trial extended by ${months} months. New trial end: ${newDate}`);
      await fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error || "Failed to extend trial");
    }
    setActionLoading(null);
  }

  // CSV parser
  function parseCsvFile(file: File) {
    setCsvError('');
    setCsvLeads([]);
    setSendResults(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);

      if (lines.length < 2) {
        setCsvError('CSV must have a header row and at least one data row');
        return;
      }

      // Parse header
      const headerRaw = lines[0].toLowerCase();
      const headers = headerRaw.split(',').map(h => h.trim().replace(/['"]/g, ''));

      // Find column indices
      const salonIdx = headers.findIndex(h => h.includes('salon') && h.includes('name'));
      const ownerIdx = headers.findIndex(h => h.includes('owner') && h.includes('name'));
      const emailIdx = headers.findIndex(h => h.includes('email'));
      const phoneIdx = headers.findIndex(h => h.includes('phone'));
      const cityIdx = headers.findIndex(h => h.includes('city'));
      const stateIdx = headers.findIndex(h => h.includes('state'));

      if (salonIdx === -1 || emailIdx === -1) {
        setCsvError(`Could not find required columns. Found headers: ${headers.join(', ')}. Need: salon_name, owner_name, owner_email`);
        return;
      }

      // Parse data rows
      const leads: OutreachLead[] = [];
      for (let i = 1; i < lines.length; i++) {
        // Handle quoted CSV values
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of lines[i]) {
          if (char === '"') { inQuotes = !inQuotes; continue; }
          if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ''; continue; }
          current += char;
        }
        cols.push(current.trim());

        const salon_name = cols[salonIdx] || '';
        const owner_name = cols[ownerIdx >= 0 ? ownerIdx : salonIdx] || '';
        const owner_email = cols[emailIdx] || '';

        if (!salon_name || !owner_email) continue;

        leads.push({
          salon_name,
          owner_name: owner_name || salon_name,
          owner_email,
          phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
          city: cityIdx >= 0 ? cols[cityIdx] : undefined,
          state: stateIdx >= 0 ? cols[stateIdx] : undefined,
        });
      }

      if (leads.length === 0) {
        setCsvError('No valid leads found in CSV');
        return;
      }

      setCsvLeads(leads);
    };
    reader.onerror = () => setCsvError('Failed to read file');
    reader.readAsText(file);
  }

  async function handleSendOutreach() {
    if (csvLeads.length === 0) return;
    if (!confirm(`Send outreach emails to ${csvLeads.length} salons? This action cannot be undone.`)) return;

    setSending(true);
    setSendResults(null);

    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: csvLeads,
          senderName: senderName.trim() || undefined,
          senderEmail: senderEmail.trim() || undefined,
          templateId: selectedTemplate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSendResults(data);
      } else {
        const d = await res.json();
        setCsvError(d.error || 'Failed to send outreach');
      }
    } catch (err) {
      setCsvError('Network error: ' + (err as Error).message);
    }

    setSending(false);
  }

  function getStatus(t: TenantRow) {
    if (t.deletion_scheduled_at) return "deletion";
    if (t.is_active === false) return "suspended";
    return "active";
  }

  async function toggleDetail(tenantId: string) {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
      return;
    }
    setExpandedTenant(tenantId);
    setDetailTab('info');
    setClientSearch('');

    // Already fetched?
    if (detailData[tenantId]) return;

    setDetailLoading(tenantId);
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, action: 'get-tenant-detail' }),
      });
      if (res.ok) {
        const data = await res.json();
        setDetailData(prev => ({ ...prev, [tenantId]: data }));
      }
    } catch (err) {
      console.error('Failed to load tenant detail:', err);
    }
    setDetailLoading(null);
  }

  /* ── Usage-Based Cost Calculator ──
   * SMS (Twilio):  $0.0079/segment
   * Email (Resend): $0.001/email after free tier
   * Uses ACTUAL data from this month:
   *   - Appointments → each generates 1 SMS reminder
   *   - Campaign sends → blasts (Fill My Openings, promos) go to ALL active clients via SMS
   */
  function calcMonthlyCost(t: TenantRow): { sms: number; email: number; total: number; smsCount: number; emailCount: number } {
    const SMS_RATE = 0.0079;
    const EMAIL_RATE = 0.001;

    const u = t.usage || { appointments_this_month: 0, campaign_sends_this_month: 0 };

    // SMS: 1 reminder per appointment + ALL campaign sends are SMS blasts to clients
    const smsCount = u.appointments_this_month + u.campaign_sends_this_month;
    // Email: ~10% of campaign sends may also trigger email (confirmation copies)
    const emailCount = Math.ceil(u.campaign_sends_this_month * 0.1);

    const sms = smsCount * SMS_RATE;
    const email = emailCount * EMAIL_RATE;

    return {
      sms: Math.round(sms * 100) / 100,
      email: Math.round(email * 100) / 100,
      total: Math.round((sms + email) * 100) / 100,
      smsCount,
      emailCount,
    };
  }

  const filtered = tenants.filter((t) => {
    const status = getStatus(t);
    if (filter === "active" && status !== "active") return false;
    if (filter === "suspended" && status !== "suspended") return false;
    if (filter === "deletion" && status !== "deletion") return false;
    if (filter === "paying" && !(t.subscription_status === 'active' && t.plan !== 'free')) return false;
    if (filter === "trialing" && t.subscription_status !== 'trialing') return false;
    if (filter === "past_due" && t.subscription_status !== 'past_due') return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.email || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <h1>🔒 Access Denied</h1>
          <p>{error}</p>
          <a href="/dashboard" className="btn btn-primary">Back to Dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>🛡️ Platform Admin</h1>
          <p>Manage all GlowUp tenants</p>
        </div>
        <a href="/dashboard" className={styles.backLink}>← Back to Dashboard</a>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total Tenants</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${styles.statGreen}`}>{stats.active}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${styles.statYellow}`}>{stats.suspended}</span>
          <span className={styles.statLabel}>Suspended</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${styles.statRed}`}>{stats.pendingDeletion}</span>
          <span className={styles.statLabel}>Pending Deletion</span>
        </div>
      </div>

      {/* Subscription Revenue Stats */}
      {(() => {
        const paying = tenants.filter(t => t.subscription_status === 'active' && t.plan !== 'free');
        const trialing = tenants.filter(t => t.subscription_status === 'trialing');
        const pastDue = tenants.filter(t => t.subscription_status === 'past_due');
        const planPrices: Record<string, number> = { starter: 29, growth: 79, professional: 149 };
        const mrr = paying.reduce((sum, t) => sum + (planPrices[t.plan] || 0), 0);
        return (
          <div className={styles.statsGrid} style={{ marginTop: 'var(--space-3)' }}>
            <div className={styles.statCard}>
              <span className={`${styles.statValue} ${styles.statGreen}`}>{paying.length}</span>
              <span className={styles.statLabel}>💳 Paying</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statValue}`} style={{ color: '#818cf8' }}>{trialing.length}</span>
              <span className={styles.statLabel}>⏳ Trialing</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statValue}`} style={{ color: '#f59e0b' }}>{pastDue.length}</span>
              <span className={styles.statLabel}>⚠️ Past Due</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statValue} ${styles.statGreen}`}>${mrr}</span>
              <span className={styles.statLabel}>💰 Monthly Revenue</span>
            </div>
          </div>
        );
      })()}

      {/* Growth Command Center */}
      <GrowthDashboard />

      {/* Feedback Center */}
      <FeedbackCenter />

      {/* Referral Settings */}
      <div className={styles.settingsCard}>
        <h3>🎁 Client Referral Settings</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
          When a salon client refers GlowUp to a new salon, the client receives a gift card at their salon after the referred salon pays their first month.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <label style={{ fontSize: '14px', fontWeight: 600 }}>Reward Amount: $</label>
          <input
            type="number"
            value={rewardAmount}
            onChange={(e) => setRewardAmount(e.target.value)}
            style={{ width: '80px', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '14px' }}
            min="1"
          />
          <button
            className={styles.enableBtn}
            disabled={rewardSaving}
            onClick={async () => {
              setRewardSaving(true);
              const res = await fetch('/api/admin/tenants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update-settings', key: 'client_referral_reward', value: rewardAmount }),
              });
              if (res.ok) {
                setRewardToast('✅ Reward amount saved!');
                setTimeout(() => setRewardToast(''), 3000);
              }
              setRewardSaving(false);
            }}
          >
            {rewardSaving ? 'Saving...' : 'Save'}
          </button>
      {rewardToast && <span style={{ fontSize: '13px', color: 'var(--color-success)' }}>{rewardToast}</span>}
        </div>
      </div>

      {/* ─── Bulk Outreach Section ─── */}
      <div className={styles.settingsCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <h3>📧 Bulk Salon Outreach</h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button
              className={`${styles.filterBtn} ${outreachTab === 'upload' ? styles.filterActive : ''}`}
              onClick={() => setOutreachTab('upload')}
            >
              📨 Email
            </button>
            <button
              className={`${styles.filterBtn} ${outreachTab === 'sms' ? styles.filterActive : ''}`}
              onClick={() => setOutreachTab('sms')}
            >
              📱 SMS
            </button>
            <button
              className={`${styles.filterBtn} ${outreachTab === 'followups' ? styles.filterActive : ''}`}
              onClick={async () => {
                setOutreachTab('followups');
                setFollowUpLoading(true);
                const res = await fetch('/api/admin/outreach?action=follow-up-candidates');
                if (res.ok) {
                  const d = await res.json();
                  setFollowUpCandidates(d.candidates || []);
                }
                setFollowUpLoading(false);
              }}
            >
              🔄 Auto Follow-Ups
            </button>
            <button
              className={`${styles.filterBtn} ${outreachTab === 'history' ? styles.filterActive : ''}`}
              onClick={async () => {
                setOutreachTab('history');
                setCampaignsLoading(true);
                const res = await fetch('/api/admin/outreach');
                if (res.ok) {
                  const d = await res.json();
                  setCampaigns(d.campaigns || []);
                }
                setCampaignsLoading(false);
              }}
            >
              Campaign History
            </button>
          </div>
        </div>

        {outreachTab === 'upload' ? (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              Upload a CSV with salon leads. Each row needs: <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>salon_name, owner_name, owner_email</code>. Optional: <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>phone, city, state</code>
            </p>

            {/* Sender config */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Sender Name (optional)</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. James from GlowUp"
                  style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Sender Email (optional)</label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="e.g. james@glowup.com"
                  style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '13px' }}
                />
              </div>
            </div>

            {/* Template Selector */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Email Template</label>
                <a
                  href="/admin/outreach-preview"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '11px', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}
                >
                  👁 Preview all templates ↗
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-2)' }}>
                {templateOptions.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: selectedTemplate === t.id ? '2px solid var(--color-primary)' : '1px solid var(--border-default)',
                      background: selectedTemplate === t.id ? 'rgba(195, 126, 218, 0.08)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</span>
                      <a
                        href={`/admin/outreach-preview#${t.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '10px', color: 'var(--color-primary)', textDecoration: 'none', opacity: 0.7 }}
                      >
                        Preview ↗
                      </a>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Load from Database OR CSV Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              {/* Load from DB */}
              <div
                style={{
                  border: '2px dashed var(--color-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-6)',
                  textAlign: 'center',
                  cursor: dbLeadsLoading ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                  background: 'rgba(195, 126, 218, 0.05)',
                  opacity: dbLeadsLoading ? 0.7 : 1,
                }}
                onClick={async () => {
                  if (dbLeadsLoading) return;
                  setDbLeadsLoading(true);
                  setCsvError('');
                  setSendResults(null);
                  try {
                    const res = await fetch('/api/admin/outreach?action=load-leads');
                    if (!res.ok) throw new Error('Failed to load leads');
                    const d = await res.json();
                    setDbLeadsInfo({ total_in_db: d.total_in_db, already_contacted: d.already_contacted, ready_to_send: d.ready_to_send });
                    if (d.leads.length === 0) {
                      setCsvError(`No new leads to send. ${d.total_in_db} leads in DB, ${d.already_contacted} already contacted.`);
                    } else {
                      setCsvLeads(d.leads);
                    }
                  } catch (err) {
                    setCsvError('Failed to load leads from database: ' + (err instanceof Error ? err.message : ''));
                  }
                  setDbLeadsLoading(false);
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{dbLeadsLoading ? '⏳' : '🗄️'}</div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary)', margin: '0 0 4px' }}>
                  {dbLeadsLoading ? 'Loading leads...' : 'Load from Database'}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                  Pull email-ready leads from InfoIQ
                </p>
                {dbLeadsInfo && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    📊 {dbLeadsInfo.total_in_db} total · ✅ {dbLeadsInfo.ready_to_send} ready · 🔒 {dbLeadsInfo.already_contacted} contacted
                  </div>
                )}
              </div>

              {/* CSV Upload */}
              <div
                style={{
                  border: '2px dashed var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-6)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  background: 'var(--bg-surface)',
                }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  const file = e.dataTransfer.files[0];
                  if (file) parseCsvFile(file);
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) parseCsvFile(file);
                  };
                  input.click();
                }}
              >
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📁</div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  {csvLeads.length > 0 ? `${csvLeads.length} leads loaded` : 'Upload CSV File'}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                  CSV format: salon_name, owner_name, owner_email, phone, city, state
                </p>
              </div>
            </div>

            {csvError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: 'var(--space-4)' }}>
                {csvError}
              </div>
            )}

            {/* Preview table */}
            {csvLeads.length > 0 && !sendResults && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Preview ({csvLeads.length} leads)</span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => { setCsvLeads([]); setCsvError(''); }}
                    >
                      Clear
                    </button>
                    <button
                      className={styles.enableBtn}
                      style={{ padding: '6px 20px', fontSize: '13px' }}
                      disabled={sending}
                      onClick={handleSendOutreach}
                    >
                      {sending ? `Sending... (batch mode)` : csvLeads.length > 95 ? `🚀 Send 95 Now + Queue ${csvLeads.length - 95}` : `🚀 Send ${csvLeads.length} Emails`}
                    </button>
                  </div>
                </div>
                <div className={styles.tableWrap} style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Salon</th>
                        <th>Owner</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>City</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvLeads.map((l, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{l.salon_name}</td>
                          <td>{l.owner_name}</td>
                          <td>{l.owner_email}</td>
                          <td>{l.phone || '—'}</td>
                          <td>{l.city || '—'}</td>
                          <td>{l.state || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Send results */}
            {sendResults && (
              <div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800 }}>{sendResults.summary.total}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total</span>
                  </div>
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-success)' }}>{sendResults.summary.sent}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Sent ✉️</span>
                  </div>
                  {(sendResults.summary.queued || 0) > 0 && (
                    <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: '#818cf8' }}>{sendResults.summary.queued}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Queued ⏳</span>
                    </div>
                  )}
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>{sendResults.summary.skipped}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Skipped ⏭️</span>
                  </div>
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{sendResults.summary.failed}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Failed ❌</span>
                  </div>
                </div>
                {(sendResults.summary.queued || 0) > 0 && (
                  <div style={{
                    background: 'rgba(129, 140, 248, 0.1)',
                    border: '1px solid rgba(129, 140, 248, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    marginBottom: 'var(--space-4)',
                    fontSize: '13px',
                    color: '#818cf8',
                    lineHeight: 1.5,
                  }}>
                    ⏳ <strong>{sendResults.summary.queued} emails queued</strong> — they'll be sent automatically at <strong>95/day</strong> (est. {Math.ceil((sendResults.summary.queued || 0) / 95)} days). The queue runs daily at 10 AM via cron.
                  </div>
                )}
                <div className={styles.tableWrap} style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Salon</th>
                        <th>Owner</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sendResults.results.map((r, i) => (
                        <tr key={i}>
                          <td>{r.salon_name}</td>
                          <td>{r.owner_name}</td>
                          <td>{r.owner_email}</td>
                          <td>
                            <span className={`${styles.statusBadge} ${
                              r.status === 'sent' ? styles.statusActive
                              : r.status === 'queued' ? styles.statusSuspended
                              : r.status === 'failed' ? styles.statusDeletion
                              : styles.statusSuspended
                            }`}>
                              {r.status === 'sent' ? '✉️ Sent' : r.status === 'queued' ? '⏳ Queued' : r.status === 'skipped_active' ? '✅ Already Active' : r.status === 'skipped_duplicate' ? '⏭️ Already Contacted' : r.status === 'skipped' ? `⚠️ ${r.error}` : '❌ Failed'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{r.code || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className={styles.enableBtn}
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={() => { setSendResults(null); setCsvLeads([]); }}
                >
                  Upload Another Batch
                </button>
              </div>
            )}
          </div>
        ) : outreachTab === 'sms' ? (
          /* SMS Outreach Tab */
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
              Send SMS outreach to salons with phone numbers. Each text includes a <strong>unique signup link</strong> for conversion tracking.
            </p>

            {/* SMS Template Picker */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>SMS Template</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-2)' }}>
                {[
                  { id: 'sms_intro', name: '👋 Introduction', desc: 'Quick intro — best for first contact' },
                  { id: 'sms_success', name: '⭐ Success Story', desc: 'Social proof with real salon results' },
                  { id: 'sms_offer', name: '🔥 Free Trial', desc: 'Highlights the 60-day free trial' },
                  { id: 'sms_followup', name: '💬 Follow-Up', desc: 'Gentle nudge for non-responders' },
                ].map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSmsTemplate(t.id)}
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: smsTemplate === t.id ? '2px solid var(--color-primary)' : '1px solid var(--border-default)',
                      background: smsTemplate === t.id ? 'rgba(195, 126, 218, 0.08)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Load SMS Leads from DB */}
            <div
              style={{
                border: '2px dashed #22c55e',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-6)',
                textAlign: 'center',
                cursor: smsLoading ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                background: 'rgba(34, 197, 94, 0.05)',
                marginBottom: 'var(--space-4)',
                opacity: smsLoading ? 0.7 : 1,
              }}
              onClick={async () => {
                if (smsLoading) return;
                setSmsLoading(true);
                setSmsError('');
                setSmsResults(null);
                try {
                  const res = await fetch('/api/admin/outreach?action=load-sms-leads');
                  if (!res.ok) throw new Error('Failed to load leads');
                  const d = await res.json();
                  setSmsInfo({ total_in_db: d.total_in_db, already_contacted: d.already_contacted, ready_to_send: d.ready_to_send });
                  if (d.leads.length === 0) {
                    setSmsError(`No new SMS leads. ${d.total_in_db} in DB, ${d.already_contacted} already contacted.`);
                  } else {
                    setSmsLeads(d.leads);
                  }
                } catch (err) {
                  setSmsError('Failed to load SMS leads: ' + (err instanceof Error ? err.message : ''));
                }
                setSmsLoading(false);
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>{smsLoading ? '⏳' : '📱'}</div>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e', margin: '0 0 4px' }}>
                {smsLoading ? 'Loading phone leads...' : 'Load Phone Leads from Database'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                Pull leads with phone numbers from InfoIQ
              </p>
              {smsInfo && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  📊 {smsInfo.total_in_db} total · ✅ {smsInfo.ready_to_send} ready · 🔒 {smsInfo.already_contacted} contacted
                </div>
              )}
            </div>

            {smsError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: 'var(--space-4)' }}>
                {smsError}
              </div>
            )}

            {/* SMS Preview Table */}
            {smsLeads.length > 0 && !smsResults && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Preview ({smsLeads.length} leads with phone)</span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => { setSmsLeads([]); setSmsError(''); }}
                    >
                      Clear
                    </button>
                    <button
                      className={styles.enableBtn}
                      style={{ padding: '6px 20px', fontSize: '13px', background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                      disabled={smsSending}
                      onClick={async () => {
                        if (!confirm(`Send SMS to ${Math.min(smsLeads.length, 200)} salons? Twilio charges ~$0.0079/msg.`)) return;
                        setSmsSending(true);
                        setSmsResults(null);
                        try {
                          const res = await fetch('/api/admin/outreach', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'send-sms', leads: smsLeads, smsTemplateId: smsTemplate }),
                          });
                          const d = await res.json();
                          if (res.ok) {
                            setSmsResults(d);
                          } else {
                            setSmsError(d.error || 'SMS send failed');
                          }
                        } catch (err) {
                          setSmsError('SMS send error: ' + (err instanceof Error ? err.message : ''));
                        }
                        setSmsSending(false);
                      }}
                    >
                      {smsSending ? 'Sending...' : smsLeads.length > 200 ? `📱 Send 200 Now + Queue ${smsLeads.length - 200}` : `📱 Send ${smsLeads.length} SMS`}
                    </button>
                  </div>
                </div>
                <div className={styles.tableWrap} style={{ maxHeight: '300px', overflow: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Salon</th>
                        <th>Phone</th>
                        <th>City</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smsLeads.slice(0, 100).map((l, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{l.salon_name}</td>
                          <td>{l.phone || '—'}</td>
                          <td>{l.city || '—'}</td>
                          <td>{l.state || '—'}</td>
                        </tr>
                      ))}
                      {smsLeads.length > 100 && (
                        <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>...and {smsLeads.length - 100} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SMS Send Results */}
            {smsResults && (
              <div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800 }}>{smsResults.summary.total}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total</span>
                  </div>
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#22c55e' }}>{smsResults.summary.sent}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Sent 📱</span>
                  </div>
                  {(smsResults.summary.queued || 0) > 0 && (
                    <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: '#818cf8' }}>{smsResults.summary.queued}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Queued ⏳</span>
                    </div>
                  )}
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>{smsResults.summary.skipped}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Skipped ⏭️</span>
                  </div>
                  <div className={styles.statCard} style={{ flex: '1 1 80px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{smsResults.summary.failed}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Failed ❌</span>
                  </div>
                </div>
                <button
                  className={styles.enableBtn}
                  style={{ marginTop: 'var(--space-3)' }}
                  onClick={() => { setSmsResults(null); setSmsLeads([]); }}
                >
                  Send Another Batch
                </button>
              </div>
            )}
          </div>
        ) : outreachTab === 'followups' ? (
          /* Auto Follow-Ups Tab */
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
              Salons that were emailed <strong>7+ days ago</strong> with no signup will receive an automatic follow-up. Each salon gets up to <strong>2 follow-ups</strong> using escalating templates: 1st → Success Story, 2nd → Friendly Follow-Up.
            </p>

            {followUpLoading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>Scanning for candidates...</div>
            ) : followUpResults ? (
              <div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <div className={styles.statCard} style={{ flex: '1 1 100px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800 }}>{followUpResults.summary.total}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total</span>
                  </div>
                  <div className={styles.statCard} style={{ flex: '1 1 100px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-success)' }}>{followUpResults.summary.sent}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Sent ✉️</span>
                  </div>
                  <div className={styles.statCard} style={{ flex: '1 1 100px', padding: 'var(--space-3)' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{followUpResults.summary.failed}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Failed ❌</span>
                  </div>
                </div>
                <button className={styles.enableBtn} onClick={() => setFollowUpResults(null)}>Done</button>
              </div>
            ) : followUpCandidates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>No follow-ups needed right now</p>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>All sent campaigns are either less than 7 days old, already signed up, or have reached the follow-up limit.</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{followUpCandidates.length} salons ready for follow-up</span>
                  <button
                    className={styles.enableBtn}
                    style={{ padding: '8px 24px', fontSize: '13px' }}
                    disabled={followUpSending}
                    onClick={async () => {
                      if (!confirm(`Send follow-up emails to ${followUpCandidates.length} salons?`)) return;
                      setFollowUpSending(true);
                      try {
                        const res = await fetch('/api/admin/outreach', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'send-follow-ups',
                            senderName: senderName.trim() || undefined,
                            campaignIds: followUpCandidates.map(c => c.id),
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setFollowUpResults(data);
                          setFollowUpCandidates([]);
                        }
                      } catch (err) {
                        console.error(err);
                      }
                      setFollowUpSending(false);
                    }}
                  >
                    {followUpSending ? 'Sending follow-ups...' : `🔄 Send ${followUpCandidates.length} Follow-Ups`}
                  </button>
                </div>
                <div className={styles.tableWrap} style={{ maxHeight: '350px', overflow: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Salon</th>
                        <th>Owner</th>
                        <th>Email</th>
                        <th>Original Sent</th>
                        <th>Follow-Ups</th>
                        <th>Next Template</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followUpCandidates.map((c) => {
                        const nextTemplate = (c as any).follow_up_count === 0 ? '⭐ Success Story' : '💬 Follow-Up';
                        return (
                          <tr key={c.id}>
                            <td><strong>{c.salon_name}</strong></td>
                            <td>{c.owner_name}</td>
                            <td style={{ fontSize: '12px' }}>{c.owner_email}</td>
                            <td className={styles.dateCell}>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</td>
                            <td style={{ textAlign: 'center' }}>{(c as any).follow_up_count || 0}/2</td>
                            <td style={{ fontSize: '12px' }}>{nextTemplate}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Campaign History Tab — Pipeline View */
          <div>
            {campaignsLoading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>Loading campaigns...</div>
            ) : campaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>No outreach campaigns yet</div>
            ) : (() => {
              const signedUp = campaigns.filter(c => c.signed_up);
              const needsFollowUp = campaigns.filter(c => c.status === 'sent' && !c.signed_up && (c as any).follow_up_count < 2 && c.sent_at && Date.now() - new Date(c.sent_at).getTime() > 7 * 86400000);
              const waiting = campaigns.filter(c => c.status === 'sent' && !c.signed_up && (!c.sent_at || Date.now() - new Date(c.sent_at).getTime() <= 7 * 86400000));
              const queued = campaigns.filter(c => c.status === 'queued');
              const maxedOut = campaigns.filter(c => c.status === 'sent' && !c.signed_up && (c as any).follow_up_count >= 2);

              type PipeFilter = 'all' | 'signed_up' | 'needs_followup' | 'waiting' | 'queued' | 'maxed';
              const getFiltered = () => {
                const pf = (window as any).__outreachPipeFilter as PipeFilter | undefined;
                if (pf === 'signed_up') return signedUp;
                if (pf === 'needs_followup') return needsFollowUp;
                if (pf === 'waiting') return waiting;
                if (pf === 'queued') return queued;
                if (pf === 'maxed') return maxedOut;
                return campaigns;
              };
              const filtered = getFiltered();

              return (
                <div>
                  {/* Pipeline stat cards */}
                  <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Signed Up 🎉', count: signedUp.length, color: '#22c55e', key: 'signed_up' },
                      { label: 'Needs Follow-Up ⏰', count: needsFollowUp.length, color: '#f59e0b', key: 'needs_followup' },
                      { label: 'Waiting ✉️', count: waiting.length, color: '#60a5fa', key: 'waiting' },
                      { label: 'Queued ⏳', count: queued.length, color: '#818cf8', key: 'queued' },
                      { label: 'Maxed Out 🚫', count: maxedOut.length, color: '#6b7280', key: 'maxed' },
                      { label: 'Total', count: campaigns.length, color: '#a78bfa', key: 'all' },
                    ].map(s => (
                      <div
                        key={s.key}
                        className={styles.statCard}
                        onClick={() => {
                          (window as any).__outreachPipeFilter = (window as any).__outreachPipeFilter === s.key ? 'all' : s.key;
                          // Trigger re-render by touching campaigns state
                          setCampaigns([...campaigns]);
                        }}
                        style={{
                          flex: '1 1 100px',
                          padding: 'var(--space-3)',
                          cursor: 'pointer',
                          border: (window as any).__outreachPipeFilter === s.key ? `2px solid ${s.color}` : '1px solid var(--border-subtle)',
                          transition: 'border 0.2s',
                        }}
                      >
                        <span style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.count}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Conversion rate */}
                  {signedUp.length > 0 && (
                    <div style={{
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3)',
                      marginBottom: 'var(--space-4)',
                      fontSize: '13px',
                      color: '#22c55e',
                    }}>
                      🎯 <strong>Conversion rate: {((signedUp.length / campaigns.filter(c => c.status === 'sent').length) * 100).toFixed(1)}%</strong> — {signedUp.length} out of {campaigns.filter(c => c.status === 'sent').length} emailed salons signed up!
                    </div>
                  )}

                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)' }}>
                    Click a stat card above to filter • Showing {filtered.length} of {campaigns.length}
                  </p>

                  <div className={styles.tableWrap} style={{ maxHeight: '400px', overflow: 'auto' }}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Salon</th>
                          <th>Owner</th>
                          <th>Email</th>
                          <th>City</th>
                          <th>Template</th>
                          <th>Status</th>
                          <th>Follow-Ups</th>
                          <th>Sent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr key={c.id}>
                            <td><strong>{c.salon_name}</strong></td>
                            <td>{c.owner_name}</td>
                            <td style={{ fontSize: '12px' }}>{c.owner_email}</td>
                            <td style={{ fontSize: '12px' }}>{c.city && c.state ? `${c.city}, ${c.state}` : c.city || c.state || '—'}</td>
                            <td style={{ fontSize: '11px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                fontWeight: 600,
                              }}>
                                {(c as any).template_id === 'success_story' ? '⭐' : (c as any).template_id === 'limited_offer' ? '🔥' : (c as any).template_id === 'follow_up' ? '💬' : '🚀'}
                                {' '}{((c as any).template_id || 'feature_showcase').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td>
                              <span className={`${styles.statusBadge} ${
                                c.signed_up ? styles.statusActive
                                : c.status === 'sent' ? styles.statusActive
                                : c.status === 'queued' ? styles.statusSuspended
                                : c.status === 'skipped_active' ? styles.statusSuspended
                                : styles.statusDeletion
                              }`}>
                                {c.signed_up ? '🎉 Signed Up' : c.status === 'sent' ? '✉️ Sent' : c.status === 'queued' ? '⏳ Queued' : c.status === 'skipped_active' ? '✅ Already Active' : '❌ ' + c.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '12px' }}>{(c as any).follow_up_count || 0}</td>
                            <td className={styles.dateCell}>{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Filters + Search */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(["all", "active", "paying", "trialing", "past_due", "suspended", "deletion"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : f === "paying" ? "💳 Paying" : f === "trialing" ? "⏳ Trialing" : f === "past_due" ? "⚠️ Past Due" : f === "suspended" ? "Suspended" : "Pending Deletion"}
            </button>
          ))}
        </div>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search tenants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tenant Table */}
      {loading ? (
        <div className={styles.loading}>Loading tenants...</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Subscription</th>
                <th>Billing</th>
                <th>Status</th>
                <th>Staff</th>
                <th>Clients</th>
                <th>Cost This Month</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyRow}>No tenants found</td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const status = getStatus(t);
                  const subStatus = t.subscription_status || 'trialing';
                  const trialEnd = t.trial_ends_at ? new Date(t.trial_ends_at) : null;
                  const periodEnd = t.current_period_end ? new Date(t.current_period_end) : null;
                  const now = new Date();
                  const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)) : 0;
                  return (
                    <React.Fragment key={t.id}>
                    <tr className={status === "deletion" ? styles.rowDeletion : status === "suspended" ? styles.rowSuspended : ""}>
                      <td>
                        <div className={styles.tenantCell}>
                          <strong>{t.name}</strong>
                          <span className={styles.tenantSlug}>/{t.slug}</span>
                          {t.email && <span className={styles.tenantEmail}>{t.email}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.planBadge} ${styles[`plan_${t.plan}`] || ""}`}>
                          {t.plan}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            display: 'inline-block',
                            width: 'fit-content',
                            background: subStatus === 'active' ? 'rgba(34, 197, 94, 0.15)' :
                                       subStatus === 'trialing' ? 'rgba(129, 140, 248, 0.15)' :
                                       subStatus === 'past_due' ? 'rgba(245, 158, 11, 0.15)' :
                                       subStatus === 'canceled' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100,100,100,0.15)',
                            color: subStatus === 'active' ? '#22c55e' :
                                   subStatus === 'trialing' ? '#818cf8' :
                                   subStatus === 'past_due' ? '#f59e0b' :
                                   subStatus === 'canceled' ? '#ef4444' : 'var(--text-tertiary)',
                          }}>
                            {subStatus === 'active' ? '💳 Active' :
                             subStatus === 'trialing' ? '⏳ Trial' :
                             subStatus === 'past_due' ? '⚠️ Past Due' :
                             subStatus === 'canceled' ? '❌ Canceled' : subStatus}
                          </span>
                          {subStatus === 'trialing' && trialEnd && (
                            <span style={{
                              fontSize: '10px',
                              color: trialDaysLeft > 30 ? '#22c55e' : trialDaysLeft <= 7 ? '#f59e0b' : 'var(--text-tertiary)',
                              fontWeight: trialDaysLeft <= 7 || trialDaysLeft > 30 ? 600 : 400,
                            }}>
                              {trialDaysLeft > 30
                                ? `✅ Extended → ${trialEnd.toLocaleDateString()}`
                                : `${trialDaysLeft}d left → ${trialEnd.toLocaleDateString()}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {subStatus === 'active' && periodEnd ? (
                            <>
                              <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                                Next: {periodEnd.toLocaleDateString()}
                              </span>
                              {t.stripe_customer_id && (
                                <a
                                  href={`https://dashboard.stripe.com/customers/${t.stripe_customer_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: '10px', color: 'var(--color-primary)', textDecoration: 'none' }}
                                >
                                  View in Stripe ↗
                                </a>
                              )}
                            </>
                          ) : subStatus === 'past_due' ? (
                            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>
                              Payment failed
                              {t.stripe_customer_id && (
                                <a
                                  href={`https://dashboard.stripe.com/customers/${t.stripe_customer_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'block', fontSize: '10px', color: 'var(--color-primary)', textDecoration: 'none', marginTop: '2px' }}
                                >
                                  Fix in Stripe ↗
                                </a>
                              )}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {status === "active" && <span className={`${styles.statusBadge} ${styles.statusActive}`}>Active</span>}
                        {status === "suspended" && <span className={`${styles.statusBadge} ${styles.statusSuspended}`}>Suspended</span>}
                        {status === "deletion" && (
                          <span className={`${styles.statusBadge} ${styles.statusDeletion}`}>
                            Deletes {new Date(t.deletion_scheduled_at!).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td>{t.staff_count}</td>
                      <td>{t.client_count}</td>
                      <td>
                        {(() => {
                          const cost = calcMonthlyCost(t);
                          const u = t.usage || { appointments_this_month: 0, campaign_sends_this_month: 0 };
                          return (
                            <div title={`📱 SMS: ${cost.smsCount} msgs = $${cost.sms.toFixed(2)}\n📧 Email: ${cost.emailCount} msgs = $${cost.email.toFixed(2)}\n\n📅 ${u.appointments_this_month} appointments\n📣 ${u.campaign_sends_this_month} campaign sends`} style={{ cursor: 'help' }}>
                              <span style={{
                                fontWeight: 700,
                                fontSize: 'var(--text-sm)',
                                color: cost.total > 5 ? '#f59e0b' : cost.total > 1 ? 'var(--text-primary)' : 'var(--text-tertiary)',
                              }}>
                                ${cost.total.toFixed(2)}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', display: 'block' }}>
                                {cost.smsCount + cost.emailCount} msgs
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className={styles.dateCell}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.actionBtns}>
                          <button
                            className={`${styles.viewBtn} ${expandedTenant === t.id ? styles.viewBtnActive : ''}`}
                            onClick={() => toggleDetail(t.id)}
                          >
                            {expandedTenant === t.id ? '▼ Close' : '▶ View'}
                          </button>
                          {status === "active" && (
                            <button
                              className={styles.suspendBtn}
                              onClick={() => handleAction(t.id, "disable", `Suspend "${t.name}"? Staff will lose access.`)}
                              disabled={actionLoading === t.id}
                            >
                              Suspend
                            </button>
                          )}
                          {status === "suspended" && (
                            <button
                              className={styles.enableBtn}
                              onClick={() => handleAction(t.id, "enable")}
                              disabled={actionLoading === t.id}
                            >
                              Reactivate
                            </button>
                          )}
                          {status === "deletion" && (
                            <button
                              className={styles.enableBtn}
                              onClick={() => handleAction(t.id, "cancel-delete")}
                              disabled={actionLoading === t.id}
                            >
                              Cancel Delete
                            </button>
                          )}
                          {status !== "deletion" && (
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleAction(t.id, "schedule-delete", `Schedule "${t.name}" for deletion? They have 30 days to cancel.`)}
                              disabled={actionLoading === t.id}
                            >
                              Delete
                            </button>
                          )}
                          {t.plan === 'free' && (
                            <>
                              <button
                                className={styles.enableBtn}
                                onClick={() => handleExtendTrial(t.id, t.name, 3)}
                                disabled={actionLoading === t.id}
                                title="Extend free trial by 3 months"
                                style={{ fontSize: '11px', padding: '3px 8px' }}
                              >
                                +3mo
                              </button>
                              <button
                                className={styles.enableBtn}
                                onClick={() => handleExtendTrial(t.id, t.name, 6)}
                                disabled={actionLoading === t.id}
                                title="Extend free trial by 6 months"
                                style={{ fontSize: '11px', padding: '3px 8px' }}
                              >
                                +6mo
                              </button>
                            </>
                          )}
                          <button
                            className={styles.viewBtn}
                            style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', border: '1px solid rgba(124, 58, 237, 0.3)', fontSize: '11px', padding: '3px 8px', fontWeight: 600 }}
                            disabled={actionLoading === t.id}
                            onClick={async () => {
                              setActionLoading(t.id);
                              try {
                                const res = await fetch('/api/admin/impersonate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ tenant_id: t.id }),
                                });
                                if (res.ok) {
                                  // Clear cached tenant data and redirect to dashboard
                                  try { sessionStorage.removeItem('glowup_tenant_cache'); } catch {}
                                  window.location.href = '/dashboard';
                                } else {
                                  const err = await res.json();
                                  alert(err.error || 'Failed to impersonate');
                                }
                              } catch (e) {
                                console.error(e);
                                alert('Failed to impersonate');
                              }
                              setActionLoading(null);
                            }}
                          >
                            👁 View As
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* ── Expandable Detail Panel ── */}
                    {expandedTenant === t.id && (
                      <tr className={styles.detailRow}>
                        <td colSpan={10}>
                          <div className={styles.detailPanel}>
                            <div className={styles.detailTabs}>
                              <button className={`${styles.detailTab} ${detailTab === 'info' ? styles.detailTabActive : ''}`} onClick={() => setDetailTab('info')}>📋 Business Info</button>
                              <button className={`${styles.detailTab} ${detailTab === 'staff' ? styles.detailTabActive : ''}`} onClick={() => setDetailTab('staff')}>👥 Staff ({detailData[t.id]?.staff.length ?? t.staff_count})</button>
                              <button className={`${styles.detailTab} ${detailTab === 'clients' ? styles.detailTabActive : ''}`} onClick={() => { setDetailTab('clients'); setClientSearch(''); }}>👤 Clients ({detailData[t.id]?.clients.length ?? t.client_count})</button>
                            </div>
                            <div className={styles.detailBody}>
                              {detailLoading === t.id ? (
                                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>Loading tenant data...</div>
                              ) : !detailData[t.id] ? (
                                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>Failed to load data</div>
                              ) : detailTab === 'info' ? (
                                /* ── Business Info Tab ── */
                                <div className={styles.infoGrid}>
                                  <div className={styles.infoCard}>
                                    <h4>📍 Contact Information</h4>
                                    {[['Email', detailData[t.id].tenant.email as string],
                                      ['Phone', detailData[t.id].tenant.phone as string],
                                      ['Website', detailData[t.id].tenant.website as string],
                                      ['Address', detailData[t.id].tenant.address as string],
                                    ].map(([label, value]) => (
                                      <div key={label} className={styles.infoField}>
                                        <span className={styles.infoLabel}>{label}</span>
                                        <span className={value ? styles.infoValue : `${styles.infoValue} ${styles.infoEmpty}`}>
                                          {value || 'Not set'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className={styles.infoCard}>
                                    <h4>💼 Account Details</h4>
                                    {[['Business Type', detailData[t.id].tenant.business_type as string],
                                      ['Plan', detailData[t.id].tenant.plan as string],
                                      ['Subscription', detailData[t.id].tenant.subscription_status as string],
                                      ['Slug', `/${detailData[t.id].tenant.slug as string}`],
                                      ['Created', new Date(detailData[t.id].tenant.created_at as string).toLocaleDateString()],
                                    ].map(([label, value]) => (
                                      <div key={label} className={styles.infoField}>
                                        <span className={styles.infoLabel}>{label}</span>
                                        <span className={value ? styles.infoValue : `${styles.infoValue} ${styles.infoEmpty}`}>
                                          {value || '—'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className={styles.infoCard}>
                                    <h4>💳 Billing</h4>
                                    {[['Stripe Customer', detailData[t.id].tenant.stripe_customer_id as string],
                                      ['Stripe Sub', detailData[t.id].tenant.stripe_subscription_id as string],
                                      ['Trial Ends', detailData[t.id].tenant.trial_ends_at ? new Date(detailData[t.id].tenant.trial_ends_at as string).toLocaleDateString() : null],
                                      ['Period End', detailData[t.id].tenant.current_period_end ? new Date(detailData[t.id].tenant.current_period_end as string).toLocaleDateString() : null],
                                    ].map(([label, value]) => (
                                      <div key={label as string} className={styles.infoField}>
                                        <span className={styles.infoLabel}>{label as string}</span>
                                        <span className={value ? styles.infoValue : `${styles.infoValue} ${styles.infoEmpty}`}>
                                          {(value as string) || 'None'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className={styles.infoCard}>
                                    <h4>📅 Recent Activity</h4>
                                    {detailData[t.id].appointments.length === 0 ? (
                                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: 'var(--space-3) 0' }}>No appointments yet</div>
                                    ) : (
                                      detailData[t.id].appointments.slice(0, 5).map((apt) => (
                                        <div key={apt.id} className={styles.infoField}>
                                          <span className={styles.infoLabel}>
                                            {new Date(apt.start_time).toLocaleDateString()} · {apt.staff?.name || '?'}
                                          </span>
                                          <span className={styles.infoValue} style={{ fontSize: '12px' }}>
                                            {apt.client ? `${apt.client.first_name} ${apt.client.last_name || ''}`.trim() : '—'}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ) : detailTab === 'staff' ? (
                                /* ── Staff Tab ── */
                                <div>
                                  <div className={styles.detailHeader}>
                                    <span className={styles.detailCount}>{detailData[t.id].staff.length} staff members</span>
                                  </div>
                                  {detailData[t.id].staff.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>No staff members</div>
                                  ) : (
                                    <div style={{ maxHeight: '400px', overflow: 'auto', borderRadius: 'var(--radius-lg)' }}>
                                      <table className={styles.innerTable}>
                                        <thead>
                                          <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Phone</th>
                                            <th>Role</th>
                                            <th>Specialties</th>
                                            <th>Commission</th>
                                            <th>Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {detailData[t.id].staff.map((s) => (
                                            <tr key={s.id}>
                                              <td><strong>{s.name}</strong></td>
                                              <td style={{ fontSize: '12px' }}>{s.email || <span className={styles.infoEmpty}>—</span>}</td>
                                              <td style={{ fontSize: '12px' }}>{s.phone || <span className={styles.infoEmpty}>—</span>}</td>
                                              <td>
                                                <span className={`${styles.roleBadge} ${
                                                  s.role === 'owner' ? styles.roleOwner
                                                  : s.role === 'manager' ? styles.roleManager
                                                  : styles.roleTechnician
                                                }`}>{s.role}</span>
                                              </td>
                                              <td style={{ fontSize: '12px' }}>{s.specialties?.length ? s.specialties.join(', ') : '—'}</td>
                                              <td style={{ textAlign: 'center' }}>{s.commission_rate}%</td>
                                              <td>
                                                <span className={s.is_active ? styles.clientActive : styles.clientInactive}>
                                                  {s.is_active ? '✅' : '❌'}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                /* ── Clients Tab ── */
                                <div>
                                  <div className={styles.detailHeader}>
                                    <span className={styles.detailCount}>{detailData[t.id].clients.length} clients</span>
                                    <input
                                      type="text"
                                      className={styles.detailSearch}
                                      placeholder="Search clients by name, phone, email..."
                                      value={clientSearch}
                                      onChange={(e) => setClientSearch(e.target.value)}
                                    />
                                  </div>
                                  {(() => {
                                    const q = clientSearch.toLowerCase();
                                    const filteredClients = q
                                      ? detailData[t.id].clients.filter(c =>
                                          `${c.first_name} ${c.last_name || ''}`.toLowerCase().includes(q) ||
                                          (c.email || '').toLowerCase().includes(q) ||
                                          (c.phone || '').includes(q)
                                        )
                                      : detailData[t.id].clients;
                                    return filteredClients.length === 0 ? (
                                      <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>
                                        {q ? `No clients matching "${q}"` : 'No clients'}
                                      </div>
                                    ) : (
                                      <div style={{ maxHeight: '400px', overflow: 'auto', borderRadius: 'var(--radius-lg)' }}>
                                        <table className={styles.innerTable}>
                                          <thead>
                                            <tr>
                                              <th>Name</th>
                                              <th>Phone</th>
                                              <th>Email</th>
                                              <th>Visits</th>
                                              <th>Lifetime Spend</th>
                                              <th>Last Visit</th>
                                              <th>Loyalty Pts</th>
                                              <th>Status</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {filteredClients.map((c) => (
                                              <tr key={c.id}>
                                                <td><strong>{c.first_name} {c.last_name || ''}</strong></td>
                                                <td style={{ fontSize: '12px' }}>{c.phone || <span className={styles.infoEmpty}>—</span>}</td>
                                                <td style={{ fontSize: '12px' }}>{c.email || <span className={styles.infoEmpty}>—</span>}</td>
                                                <td style={{ textAlign: 'center' }}>{c.visit_count}</td>
                                                <td style={{ fontWeight: 600 }}>${Number(c.lifetime_spend || 0).toFixed(2)}</td>
                                                <td className={styles.dateCell}>{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '—'}</td>
                                                <td style={{ textAlign: 'center' }}>{c.loyalty_points}</td>
                                                <td>
                                                  <span className={c.status === 'active' ? styles.clientActive : styles.clientInactive}>
                                                    {c.status || 'active'}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
