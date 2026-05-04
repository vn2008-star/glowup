"use client";

import { useState } from "react";
import styles from "./refer.module.css";

interface ReferralResult {
  code: string;
  referralLink: string;
  salonOwnerName: string;
}

export default function ReferPage() {
  const [formData, setFormData] = useState({
    clientName: "",
    clientEmail: "",
    salonName: "",
    ownerName: "",
    ownerEmail: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isGoodNews, setIsGoodNews] = useState(false);
  const [result, setResult] = useState<ReferralResult | null>(null);
  const [toast, setToast] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setIsGoodNews(false);

    const res = await fetch("/api/client-referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      setError(data.error || "Something went wrong");
      setIsGoodNews(!!data.alreadyOnGlowUp);
    } else {
      setResult(data);
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

  const shareMessage = result
    ? `Hey ${result.salonOwnerName}! I love ${formData.salonName} and think GlowUp would be perfect for managing your salon. Sign up here and I get a reward too! ${result.referralLink}`
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
          <h1 className={styles.title}>🎁 Refer a Salon & Earn</h1>
          <p className={styles.subtitle}>
            Know a salon that would love GlowUp? Refer them and earn a{" "}
            <strong>$25 gift card</strong> at their salon when they sign up!
          </p>
        </div>

        {/* How it works */}
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <span>Tell us about yourself and the salon you&apos;re referring</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <span>Share the referral link with the salon owner</span>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <span>When they sign up & pay, you get a <strong>$25 gift card</strong></span>
          </div>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Your Info */}
            <div className={styles.sectionLabel}>👤 Your Information</div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="clientName">Your Name</label>
                <input
                  id="clientName"
                  name="clientName"
                  type="text"
                  value={formData.clientName}
                  onChange={handleChange}
                  placeholder="Sarah Johnson"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="clientEmail">Your Email</label>
                <input
                  id="clientEmail"
                  name="clientEmail"
                  type="email"
                  value={formData.clientEmail}
                  onChange={handleChange}
                  placeholder="sarah@email.com"
                  required
                />
              </div>
            </div>

            {/* Salon Info */}
            <div className={styles.sectionLabel}>💇 Salon You&apos;re Referring</div>

            <div className={styles.formGroup}>
              <label htmlFor="salonName">Salon Name</label>
              <input
                id="salonName"
                name="salonName"
                type="text"
                value={formData.salonName}
                onChange={handleChange}
                placeholder="Nails by Lisa"
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="ownerName">Owner&apos;s Name</label>
                <input
                  id="ownerName"
                  name="ownerName"
                  type="text"
                  value={formData.ownerName}
                  onChange={handleChange}
                  placeholder="Lisa Chen"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="ownerEmail">Owner&apos;s Email</label>
                <input
                  id="ownerEmail"
                  name="ownerEmail"
                  type="email"
                  value={formData.ownerEmail}
                  onChange={handleChange}
                  placeholder="lisa@nailsbylisa.com"
                  required
                />
              </div>
            </div>

            {error && (
              <div className={isGoodNews ? styles.goodNews : styles.error}>
                {error}
              </div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Creating your referral..." : "Get My Referral Link"}
            </button>

            <p className={styles.terms}>
              Gift card is issued after the referred salon completes their free trial
              and pays for their first month.
            </p>
          </form>
        ) : (
          /* Result display */
          <div className={styles.codeSection}>
            <div className={styles.successBanner}>
              ✅ Referral Created!
            </div>
            <p className={styles.welcome}>
              Thanks, <strong>{formData.clientName}</strong>! Share this link with{" "}
              <strong>{result.salonOwnerName}</strong> to get them started:
            </p>

            <div className={styles.codeDisplay}>
              <div className={styles.codeValue}>{result.code}</div>
              <button
                className={styles.copyBtn}
                onClick={() => copyToClipboard(result.code, "Referral code")}
              >
                📋 Copy
              </button>
            </div>

            <div className={styles.linkDisplay}>
              <div className={styles.linkValue}>{result.referralLink}</div>
              <button
                className={styles.copyBtn}
                onClick={() => copyToClipboard(result.referralLink, "Referral link")}
              >
                🔗 Copy Link
              </button>
            </div>

            {/* Share buttons */}
            <div className={styles.shareSection}>
              <div className={styles.shareLabel}>Share via</div>
              <div className={styles.shareRow}>
                <a
                  href={`sms:${formData.ownerEmail}?body=${encodeURIComponent(shareMessage)}`}
                  className={styles.shareBtn}
                >
                  💬 Text
                </a>
                <a
                  href={`mailto:${formData.ownerEmail}?subject=${encodeURIComponent("Try GlowUp for your salon!")}&body=${encodeURIComponent(shareMessage)}`}
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
                  📝 Copy All
                </button>
              </div>
            </div>

            <div className={styles.termsBox}>
              <strong>Terms:</strong> Your $25 gift card will be issued at{" "}
              <strong>{formData.salonName}</strong> once {result.salonOwnerName} signs up
              for GlowUp and pays for their first month after the free trial.
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
