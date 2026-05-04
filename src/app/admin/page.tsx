"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";
import GrowthDashboard from "./GrowthDashboard";

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
  created_at: string;
  staff_count: number;
  client_count: number;
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  pendingDeletion: number;
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
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "deletion">("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rewardAmount, setRewardAmount] = useState('25');
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardToast, setRewardToast] = useState('');

  // Outreach state
  const [outreachTab, setOutreachTab] = useState<'upload' | 'history' | 'followups'>('upload');
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

  const filtered = tenants.filter((t) => {
    const status = getStatus(t);
    if (filter === "active" && status !== "active") return false;
    if (filter === "suspended" && status !== "suspended") return false;
    if (filter === "deletion" && status !== "deletion") return false;

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

      {/* Growth Command Center */}
      <GrowthDashboard />

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
              Upload & Send
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

            {/* CSV Upload */}
            <div
              style={{
                border: '2px dashed var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-8)',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: 'var(--space-4)',
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
                {csvLeads.length > 0 ? `${csvLeads.length} leads loaded` : 'Drop CSV file here or click to upload'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                CSV format: salon_name, owner_name, owner_email, phone, city, state
              </p>
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
          {(["all", "active", "suspended", "deletion"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "active" ? "Active" : f === "suspended" ? "Suspended" : "Pending Deletion"}
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
                <th>Status</th>
                <th>Staff</th>
                <th>Clients</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.emptyRow}>No tenants found</td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const status = getStatus(t);
                  return (
                    <tr key={t.id} className={status === "deletion" ? styles.rowDeletion : status === "suspended" ? styles.rowSuspended : ""}>
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
                      <td className={styles.dateCell}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.actionBtns}>
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
                        </div>
                      </td>
                    </tr>
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
