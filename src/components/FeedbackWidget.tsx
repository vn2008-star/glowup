'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { queryData, mutateData } from '@/lib/api';
import styles from './FeedbackWidget.module.css';

type FeedbackType = 'bug' | 'feature' | 'enhancement' | 'feedback';

const TYPE_CONFIG: Record<FeedbackType, { label: string; emoji: string; color: string }> = {
  bug: { label: 'Bug Report', emoji: '🐛', color: '#ef4444' },
  feature: { label: 'Feature Request', emoji: '💡', color: '#f59e0b' },
  enhancement: { label: 'Enhancement', emoji: '✨', color: '#8b5cf6' },
  feedback: { label: 'General Feedback', emoji: '💬', color: '#06b6d4' },
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
  '/dashboard/campaigns': 'Campaigns',
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
  const [type, setType] = useState<FeedbackType>('feedback');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pulse, setPulse] = useState(true);

  // Stop pulse animation after first interaction
  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 8000);
    return () => clearTimeout(t);
  }, []);

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
        setIsOpen(false);
        setSubmitted(false);
        setMessage('');
        setRating(0);
        setType('feedback');
      }, 2000);
    } catch (err) {
      console.error('Feedback error:', err);
    } finally {
      setSubmitting(false);
    }
  }, [message, tenant, pathname, type, rating]);

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        className={`${styles.trigger} ${pulse ? styles.triggerPulse : ''}`}
        onClick={() => { setIsOpen(true); setPulse(false); }}
        title="Send feedback"
        aria-label="Open feedback form"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
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
                      <h3>Send Feedback</h3>
                      <span className={styles.pageBadge}>
                        📍 {pageName}
                      </span>
                    </div>
                  </div>
                  <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

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
            )}
          </div>
        </div>
      )}
    </>
  );
}
