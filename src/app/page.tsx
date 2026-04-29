import styles from "./page.module.css";
import Link from "next/link";
import { GlowUpLogo } from "@/components/GlowUpLogo";
import { LandingHeader } from "./LandingHeader";
import { getTranslations } from "next-intl/server";

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

/* ─── Page ─── */
export default async function LandingPage() {
  const t = await getTranslations('landing');
  const tc = await getTranslations('common');

  const features = [
    { icon: <CalendarIcon />, title: t('feature1Title'), description: t('feature1Desc') },
    { icon: <CameraIcon />, title: t('feature2Title'), description: t('feature2Desc') },
    { icon: <HeartIcon />, title: t('feature3Title'), description: t('feature3Desc') },
    { icon: <ShieldIcon />, title: t('feature4Title'), description: t('feature4Desc') },
    { icon: <TrendingIcon />, title: t('feature5Title'), description: t('feature5Desc') },
    { icon: <BotIcon />, title: t('feature6Title'), description: t('feature6Desc') },
  ];

  const plans = [
    {
      name: t('starterName'), price: "25", target: t('starterTarget'),
      features: [t('starterF1'), t('starterF2'), t('starterF3'), t('starterF4'), t('starterF5')],
      cta: t('startTrial'), highlighted: false,
    },
    {
      name: t('growthName'), price: "75", target: t('growthTarget'),
      features: [t('growthF1'), t('growthF2'), t('growthF3'), t('growthF4'), t('growthF5'), t('growthF6')],
      cta: t('startTrial'), highlighted: true,
    },
    {
      name: t('proName'), price: "150", target: t('proTarget'),
      features: [t('proF1'), t('proF2'), t('proF3'), t('proF4'), t('proF5'), t('proF6'), t('proF7')],
      cta: t('startTrial'), highlighted: false,
    },
  ];

  const stats = [
    { value: "60%", label: t('statsNoShows') },
    { value: "3.2x", label: t('statsRepeat') },
    { value: "45%", label: t('statsRevenue') },
    { value: "$0", label: t('statsSetup') },
  ];

  return (
    <main className={styles.main}>
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />
      <LandingHeader />

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>{t('badge')}</div>
            <h1 className={styles.heroTitle}>
              {t('heroTitle')} <span className="gradient-text">{t('heroHighlight')}</span>
            </h1>
            <p className={styles.heroSubtitle}>{t('heroSubtitle')}</p>
            <div className={styles.heroCta}>
              <Link href="/auth/signup" className="btn btn-lg btn-primary">
                {t('ctaPrimary')} <ArrowRightIcon />
              </Link>
              <a href="#features" className="btn btn-lg btn-secondary">{t('ctaSecondary')}</a>
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
            <h2>{t('featuresTitle')} <span className="gradient-text">{t('featuresHighlight')}</span></h2>
            <p>{t('featuresSubtitle')}</p>
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
            <h2>{t('stepsTitle')} <span className="gradient-text">{t('stepsHighlight')}</span>{t('stepsTitleEnd')}</h2>
            <p>{t('stepsSubtitle')}</p>
          </div>
          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>{t('step1Title')}</h3>
              <p>{t('step1Desc')}</p>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>{t('step2Title')}</h3>
              <p>{t('step2Desc')}</p>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>{t('step3Title')}</h3>
              <p>{t('step3Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className={styles.pricing}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2>{t('pricingTitle')} <span className="gradient-text">{t('pricingHighlight')}</span></h2>
            <p>{t('pricingSubtitle')}</p>
          </div>
          <div className={styles.pricingGrid}>
            {plans.map((plan) => (
              <div key={plan.name} className={`${styles.pricingCard} ${plan.highlighted ? styles.pricingHighlighted : ""}`}>
                {plan.highlighted && <div className={styles.pricingBadge}>{t('mostPopular')}</div>}
                <div className={styles.pricingHeader}>
                  <h3>{plan.name}</h3>
                  <p className={styles.pricingTarget}>{plan.target}</p>
                  <div className={styles.pricingPrice}>
                    <span className={styles.pricingCurrency}>$</span>
                    <span className={styles.pricingAmount}>{plan.price}</span>
                    <span className={styles.pricingPeriod}>{t('perMonth')}</span>
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
            <h2>{t('ctaTitle')} <span className="gradient-text">{t('ctaHighlight')}</span></h2>
            <p>{t('ctaSubtitle')}</p>
            <Link href="/auth/signup" className="btn btn-lg btn-primary">
              {t('ctaButton')} <ArrowRightIcon />
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
            <p>{t('footerTagline')}</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <h4>{t('footerProduct')}</h4>
              <a href="#features">{tc('features')}</a>
              <a href="#pricing">{tc('pricing')}</a>
            </div>
            <div>
              <h4>{t('footerCompany')}</h4>
              <a href="#">{t('footerAbout')}</a>
              <a href="#">{t('footerContact')}</a>
            </div>
          </div>
          <p className={styles.copyright}>{t('copyright')}</p>
        </div>
      </footer>
    </main>
  );
}
