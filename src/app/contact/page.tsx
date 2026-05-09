"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./contact.module.css";
import { GlowUpLogo } from "@/components/GlowUpLogo";
import { LandingHeader } from "../LandingHeader";

const LogoIcon = () => <GlowUpLogo size={28} />;

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    // Build mailto link as a simple contact method
    const mailtoBody = `Name: ${form.name}%0AEmail: ${form.email}%0ASubject: ${form.subject}%0A%0A${encodeURIComponent(form.message)}`;
    window.open(`mailto:JoinGlowUp@gmail.com?subject=${encodeURIComponent(form.subject || "Contact from GlowUp website")}&body=${mailtoBody}`, "_blank");

    // Simulate send feedback
    await new Promise((r) => setTimeout(r, 600));
    setSent(true);
    setSending(false);
  }

  return (
    <main className={styles.main}>
      {/* Ambient orbs */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <LandingHeader />

      {/* Hero */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <span className={styles.badge}>💬 Get In Touch</span>
          <h1 className={styles.title}>
            We&apos;d Love to<br />
            <span className={styles.gradient}>Hear&nbsp;From&nbsp;You</span>
          </h1>
          <p className={styles.subtitle}>
            Questions, feedback, or partnership ideas? Reach out and we&apos;ll
            get back to you within 24 hours.
          </p>
        </div>
      </section>

      {/* Contact Grid */}
      <section className={styles.section}>
        <div className={`container ${styles.contactGrid}`}>
          {/* Left: Info Cards */}
          <div className={styles.infoColumn}>
            <div className={styles.infoCard}>
              <span className={styles.infoIcon}>📧</span>
              <div>
                <h3>Email Us</h3>
                <a href="mailto:JoinGlowUp@gmail.com" className={styles.infoLink}>
                  JoinGlowUp@gmail.com
                </a>
                <p>We typically respond within 24 hours</p>
              </div>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.infoIcon}>💡</span>
              <div>
                <h3>Feature Requests</h3>
                <p>
                  Have an idea that would make GlowUp even better? We build our
                  roadmap based on real salon feedback.
                </p>
              </div>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.infoIcon}>🤝</span>
              <div>
                <h3>Partnerships</h3>
                <p>
                  Interested in integrating with GlowUp or becoming a reseller?
                  Let&apos;s talk.
                </p>
              </div>
            </div>

            <div className={styles.infoCard}>
              <span className={styles.infoIcon}>🎁</span>
              <div>
                <h3>Referral Program</h3>
                <p>
                  Know a salon that could use GlowUp?{" "}
                  <Link href="/refer" className={styles.infoLink}>
                    Refer &amp; earn rewards →
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className={styles.formCard}>
            {sent ? (
              <div className={styles.successState}>
                <span className={styles.successIcon}>✓</span>
                <h3>Message Sent!</h3>
                <p>
                  Thanks for reaching out. We&apos;ll get back to you soon at{" "}
                  <strong>{form.email}</strong>.
                </p>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSent(false);
                    setForm({ name: "", email: "", subject: "", message: "" });
                  }}
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2>Send a Message</h2>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="contact-name">Name</label>
                    <input
                      id="contact-name"
                      className="input"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Your name"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      className="input"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="contact-subject">Subject</label>
                  <select
                    id="contact-subject"
                    className="input"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    required
                  >
                    <option value="">Select a topic...</option>
                    <option value="General Inquiry">General Inquiry</option>
                    <option value="Sales & Pricing">Sales &amp; Pricing</option>
                    <option value="Feature Request">Feature Request</option>
                    <option value="Technical Support">Technical Support</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    className="input"
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us how we can help..."
                  />
                </div>
                <button
                  type="submit"
                  className={`btn btn-primary ${styles.submitBtn}`}
                  disabled={sending}
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.logo}>
              <LogoIcon /> <span>GlowUp</span>
            </Link>
            <p>Modern salon management, beautifully designed.</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h4>Product</h4>
              <Link href="/#features">Features</Link>
              <Link href="/#pricing">Pricing</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
          <p className={styles.copyright}>© {new Date().getFullYear()} GlowUp. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
