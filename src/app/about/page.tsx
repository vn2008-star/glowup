import styles from "./about.module.css";
import Link from "next/link";
import { GlowUpLogo } from "@/components/GlowUpLogo";
import { LandingHeader } from "../LandingHeader";

const LogoIcon = () => <GlowUpLogo size={28} />;

export const metadata = {
  title: "About GlowUp — Our Story",
  description: "Learn about GlowUp, the modern salon management platform built to empower beauty professionals with smart tools for scheduling, payments, and client engagement.",
};

export default function AboutPage() {
  return (
    <main className={styles.main}>
      {/* Ambient orbs */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <LandingHeader />

      {/* Hero */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <span className={styles.badge}>✦ Our Story</span>
          <h1 className={styles.title}>
            Beauty Deserves<br />
            <span className={styles.gradient}>Better&nbsp;Software</span>
          </h1>
          <p className={styles.subtitle}>
            We&apos;re building the tools that let beauty professionals focus on
            what they love — making people feel amazing.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className={styles.section}>
        <div className={`container ${styles.missionGrid}`}>
          <div className={styles.missionCard}>
            <span className={styles.missionIcon}>💜</span>
            <h3>Our Mission</h3>
            <p>
              To empower every salon, spa, and independent beauty professional
              with intelligent, all-in-one management tools — so they can spend
              less time on admin and more time creating confidence.
            </p>
          </div>
          <div className={styles.missionCard}>
            <span className={styles.missionIcon}>✨</span>
            <h3>Our Vision</h3>
            <p>
              A world where running a beauty business is as effortless as the
              transformations it creates. Smart scheduling, real-time analytics,
              and seamless payments — all in one beautiful dashboard.
            </p>
          </div>
          <div className={styles.missionCard}>
            <span className={styles.missionIcon}>🤝</span>
            <h3>Our Values</h3>
            <p>
              We believe in simplicity over complexity, elegance over excess, and
              people over processes. Every feature we build starts with a real
              conversation with a real salon owner.
            </p>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className={styles.storySection}>
        <div className={`container ${styles.storyInner}`}>
          <h2 className={styles.sectionTitle}>Why We Built GlowUp</h2>
          <div className={styles.storyContent}>
            <p>
              Too many salon owners juggle between clunky scheduling apps,
              paper-based payments, and spreadsheets for client management. We
              saw talented professionals drowning in admin while their artistry
              waited.
            </p>
            <p>
              GlowUp was born from a simple insight: <strong>the beauty
              industry deserves software as refined as the services it
              provides.</strong> We built a platform that combines appointment
              scheduling, real-time checkout, client CRM, loyalty programs, and
              smart analytics into a single, gorgeous dashboard.
            </p>
            <p>
              From solo nail technicians to multi-chair salons, GlowUp adapts
              to your workflow — not the other way around.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className={styles.section}>
        <div className={`container ${styles.statsGrid}`}>
          {[
            { value: "500+", label: "Salons Onboarded" },
            { value: "50K+", label: "Appointments Managed" },
            { value: "99.9%", label: "Uptime" },
            { value: "4.9★", label: "Average Rating" },
          ].map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className={styles.ctaSection}>
        <div className={`container ${styles.ctaInner}`}>
          <div className={styles.ctaCard}>
            <h2>Ready to Glow&nbsp;Up?</h2>
            <p>Join hundreds of beauty professionals who&apos;ve upgraded their workflow.</p>
            <div className={styles.ctaBtns}>
              <Link href="/auth/signup" className="btn btn-primary">
                Get Started Free
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Contact Us
              </Link>
            </div>
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
