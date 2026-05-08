'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { queryData, mutateData } from '@/lib/api';
import styles from './FeedbackWidget.module.css';

type FeedbackType = 'bug' | 'feature' | 'enhancement' | 'feedback';

interface FeedbackItem {
  id: string;
  page: string;
  type: string;
  message: string;
  rating: number | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  staff?: { name: string } | null;
}

const TYPE_CONFIG: Record<FeedbackType, { label: string; emoji: string; color: string }> = {
  bug: { label: 'Bug Report', emoji: '🐛', color: '#ef4444' },
  feature: { label: 'Feature Request', emoji: '💡', color: '#f59e0b' },
  enhancement: { label: 'Enhancement', emoji: '✨', color: '#8b5cf6' },
  feedback: { label: 'General Feedback', emoji: '💬', color: '#06b6d4' },
};

const STATUS_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  new: { label: 'Submitted', emoji: '🔵', color: '#3b82f6' },
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
};

export function FeedbackWidget() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'send' | 'history'>('send');
  const [type, setType] = useState<FeedbackType>('feedback');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pulse, setPulse] = useState(true);

  // History state
  const [history, setHistory] = useState<FeedbackItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Stop pulse animation after first interaction
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 8000);
    return () => clearTimeout(t);
  }, []);

  // Check for unread admin replies on mount
  useEffect(() => {
    if (!tenant) return;
    (async () => {
      try {
        const { data } = await queryData<FeedbackItem[]>('feedback.list', { limit: 50 });
        if (data) {
          // Check if there are admin replies the user might not have seen
          const withReplies = data.filter(f => f.admin_notes && f.admin_notes.trim());
          // Use localStorage to track what they've seen
          const seenKey = `feedback_seen_${tenant}`;
          const seen = JSON.parse(localStorage.getItem(seenKey) || '[]') as string[];
          const unseenReplies = withReplies.filter(f => !seen.includes(f.id));
          setHasUnread(unseenReplies.length > 0);
        }
      } catch { /* silent */ }
    })();
  }, [tenant]);

  const fetchHistory = useCallback(async () => {
    if (!tenant) return;
    setLoadingHistory(true);
    try {
      const { data } = await queryData<FeedbackItem[]>('feedback.list', { limit: 50 });
      setHistory(data || []);

      // Mark all items with admin_notes as "seen"
      if (data) {
        const seenKey = `feedback_seen_${tenant}`;
        const withReplies = data.filter(f => f.admin_notes && f.admin_notes.trim()).map(f => f.id);
        localStorage.setItem(seenKey, JSON.stringify(withReplies));
        setHasUnread(false);
      }
    } catch (err) {
      console.error('Failed to load feedback history:', err);
    }
    setLoadingHistory(false);
  }, [tenant]);

  const pageName = PAGE_LABELS[pathname] || pathname.replace('/dashboard/', '').replace(/-/g, ' ');

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || !tenant) return;
    setSubmitting(true);
    try {
      await mutateData('feedback.create', {
        page: pathname,
        type,
        message: message.trim(),
        rating: rating || null,
      });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        setRating(0);
        setType('feedback');
        // Switch to history tab to show their submission
        setTab('history');
        fetchHistory();
      }, 1500);
    } catch (err) {
      console.error('Feedback error:', err);
    } finally {
      setSubmitting(false);
    }
  }, [message, tenant, pathname, type, rating, fetchHistory]);

  const openWidget = useCallback((targetTab: 'send' | 'history' = 'send') => {
    setIsOpen(true);
    setPulse(false);
    setTab(targetTab);
    if (targetTab === 'history') fetchHistory();
  }, [fetchHistory]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getPageLabel = (page: string) => PAGE_LABELS[page] || page.replace('/dashboard/', '').replace(/-/g, ' ');

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        className={`${styles.trigger} ${pulse ? styles.triggerPulse : ''}`}
        onClick={() => openWidget('send')}
        title="Send feedback"
        aria-label="Open feedback form"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {hasUnread && <span className={styles.unreadDot} />}
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {submitted ? (
              <div className={styles.successState}>
                <div className={styles.successIcon}>✓</div>
                <h3>Thank you!</h3>
                <p>Your feedback has been received</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className={styles.header}>
                  <div className={styles.headerTitle}>
                    <span className={styles.headerEmoji}>💬</span>
                    <div>
                      <h3>{tab === 'send' ? 'Send Feedback' : 'My Feedback'}</h3>
                      {tab === 'send' && (
                        <span className={styles.pageBadge}>
                          📍 {pageName}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* Tab Switcher */}
                <div className={styles.tabSwitcher}>
                  <button
                    className={`${styles.tabSwitchBtn} ${tab === 'send' ? styles.tabSwitchActive : ''}`}
                    onClick={() => setTab('send')}
                  >
                    ✏️ New Feedback
                  </button>
                  <button
                    className={`${styles.tabSwitchBtn} ${tab === 'history' ? styles.tabSwitchActive : ''}`}
                    onClick={() => { setTab('history'); fetchHistory(); }}
                  >
                    📋 My Submissions
                    {hasUnread && <span className={styles.tabDot} />}
                  </button>
                </div>

                {tab === 'send' ? (
                  <>
                    {/* Type Selector */}
                    <div className={styles.typeGrid}>
                      {(Object.entries(TYPE_CONFIG) as [FeedbackType, typeof TYPE_CONFIG[FeedbackType]][]).map(([key, cfg]) => (
                        <button
                          key={key}
                          className={`${styles.typeBtn} ${type === key ? styles.typeBtnActive : ''}`}
                          onClick={() => setType(key)}
                          style={type === key ? { borderColor: cfg.color, background: `${cfg.color}15` } : {}}
                        >
                          <span className={styles.typeEmoji}>{cfg.emoji}</span>
                          <span className={styles.typeLabel}>{cfg.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Message */}
                    <textarea
                      className={styles.textarea}
                      placeholder={
                        type === 'bug'
                          ? 'Describe the issue you encountered...'
                          : type === 'feature'
                          ? 'What feature would you like to see?'
                          : type === 'enhancement'
                          ? 'How can we improve this page?'
                          : 'Share your thoughts...'
                      }
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      autoFocus
                    />

                    {/* Rating */}
                    <div className={styles.ratingRow}>
                      <span className={styles.ratingLabel}>How do you feel about this page?</span>
                      <div className={styles.stars}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            className={`${styles.star} ${star <= (hoverRating || rating) ? styles.starActive : ''}`}
                            onClick={() => setRating(star === rating ? 0 : star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Submit */}
                    <button
                      className={styles.submitBtn}
                      onClick={handleSubmit}
                      disabled={!message.trim() || submitting}
                    >
                      {submitting ? (
                        <span className={styles.spinner} />
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                          Send Feedback
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  /* ── History Tab ── */
                  <div className={styles.historyContainer}>
                    {loadingHistory ? (
                      <div className={styles.historyLoading}>
                        <span className={styles.spinner} />
                        <span>Loading...</span>
                      </div>
                    ) : history.length === 0 ? (
                      <div className={styles.historyEmpty}>
                        <span className={styles.historyEmptyIcon}>📭</span>
                        <p>No feedback submitted yet</p>
                        <button className={styles.historyNewBtn} onClick={() => setTab('send')}>
                          Send your first feedback →
                        </button>
                      </div>
                    ) : (
                      <div className={styles.historyList}>
                        {history.map(fb => {
                          const typeCfg = TYPE_CONFIG[fb.type as FeedbackType] || TYPE_CONFIG.feedback;
                          const statusCfg = STATUS_CONFIG[fb.status] || STATUS_CONFIG.new;
                          const isExpanded = expandedHistoryId === fb.id;
                          const hasReply = fb.admin_notes && fb.admin_notes.trim();

                          return (
                            <div
                              key={fb.id}
                              className={`${styles.historyCard} ${hasReply ? styles.historyCardWithReply : ''} ${isExpanded ? styles.historyCardExpanded : ''}`}
                              onClick={() => setExpandedHistoryId(isExpanded ? null : fb.id)}
                            >
                              {/* Card top row */}
                              <div className={styles.historyCardTop}>
                                <div className={styles.historyBadges}>
                                  <span
                                    className={styles.historyTypeBadge}
                                    style={{ background: `${typeCfg.color}12`, color: typeCfg.color }}
                                  >
                                    {typeCfg.emoji} {typeCfg.label}
                                  </span>
                                  <span
                                    className={styles.historyStatusBadge}
                                    style={{ background: `${statusCfg.color}12`, color: statusCfg.color }}
                                  >
                                    {statusCfg.emoji} {statusCfg.label}
                                  </span>
                                </div>
                                <span className={styles.historyTime}>{timeAgo(fb.created_at)}</span>
                              </div>

                              {/* Page */}
                              <div className={styles.historyPage}>📍 {getPageLabel(fb.page)}</div>

                              {/* Message */}
                              <p className={`${styles.historyMessage} ${isExpanded ? '' : styles.historyMessageTruncated}`}>
                                {fb.message}
                              </p>

                              {/* Admin Reply */}
                              {hasReply && (
                                <div className={styles.adminReply}>
                                  <div className={styles.adminReplyHeader}>
                                    <span className={styles.adminReplyLabel}>💬 Admin Reply</span>
                                    {fb.reviewed_at && (
                                      <span className={styles.adminReplyTime}>{timeAgo(fb.reviewed_at)}</span>
                                    )}
                                  </div>
                                  <p className={isExpanded ? '' : styles.adminReplyTruncated}>
                                    {fb.admin_notes}
                                  </p>
                                </div>
                              )}

                              {/* Expand hint */}
                              {!isExpanded && (fb.message.length > 80 || (hasReply && fb.admin_notes!.length > 60)) && (
                                <span className={styles.expandHint}>tap to expand</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
