"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./referrals.module.css";

interface ReferralCode {
  id: string;
  code: string;
  uses: number;
  reward_type: string;
  reward_value: number;
  created_at: string;
}

interface ReferralEntry {
  id: string;
  code: string;
  reward_applied: boolean;
  created_at: string;
  referred_tenant: { name: string; created_at: string } | null;
}

interface ReferralData {
  code: ReferralCode | null;
  history: ReferralEntry[];
  tenant: { name: string; slug: string } | null;
  stats: { totalReferrals: number; monthsEarned: number };
}

const REWARD_TIERS = [
  { min: 1, emoji: "🎁", label: "1 Referral", reward: "1 Free Month" },
  { min: 3, emoji: "⭐", label: "3 Referrals", reward: "3 Free Months" },
  { min: 5, emoji: "🏆", label: "5 Referrals", reward: "6 Free Months" },
  { min: 10, emoji: "💎", label: "10 Referrals", reward: "12 Free Months" },
];

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/referrals");
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function generateCode() {
    setGenerating(true);
    const res = await fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate" }),
    });
    if (res.ok) {
      const json = await res.json();
      setData((prev) =>
        prev ? { ...prev, code: json.code } : prev
      );
      showToast("Referral code generated!");
    }
    setGenerating(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  }

  const referralLink = data?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth/signup?ref=${data.code.code}`
    : "";

  const shareMessage = data?.code
    ? `I use GlowUp to run my salon and it's amazing! Sign up with my code ${data.code.code} and we both get a free month. ${referralLink}`
    : "";

  if (loading) {
    return <div className={styles.loading}>Loading referral data...</div>;
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1>🎁 Refer & Earn</h1>
        <p>
          Invite other salon owners to GlowUp. You both get rewarded — they get
          a free month, and so do you for every successful referral.
        </p>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {data?.stats.totalReferrals || 0}
          </span>
          <span className={styles.statLabel}>Salons Referred</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {data?.stats.monthsEarned || 0}
          </span>
          <span className={styles.statLabel}>Free Months Earned</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            ${(data?.stats.monthsEarned || 0) * 75}
          </span>
          <span className={styles.statLabel}>Total Savings</span>
        </div>
      </div>

      {/* Referral Code Card */}
      <div className={styles.codeCard}>
        <div className={styles.codeCardTitle}>Your Referral Code</div>
        <div className={styles.codeCardDesc}>
          Share this code with other salon owners. When they sign up, you both
          get 1 free month.
        </div>

        {data?.code ? (
          <>
            <div className={styles.codeDisplay}>
              <div className={styles.codeValue}>{data.code.code}</div>
              <button
                className={styles.copyBtn}
                onClick={() =>
                  copyToClipboard(data.code!.code, "Referral code")
                }
              >
                📋 Copy Code
              </button>
            </div>

            <div className={styles.linkDisplay}>
              <div className={styles.linkValue}>{referralLink}</div>
              <button
                className={styles.copyBtn}
                onClick={() => copyToClipboard(referralLink, "Referral link")}
              >
                🔗 Copy Link
              </button>
            </div>

            {/* Share Buttons */}
            <div className={styles.shareSection}>
              <div className={styles.shareLabel}>Share via</div>
              <div className={styles.shareRow}>
                <a
                  href={`sms:?body=${encodeURIComponent(shareMessage)}`}
                  className={styles.shareBtn}
                >
                  <span className={styles.shareBtnIcon}>💬</span> Text Message
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent("Try GlowUp for your salon!")}&body=${encodeURIComponent(shareMessage)}`}
                  className={styles.shareBtn}
                >
                  <span className={styles.shareBtnIcon}>📧</span> Email
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.shareBtn}
                >
                  <span className={styles.shareBtnIcon}>💚</span> WhatsApp
                </a>
                <button
                  className={styles.shareBtn}
                  onClick={() => copyToClipboard(shareMessage, "Share message")}
                >
                  <span className={styles.shareBtnIcon}>📝</span> Copy Message
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            className={styles.generateBtn}
            onClick={generateCode}
            disabled={generating}
          >
            {generating ? "Generating..." : "🎲 Generate My Referral Code"}
          </button>
        )}
      </div>

      {/* Reward Tiers */}
      <div className={styles.tiersCard}>
        <div className={styles.tiersTitle}>🏅 Reward Milestones</div>
        <div className={styles.tiersGrid}>
          {REWARD_TIERS.map((tier) => (
            <div
              key={tier.min}
              className={styles.tierItem}
              style={{
                borderColor:
                  (data?.stats.totalReferrals || 0) >= tier.min
                    ? "var(--color-primary)"
                    : undefined,
              }}
            >
              <span className={styles.tierEmoji}>{tier.emoji}</span>
              <span className={styles.tierLabel}>{tier.label}</span>
              <span className={styles.tierReward}>{tier.reward}</span>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      <div className={styles.historyCard}>
        <div className={styles.historyTitle}>Referral History</div>
        {data?.history && data.history.length > 0 ? (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Salon</th>
                <th>Date</th>
                <th>Reward</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.referred_tenant?.name || "Unknown"}</td>
                  <td>
                    {new Date(entry.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <span
                      className={`${styles.rewardBadge} ${
                        entry.reward_applied
                          ? styles.rewardApplied
                          : styles.rewardPending
                      }`}
                    >
                      {entry.reward_applied ? "✓ Applied" : "⏳ Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.emptyState}>
            <p>No referrals yet. Share your code to get started! 🚀</p>
          </div>
        )}
      </div>

      {/* Client Referral Program */}
      <div className={styles.codeCard}>
        <div className={styles.codeCardTitle}>👥 Client Referral Program</div>
        <div className={styles.codeCardDesc}>
          Anyone can earn a <strong>$25 gift card</strong> at your salon by referring
          GlowUp to you or another salon owner. Share this link:
        </div>
        <div className={styles.linkDisplay}>
          <div className={styles.linkValue}>
            {typeof window !== "undefined" ? window.location.origin : ""}/refer
          </div>
          <button
            className={styles.copyBtn}
            onClick={() =>
              copyToClipboard(
                `${typeof window !== "undefined" ? window.location.origin : ""}/refer`,
                "Client referral link"
              )
            }
          >
            🔗 Copy Link
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "var(--space-2)" }}>
          Gift card is issued after the referred salon pays their first month.
        </p>
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
