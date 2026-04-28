import styles from "./page.module.css";
import Link from "next/link";
import { GlowUpLogo } from "@/components/GlowUpLogo";
import { LandingHeader } from "./LandingHeader";

/* ─── Icon Components ─── */
const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
);
const UsersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const CameraIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
);
const HeartIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
);
const ShieldIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
);
const TrendingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
);
const BotIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2v1h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3V4a2 2 0 0 1 2-2z" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /><path d="M9 14h6" /><line x1="3" y1="10" x2="4" y2="10" /><line x1="20" y1="10" x2="21" y2="10" /></svg>
);
const LogoIcon = () => <GlowUpLogo size={28} />;
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const ArrowRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
);

/* ─── Data ─── */
const features = [
  {
    icon: <CalendarIcon />,
    title: "Smart Booking",
    description: "Online booking with real-time availability, automatic reminders, and deposit collection. Reduce no-shows by 60%.",
  },
  {
    icon: <CameraIcon />,
    title: "Photo Portfolio & Customer Relationship Management",
    description: "Store before/after photos, nail designs, color formulas, and client preferences. Your complete beauty database.",
  },
  {
    icon: <HeartIcon />,
    title: "Retention Autopilot",
    description: "Birthday specials, rebooking reminders, loyalty programs, and 'we miss you' campaigns — all automated.",
  },
  {
    icon: <ShieldIcon />,
    title: "Client Protection",
    description: "Masked communications keep client data with the business, not the technician. Protected transitions when staff changes.",
  },
  {
    icon: <TrendingIcon />,
    title: "Social Media Engine",
    description: "AI-generated posts from client photos, content calendar, ad templates, and review-to-post automation.",
  },
  {
    icon: <BotIcon />,
    title: "AI Receptionist",
    description: "24/7 chatbot answers questions and books appointments from your website, Instagram, and Facebook.",
  },
];

const plans = [
  {
    name: "Starter",
    price: "25",
    target: "1–4 staff",
    features: ["Up to 4 staff members", "Online booking page", "Client Management + photos", "SMS reminders", "Basic dashboard"],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "75",
    target: "5–10 staff",
    features: ["Up to 10 staff members", "Everything in Starter", "Campaign automation", "Loyalty & referrals", "Social media tools", "Birthday specials"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Professional",
    price: "150",
    target: "11–20 staff",
    features: ["Up to 20 staff members", "Everything in Growth", "Masked communications", "AI content generator", "Advanced analytics", "Churn detection", "Staff performance"],
    cta: "Start Free Trial",
    highlighted: false,
  },
];

const stats = [
  { value: "60%", label: "Less no-shows" },
  { value: "3.2x", label: "More repeat visits" },
  { value: "45%", label: "Revenue increase" },
  { value: "$0", label: "Setup cost" },
];

/* ─── Page ─── */
export default function LandingPage() {
  return (
    <main className={styles.main}>
      {/* ── Ambient background ── */}
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />

      {/* ── Header ── */}
      <LandingHeader />

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              ✦ Built for Hair, Skin, Nails, Lashes, Brows, Makeup & Waxing professionals
              <br />
              — from solo artists to full-service salons & spas
            </div>
            <h1 className={styles.heroTitle}>
              Grow your beauty business <span className="gradient-text">on autopilot</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Smart booking, photo-based Customer Relationship Management, retention automation, and our new <strong>&ldquo;Fill My Openings&rdquo;</strong> campaign tool — instantly blast last-minute availability to clients and keep every chair full.
            </p>
            <div className={styles.heroCta}>
              <Link href="/auth/signup" className="btn btn-lg btn-primary">
                Start Free Trial <ArrowRightIcon />
              </Link>
              <a href="#features" className="btn btn-lg btn-secondary">See How It Works</a>
            </div>
            <div className={styles.heroStats}>
              {stats.map((stat) => (
                <div key={stat.label} className={styles.stat}>
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statLabel}>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className={styles.features}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2>Everything your salon needs to <span className="gradient-text">thrive</span></h2>
            <p>Not just booking — a complete growth automation platform</p>
          </div>
          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <div key={feature.title} className={`card-glass ${styles.featureCard}`}>
                <div className={styles.featureIcon}>{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className={styles.howItWorks}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2>Set up in <span className="gradient-text">minutes</span>, not months</h2>
            <p>Get started in 3 simple steps</p>
          </div>
          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Add your services</h3>
              <p>Enter your service menu with prices, duration, and photos. Takes 5 minutes.</p>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Share your booking link</h3>
              <p>Add it to your Instagram bio, website, and Google profile. Clients book instantly.</p>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Watch your business grow</h3>
              <p>Automated reminders, campaigns, and loyalty rewards keep clients coming back.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className={styles.pricing}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2>Simple, transparent <span className="gradient-text">pricing</span></h2>
            <p>Start free for 30 days. No credit card required.</p>
          </div>
          <div className={styles.pricingGrid}>
            {plans.map((plan) => (
              <div key={plan.name} className={`${styles.pricingCard} ${plan.highlighted ? styles.pricingHighlighted : ""}`}>
                {plan.highlighted && <div className={styles.pricingBadge}>Most Popular</div>}
                <div className={styles.pricingHeader}>
                  <h3>{plan.name}</h3>
                  <p className={styles.pricingTarget}>{plan.target}</p>
                  <div className={styles.pricingPrice}>
                    <span className={styles.pricingCurrency}>$</span>
                    <span className={styles.pricingAmount}>{plan.price}</span>
                    <span className={styles.pricingPeriod}>/mo</span>
                  </div>
                </div>
                <ul className={styles.pricingFeatures}>
                  {plan.features.map((f) => (
                    <li key={f}><CheckIcon /> {f}</li>
                  ))}
                </ul>
                <Link href="/auth/signup" className={`btn btn-lg ${plan.highlighted ? "btn-primary" : "btn-secondary"} ${styles.pricingCta}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.finalCta}>
        <div className="container">
          <div className={styles.ctaCard}>
            <h2>Ready to fill your calendar <span className="gradient-text">automatically?</span></h2>
            <p>Join hundreds of beauty businesses that grow on autopilot with GlowUp.</p>
            <Link href="/auth/signup" className="btn btn-lg btn-primary">
              Start Your Free Trial <ArrowRightIcon />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <div className={styles.footerBrand}>
            <Link href="/" className={styles.logo}>
              <LogoIcon /> <span>GlowUp</span>
            </Link>
            <p>AI-powered automation for beauty businesses.</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Contact</a>
            </div>
          </div>
          <p className={styles.copyright}>© 2026 GlowUp. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
