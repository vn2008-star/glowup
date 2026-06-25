'use client';

import { useState, useEffect, useCallback } from 'react';
import { localeDateStr } from '@/lib/utils';
import styles from './FeedbackCenter.module.css';

/* ═══ Types ═══ */
interface FeedbackItem {
  id: string;
  tenant_id: string;
  staff_id: string | null;
  page: string;
  type: 'bug' | 'feature' | 'enhancement' | 'feedback';
  message: string;
  rating: number | null;
  status: 'new' | 'reviewed' | 'planned' | 'done' | 'dismissed';
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  staff?: { name: string; email: string | null } | null;
  tenant?: { name: string; slug: string } | null;
}

interface Counts {
  all: number; new: number; reviewed: number; planned: number; done: number; dismissed: number;
}

const TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  bug: { label: 'Bug', emoji: '🐛', color: '#ef4444' },
  feature: { label: 'Feature', emoji: '💡', color: '#f59e0b' },
  enhancement: { label: 'Enhance', emoji: '✨', color: '#8b5cf6' },
  feedback: { label: 'Feedback', emoji: '💬', color: '#06b6d4' },
};

const STATUS_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  new: { label: 'New', emoji: '🔵', color: '#3b82f6' },
  reviewed: { label: 'Reviewed', emoji: '👀', color: '#8b5cf6' },
  planned: { label: 'Planned', emoji: '📋', color: '#f59e0b' },
  done: { label: 'Done', emoji: '✅', color: '#22c55e' },
  dismissed: { label: 'Dismissed', emoji: '⏭️', color: '#6b7280' },
};

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/checkout': 'Front Desk',
  '/dashboard/clients': 'Clients',
  '/dashboard/services': 'Services',
  '/dashboard/packages': 'Packages',
  '/dashboard/staff': 'Staff',
  '/dashboard/gallery': 'Gallery',
  '/dashboard/campaigns': 'Promotions',
  '/dashboard/social': 'Social',
  '/dashboard/loyalty': 'Loyalty',
  '/dashboard/inbox': 'Inbox',
  '/dashboard/reports': 'Reports',
  '/dashboard/settings': 'Settings',
  '/dashboard/quick-start': 'Quick Start',
  '/dashboard/booking': 'Booking',
  '/dashboard/referrals': 'Referrals',
};

export default function FeedbackCenter() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, new: 0, reviewed: 0, planned: 0, done: 0, dismissed: 0 });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<string>('reviewed');
  const [replying, setReplying] = useState(false);
  const [toast, setToast] = useState('');

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter !== 'all') params.set('status', activeFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/admin/feedback?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFeedback(data.feedback || []);
        setCounts(data.counts || { all: 0, new: 0, reviewed: 0, planned: 0, done: 0, dismissed: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch feedback:', err);
    }
    setLoading(false);
  }, [activeFilter, typeFilter]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleReply = useCallback(async (id: string) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply',
          id,
          admin_notes: replyText.trim(),
          status: replyStatus,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedback(prev => prev.map(f => f.id === id ? data.feedback : f));
        setReplyText('');
        setExpandedId(null);
        setToast('✅ Reply sent successfully');
        setTimeout(() => setToast(''), 3000);
        // Refresh counts
        fetchFeedback();
      }
    } catch (err) {
      console.error('Reply error:', err);
    }
    setReplying(false);
  }, [replyText, replyStatus, fetchFeedback]);

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-status', id, status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setFeedback(prev => prev.map(f => f.id === id ? data.feedback : f));
        fetchFeedback();
      }
    } catch (err) {
      console.error('Status update error:', err);
    }
  }, [fetchFeedback]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Permanently delete this feedback? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (res.ok) {
        setFeedback(prev => prev.filter(f => f.id !== id));
        setExpandedId(null);
        setToast('🗑️ Feedback deleted');
        setTimeout(() => setToast(''), 3000);
        fetchFeedback();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  }, [fetchFeedback]);

  const getPageLabel = (page: string) => PAGE_LABELS[page] || page.replace('/dashboard/', '').replace(/-/g, ' ');

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return localeDateStr(new Date(dateStr), { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3>💬 Feedback Center</h3>
          <span className={styles.headerSubtext}>
            {counts.new > 0 && (
              <span className={styles.newBadge}>{counts.new} new</span>
            )}
            {counts.all} total submissions
          </span>
        </div>
      </div>

      {/* ── Status Tabs ── */}
      <div className={styles.filterBar}>
        <div className={styles.statusTabs}>
          {(['all', 'new', 'reviewed', 'planned', 'done', 'dismissed'] as const).map(s => {
            const cfg = s === 'all' ? { label: 'All', emoji: '📊', color: 'var(--text-primary)' } : STATUS_CONFIG[s];
            const count = counts[s] || 0;
            return (
              <button
                key={s}
                className={`${styles.tabBtn} ${activeFilter === s ? styles.tabActive : ''}`}
                onClick={() => { setActiveFilter(s); setExpandedId(null); }}
                style={activeFilter === s ? { borderColor: cfg.color, color: cfg.color } : {}}
              >
                <span>{cfg.emoji}</span>
                <span>{cfg.label}</span>
                {count > 0 && <span className={styles.tabCount}>{count}</span>}
              </button>
            );
          })}
        </div>
        <div className={styles.typeFilters}>
          <select
            className={styles.typeSelect}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={styles.toast}>{toast}</div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.loadingPulse} />
          <span>Loading feedback...</span>
        </div>
      ) : feedback.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <h4>No feedback found</h4>
          <p>
            {activeFilter !== 'all'
              ? `No ${activeFilter} feedback items. Try changing the filter.`
              : 'No feedback has been submitted yet.'
            }
          </p>
        </div>
      ) : (
        <div className={styles.feedbackList}>
          {feedback.map(fb => {
            const typeCfg = TYPE_CONFIG[fb.type] || TYPE_CONFIG.feedback;
            const statusCfg = STATUS_CONFIG[fb.status] || STATUS_CONFIG.new;
            const isExpanded = expandedId === fb.id;

            return (
              <div
                key={fb.id}
                className={`${styles.feedbackCard} ${isExpanded ? styles.cardExpanded : ''} ${fb.status === 'new' ? styles.cardNew : ''}`}
              >
                {/* ── Card Header ── */}
                <div
                  className={styles.cardHeader}
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedId(null);
                      setReplyText('');
                    } else {
                      setExpandedId(fb.id);
                      setReplyText(fb.admin_notes || '');
                      setReplyStatus(fb.status === 'new' ? 'reviewed' : fb.status);
                    }
                  }}
                >
                  <div className={styles.cardMeta}>
                    {/* Type badge */}
                    <span
                      className={styles.typeBadge}
                      style={{ background: `${typeCfg.color}15`, color: typeCfg.color, borderColor: `${typeCfg.color}30` }}
                    >
                      {typeCfg.emoji} {typeCfg.label}
                    </span>
                    {/* Status badge */}
                    <span
                      className={styles.statusBadge}
                      style={{ background: `${statusCfg.color}15`, color: statusCfg.color }}
                    >
                      {statusCfg.emoji} {statusCfg.label}
                    </span>
                    {/* Page badge */}
                    <span className={styles.pageBadge}>📍 {getPageLabel(fb.page)}</span>
                    {/* Rating */}
                    {fb.rating && (
                      <span className={styles.ratingBadge}>
                        {'★'.repeat(fb.rating)}{'☆'.repeat(5 - fb.rating)}
                      </span>
                    )}
                  </div>

                  <div className={styles.cardRight}>
                    <span className={styles.timeAgo}>{timeAgo(fb.created_at)}</span>
                    <span className={styles.expandArrow}>{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </div>

                {/* ── Message Preview ── */}
                <div className={styles.messagePreview}>
                  <p className={isExpanded ? '' : styles.messageTruncated}>{fb.message}</p>
                </div>

                {/* ── Submitter info ── */}
                <div className={styles.submitterRow}>
                  <span className={styles.submitterInfo}>
                    👤 {fb.staff?.name || 'Unknown Staff'}
                    {fb.tenant?.name && (
                      <> · 🏢 {fb.tenant.name}</>
                    )}
                  </span>
                </div>

                {/* ── Existing Admin Reply ── */}
                {fb.admin_notes && !isExpanded && (
                  <div className={styles.existingReply}>
                    <span className={styles.replyLabel}>💬 Admin Reply:</span>
                    <p>{fb.admin_notes}</p>
                  </div>
                )}

                {/* ── Expanded Reply Section ── */}
                {isExpanded && (
                  <div className={styles.replySection}>
                    <div className={styles.replyDivider} />

                    {/* Status Quick Actions */}
                    <div className={styles.statusActions}>
                      <span className={styles.statusActionsLabel}>Set Status:</span>
                      {(['reviewed', 'planned', 'done', 'dismissed'] as const).map(s => {
                        const cfg = STATUS_CONFIG[s];
                        return (
                          <button
                            key={s}
                            className={`${styles.statusActionBtn} ${replyStatus === s ? styles.statusActionActive : ''}`}
                            onClick={(e) => { e.stopPropagation(); setReplyStatus(s); }}
                            style={replyStatus === s ? { background: `${cfg.color}20`, borderColor: cfg.color, color: cfg.color } : {}}
                          >
                            {cfg.emoji} {cfg.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Reply textarea */}
                    <div className={styles.replyInput}>
                      <textarea
                        className={styles.replyTextarea}
                        placeholder="Write your reply to this feedback..."
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={3}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    </div>

                    {/* Reply actions */}
                    <div className={styles.replyActions}>
                      <div className={styles.replyActionsLeft}>
                        <button
                          className={styles.cancelBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(null);
                            setReplyText('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className={styles.deleteBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(fb.id);
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                      <div className={styles.replyActionsRight}>
                        {/* Quick status-only update (no reply text needed) */}
                        {!replyText.trim() && fb.status !== replyStatus && (
                          <button
                            className={styles.statusOnlyBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(fb.id, replyStatus);
                              setExpandedId(null);
                            }}
                          >
                            Just Update Status
                          </button>
                        )}
                        <button
                          className={styles.sendReplyBtn}
                          disabled={!replyText.trim() || replying}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReply(fb.id);
                          }}
                        >
                          {replying ? (
                            <span className={styles.btnSpinner} />
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                              Send Reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
