import type { Metadata } from "next";
import Link from "next/link";
import styles from "./sms-consent.module.css";
import { GlowUpLogo } from "@/components/GlowUpLogo";
import { LandingHeader } from "../LandingHeader";

const LogoIcon = () => <GlowUpLogo size={28} />;

export const metadata: Metadata = {
  title: "SMS Consent & Terms — GlowUp",
  description:
    "Learn how GlowUp uses SMS messaging for appointment reminders, booking confirmations, and promotional updates. View our opt-in policy, message frequency, and how to opt out.",
};

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

export default function SmsConsentPage() {
  return (
    <main className={styles.main}>
      {/* Ambient orbs */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <LandingHeader />

      {/* Hero */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <span className={styles.badge}>📱 SMS Messaging Policy</span>
          <h1 className={styles.title}>
            SMS Consent &<br />
            <span className={styles.gradient}>Messaging&nbsp;Terms</span>
          </h1>
          <p className={styles.subtitle}>
            Your privacy matters. Here&apos;s how GlowUp uses text messaging
            to keep you connected with your beauty appointments.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className={styles.section}>
        <div className={`container ${styles.contentWrap}`}>
          {/* Opt-In Card */}
          <div className={styles.policyCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>✅</span>
              <h2>How You Opt In</h2>
            </div>
            <p className={styles.cardDesc}>
              By providing your phone number when booking an appointment through
              GlowUp — whether online, via our booking page, or in-person at a
              participating salon — you expressly consent to receive text
              messages from GlowUp and its partner businesses.
            </p>
            <div className={styles.consentMethods}>
              <div className={styles.method}>
                <CheckIcon />
                <span>Entering your phone number on the online booking form</span>
              </div>
              <div className={styles.method}>
                <CheckIcon />
                <span>Providing your number when creating a GlowUp account</span>
              </div>
              <div className={styles.method}>
                <CheckIcon />
                <span>Sharing your number in-person with a participating salon</span>
              </div>
              <div className={styles.method}>
                <CheckIcon />
                <span>Texting a keyword (e.g., &quot;JOIN&quot;) to our business number</span>
              </div>
            </div>
          </div>

          {/* What Messages Card */}
          <div className={styles.policyCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>💬</span>
              <h2>What Messages You&apos;ll Receive</h2>
            </div>
            <p className={styles.cardDesc}>
              We send the following types of text messages to help you stay on top
              of your beauty appointments and salon experience:
            </p>
            <div className={styles.messageTypes}>
              <div className={styles.messageType}>
                <div className={styles.typeIcon}>📅</div>
                <div>
                  <h3>Appointment Reminders</h3>
                  <p>Upcoming appointment confirmations and day-of reminders so you never miss a session.</p>
                </div>
              </div>
              <div className={styles.messageType}>
                <div className={styles.typeIcon}>✨</div>
                <div>
                  <h3>Booking Confirmations</h3>
                  <p>Instant confirmation when you book, reschedule, or cancel an appointment.</p>
                </div>
              </div>
              <div className={styles.messageType}>
                <div className={styles.typeIcon}>🎉</div>
                <div>
                  <h3>Promotions &amp; Offers</h3>
                  <p>Exclusive deals, last-minute openings, and special salon promotions (if opted in).</p>
                </div>
              </div>
              <div className={styles.messageType}>
                <div className={styles.typeIcon}>🔔</div>
                <div>
                  <h3>Service Updates</h3>
                  <p>Important notices about your salon, schedule changes, or account-related updates.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Frequency & Cost Card */}
          <div className={styles.policyCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>📊</span>
              <h2>Message Frequency &amp; Costs</h2>
            </div>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <h3>Frequency</h3>
                <p>
                  Message frequency varies based on your appointment activity.
                  Typically, you&apos;ll receive <strong>1–5 messages per month</strong>,
                  depending on how many appointments you book. Promotional messages, if opted in,
                  may add up to 4 additional messages per month.
                </p>
              </div>
              <div className={styles.detailItem}>
                <h3>Costs</h3>
                <p>
                  <strong>Message and data rates may apply.</strong> Standard carrier messaging
                  rates apply based on your mobile plan. GlowUp does not charge any additional
                  fees for text messages.
                </p>
              </div>
            </div>
          </div>

          {/* Opt-Out Card */}
          <div className={styles.policyCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>🚫</span>
              <h2>How to Opt Out</h2>
            </div>
            <p className={styles.cardDesc}>
              You can stop receiving text messages at any time. Opting out is easy
              and takes effect immediately:
            </p>
            <div className={styles.optOutBox}>
              <div className={styles.optOutMethod}>
                <div className={styles.optOutLabel}>Text</div>
                <p>
                  Reply <strong>STOP</strong> to any message you receive from us.
                  You&apos;ll get a one-time confirmation that you&apos;ve been unsubscribed.
                </p>
              </div>
              <div className={styles.optOutMethod}>
                <div className={styles.optOutLabel}>Email</div>
                <p>
                  Contact us at{" "}
                  <a href="mailto:JoinGlowUp@gmail.com" className={styles.infoLink}>
                    JoinGlowUp@gmail.com
                  </a>{" "}
                  and request to be removed from SMS communications.
                </p>
              </div>
              <div className={styles.optOutMethod}>
                <div className={styles.optOutLabel}>Help</div>
                <p>
                  Reply <strong>HELP</strong> to any message for support information
                  and contact details.
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & Terms Card */}
          <div className={styles.policyCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>🔒</span>
              <h2>Privacy &amp; Data Protection</h2>
            </div>
            <p className={styles.cardDesc}>
              We respect your privacy and are committed to protecting your personal information:
            </p>
            <ul className={styles.privacyList}>
              <li>Your phone number will never be sold, rented, or shared with third parties for marketing purposes.</li>
              <li>We use your number solely to deliver the messages described on this page.</li>
              <li>All data is stored securely and handled in accordance with applicable laws.</li>
              <li>Consent to receive text messages is not a condition of purchasing any goods or services.</li>
              <li>Your information is protected with industry-standard encryption.</li>
            </ul>
          </div>

          {/* Supported Carriers Card */}
          <div className={styles.policyCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>📶</span>
              <h2>Supported Carriers</h2>
            </div>
            <p className={styles.cardDesc}>
              Our messaging service is compatible with all major US and Canadian wireless carriers,
              including AT&amp;T, T-Mobile, Verizon, Sprint, and others. Carriers are not liable
              for delayed or undelivered messages.
            </p>
          </div>

          {/* Contact Info */}
          <div className={styles.contactBox}>
            <h2>Questions?</h2>
            <p>
              If you have any questions about our SMS messaging program, contact us at{" "}
              <a href="mailto:JoinGlowUp@gmail.com" className={styles.infoLink}>
                JoinGlowUp@gmail.com
              </a>{" "}
              or visit our{" "}
              <Link href="/contact" className={styles.infoLink}>
                Contact page
              </Link>
              .
            </p>
            <p className={styles.lastUpdated}>
              Last updated: June 27, 2026
            </p>
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
            <div>
              <h4>Legal</h4>
              <Link href="/sms-consent">SMS Terms</Link>
            </div>
          </div>
          <p className={styles.copyright}>© {new Date().getFullYear()} GlowUp. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
