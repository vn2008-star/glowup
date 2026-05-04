"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import styles from "./refer.module.css";

interface ClientCode {
  code: string;
  clientName: string;
  salonName: string;
}

export default function ReferPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientCode, setClientCode] = useState<ClientCode | null>(null);
  const [toast, setToast] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/client-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, email: email.trim() }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      setError(data.error || "Something went wrong");
    } else {
      setClientCode(data);
    }
    setLoading(false);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied!`);
  }

  const referralLink = clientCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth/signup?cref=${clientCode.code}`
    : "";

  const shareMessage = clientCode
    ? `I love ${clientCode.salonName}! They use GlowUp to manage their salon. If you own a salon, sign up with my code ${clientCode.code} and I get a reward! ${referralLink}`
    : "";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="url(#sparkGradRef)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="sparkGradRef" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e8a87c" />
                  <stop offset="100%" stopColor="#d4a0e8" />
                </linearGradient>
              </defs>
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
            </svg>
            <span className={styles.logoText}>GlowUp</span>
          </div>
          <h1 className={styles.title}>🎁 Refer & Earn</h1>
          <p className={styles.subtitle}>
            Love your salon? Help us grow! Refer GlowUp to a salon owner you know
            and earn a <strong>$25 gift card</strong> at your salon.
          </p>
        </div>

        {/* How it works */}
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <span>Enter your email below</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <span>Share your referral link with a salon owner</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <span>When they sign up & pay, you get a <strong>$25 gift card</strong></span>
          </div>
        </div>

        {!clientCode ? (
          /* Email form */
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="email">Your email address</label>
              <p className={styles.hint}>Must match the email on file at your salon</p>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Looking you up..." : "Get My Referral Code"}
            </button>
            <p className={styles.terms}>
              Gift card is issued after the referred salon completes their free trial
              and pays for their first month.
            </p>
          </form>
        ) : (
          /* Code display */
          <div className={styles.codeSection}>
            <p className={styles.welcome}>
              Welcome, <strong>{clientCode.clientName}</strong>! Here&apos;s your referral code:
            </p>

            <div className={styles.codeDisplay}>
              <div className={styles.codeValue}>{clientCode.code}</div>
              <button
                className={styles.copyBtn}
                onClick={() => copyToClipboard(clientCode.code, "Referral code")}
              >
                📋 Copy
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

            {/* Share buttons */}
            <div className={styles.shareSection}>
              <div className={styles.shareLabel}>Share via</div>
              <div className={styles.shareRow}>
                <a
                  href={`sms:?body=${encodeURIComponent(shareMessage)}`}
                  className={styles.shareBtn}
                >
                  💬 Text
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent("Try GlowUp for your salon!")}&body=${encodeURIComponent(shareMessage)}`}
                  className={styles.shareBtn}
                >
                  📧 Email
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.shareBtn}
                >
                  💚 WhatsApp
                </a>
                <button
                  className={styles.shareBtn}
                  onClick={() => copyToClipboard(shareMessage, "Share message")}
                >
                  📝 Copy
                </button>
              </div>
            </div>

            <div className={styles.termsBox}>
              <strong>Terms:</strong> Your $25 gift card will be issued at{" "}
              <strong>{clientCode.salonName}</strong> after the referred salon
              completes their free trial and pays for their first month of GlowUp.
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
