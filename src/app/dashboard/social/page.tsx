"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./social.module.css";
import type { SocialPost } from "@/lib/types";

const PLATFORMS = [
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "google", label: "Google Business", icon: "🔍" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
];

const TEMPLATES = [
  { value: "before_after", label: "Before & After", desc: "Showcase a client transformation" },
  { value: "promotion", label: "Promotion", desc: "Advertise a special offer" },
  { value: "review", label: "Client Review", desc: "Share a glowing testimonial" },
  { value: "tips", label: "Tips & Tricks", desc: "Educational beauty content" },
  { value: "custom", label: "Custom Post", desc: "Write your own content" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SocialPage() {
  const { tenant } = useTenant();
  const t = useTranslations("socialPage");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"calendar" | "posts" | "templates" | "reviews" | "portfolio">("posts");
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const [formData, setFormData] = useState({
    content: "",
    platforms: ["instagram"] as string[],
    status: "draft" as string,
    template_type: "custom" as string,
    scheduled_at: "",
  });

  const fetchPosts = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<SocialPost[]>("social.list");
    setPosts(data || []);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  function openNew(templateType?: string) {
    setEditingPost(null);
    const tmpl = TEMPLATES.find((t) => t.value === templateType);
    setFormData({
      content: templateType === "before_after"
        ? "✨ Transformation Tuesday! Swipe to see the before & after. Our team loves creating magic ❤️ \n\n#BeautyTransformation #SalonLife #GlowUp"
        : templateType === "promotion"
          ? "🎉 SPECIAL OFFER this week only! [Describe your offer] \n\nBook now before spots fill up! Link in bio 👆\n\n#SalonDeals #BeautySpecial"
          : templateType === "review"
            ? "⭐⭐⭐⭐⭐ \"[Paste client review here]\" — Thank you so much! We love our clients 💕\n\n#ClientLove #5Stars"
            : templateType === "tips"
              ? "💡 Beauty Tip: [Share your expert advice here]\n\nTag a friend who needs to see this! 👇\n\n#BeautyTips #ProTip"
              : "",
      platforms: ["instagram"],
      status: "draft",
      template_type: tmpl?.value || "custom",
      scheduled_at: "",
    });
    setShowModal(true);
  }

  function openEdit(p: SocialPost) {
    setEditingPost(p);
    setFormData({
      content: p.content || "",
      platforms: p.platforms || [],
      status: p.status,
      template_type: p.template_type || "custom",
      scheduled_at: p.scheduled_at ? new Date(p.scheduled_at).toISOString().slice(0, 16) : "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      content: formData.content,
      platforms: formData.platforms,
      status: formData.status,
      template_type: formData.template_type,
      scheduled_at: formData.scheduled_at ? new Date(formData.scheduled_at).toISOString() : null,
    };

    if (editingPost) {
      const { data } = await queryData<SocialPost>("social.update", { id: editingPost.id, ...payload });
      if (data) setPosts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      const { data } = await queryData<SocialPost>("social.add", payload);
      if (data) setPosts((prev) => [data, ...prev]);
    }
    setShowModal(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this post?")) return;
    await queryData("social.delete", { id });
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  function togglePlatform(val: string) {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(val) ? prev.platforms.filter((p) => p !== val) : [...prev.platforms, val],
    }));
  }

  // Calendar data
  function getCalendarDays() {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }

  function getPostsForDay(day: number) {
    return posts.filter((p) => {
      const d = p.scheduled_at ? new Date(p.scheduled_at) : new Date(p.created_at);
      return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth && d.getDate() === day;
    });
  }

  const draftCount = posts.filter((p) => p.status === "draft").length;
  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;
  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{t("title")}</h1>
          <p>Create, schedule, and manage social content from one place</p>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()}>{t("newPost")}</button>
      </div>

      {/* Summary */}
      <div className={styles.summaryGrid}>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Drafts</span>
          <span className={styles.summaryValue}>{draftCount}</span>
        </div>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Scheduled</span>
          <span className={styles.summaryValue}>{scheduledCount}</span>
        </div>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Published</span>
          <span className={styles.summaryValue}>{publishedCount}</span>
        </div>
        <div className={`card ${styles.summaryCard}`}>
          <span className={styles.summaryLabel}>Total Posts</span>
          <span className={styles.summaryValue}>{posts.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === "posts" ? styles.activeTab : ""}`} onClick={() => setActiveTab("posts")}>
          All Posts
        </button>
        <button className={`${styles.tab} ${activeTab === "calendar" ? styles.activeTab : ""}`} onClick={() => setActiveTab("calendar")}>
          Calendar
        </button>
        <button className={`${styles.tab} ${activeTab === "templates" ? styles.activeTab : ""}`} onClick={() => setActiveTab("templates")}>
          Templates
        </button>
        <button className={`${styles.tab} ${activeTab === "reviews" ? styles.activeTab : ""}`} onClick={() => setActiveTab("reviews")}>
          ⭐ Review Booster
        </button>
        <button className={`${styles.tab} ${activeTab === "portfolio" ? styles.activeTab : ""}`} onClick={() => setActiveTab("portfolio")}>
          📸 Portfolio
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading posts...</div>
      ) : activeTab === "posts" ? (
        posts.length === 0 ? (
          <div className={styles.empty}>
            <p style={{ marginBottom: "1rem" }}>No posts yet. Start creating content for your salon!</p>
            <button className="btn btn-primary" onClick={() => openNew()}>Create First Post</button>
          </div>
        ) : (
          <div className={styles.postList}>
            {posts.map((p) => (
              <div key={p.id} className={`card ${styles.postCard}`}>
                <div className={styles.postHeader}>
                  <div className={styles.postPlatforms}>
                    {(p.platforms || []).map((pl) => {
                      const plat = PLATFORMS.find((pt) => pt.value === pl);
                      return <span key={pl} className={styles.platformIcon} title={plat?.label || pl}>{plat?.icon || "📱"}</span>;
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span className={`badge ${p.status === "published" ? "badge-success" : p.status === "scheduled" ? "badge-info" : "badge-warning"}`}>
                      {p.status}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id)}>🗑️</button>
                  </div>
                </div>
                {p.content && (
                  <p className={styles.postContent}>{p.content.length > 200 ? p.content.slice(0, 200) + "..." : p.content}</p>
                )}
                <div className={styles.postMeta}>
                  {p.template_type && <span className="badge badge-primary">{p.template_type.replace("_", " ")}</span>}
                  <span className={styles.postDate}>
                    {p.scheduled_at
                      ? `Scheduled: ${new Date(p.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : `Created: ${new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </span>
                </div>
                {p.status === "published" && p.metrics && (
                  <div className={styles.postStats}>
                    <span>❤️ {p.metrics.likes}</span>
                    <span>💬 {p.metrics.comments}</span>
                    <span>🔄 {p.metrics.shares}</span>
                    <span>👁️ {p.metrics.reach}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : activeTab === "calendar" ? (
        <div className={`card ${styles.calendarCard}`}>
          <div className={styles.calendarNav}>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((y) => y - 1); }
              else setCalendarMonth((m) => m - 1);
            }}>← Prev</button>
            <h3>{new Date(calendarYear, calendarMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((y) => y + 1); }
              else setCalendarMonth((m) => m + 1);
            }}>Next →</button>
          </div>
          <div className={styles.calendarGrid}>
            {DAYS.map((d) => <div key={d} className={styles.calendarDayHeader}>{d}</div>)}
            {getCalendarDays().map((day, i) => (
              <div key={i} className={`${styles.calendarDay} ${day ? "" : styles.empty}`}>
                {day && (
                  <>
                    <span className={styles.dayNumber}>{day}</span>
                    {getPostsForDay(day).map((p) => (
                      <div key={p.id} className={`${styles.calendarPost} ${styles[`status_${p.status}`] || ""}`} onClick={() => openEdit(p)} title={p.content || ""}>
                        {(p.platforms || []).map((pl) => PLATFORMS.find((pt) => pt.value === pl)?.icon || "📱").join("")}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === "templates" ? (
        <div className={styles.templateGrid}>
          {TEMPLATES.map((t) => (
            <div key={t.value} className={`card ${styles.templateCard}`} onClick={() => openNew(t.value)}>
              <h3>{t.label}</h3>
              <p>{t.desc}</p>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: "auto" }}>Use Template</button>
            </div>
          ))}
        </div>
      ) : activeTab === "reviews" ? (
        /* ═══ REVIEW BOOSTER TAB ═══ */
        <div>
          <div className={`card`} style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>⭐ Review Booster</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>Generate 1-tap review links for Google & Yelp. Send post-service to turn happy clients into 5-star reviews.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
              {/* Google Review */}
              <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <span style={{ fontSize: '2rem' }}>🔍</span>
                  <div>
                    <h3 style={{ fontWeight: 700 }}>Google Business</h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>4.5+ stars = 2x more bookings from search</p>
                  </div>
                </div>
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>Your Google Place ID</label>
                  <input className="input" placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4" style={{ width: '100%' }} />
                  <small style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Find at: <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>Google Place ID Finder</a></small>
                </div>
                <div style={{ padding: 'var(--space-3)', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  <strong>Review Link:</strong><br />
                  <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID</code>
                </div>
              </div>
              {/* Yelp Review */}
              <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <span style={{ fontSize: '2rem' }}>🟥</span>
                  <div>
                    <h3 style={{ fontWeight: 700 }}>Yelp</h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Top source for local beauty discovery</p>
                  </div>
                </div>
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>Your Yelp Business URL</label>
                  <input className="input" placeholder="e.g. https://www.yelp.com/biz/your-salon" style={{ width: '100%' }} />
                </div>
                <div style={{ padding: 'var(--space-3)', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  <strong>Review Link:</strong><br />
                  <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>https://www.yelp.com/writeareview/biz/YOUR_BIZ_ID</code>
                </div>
              </div>
            </div>
          </div>
          {/* SMS Templates */}
          <div className={`card`} style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>📱 Post-Service Review Request Templates</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>Sent automatically 2 hours after a completed appointment (configure in Campaigns → Automations).</p>
            {[
              { label: '5-Star Happy Client', msg: 'Hi {name}! Thanks for visiting us today! We loved working with you ❤️ If you have a moment, a quick review would mean the world: {review_link}', tone: 'Warm & personal' },
              { label: 'Quick & Direct', msg: 'Hi {name}! How was your experience today? We\'d love your feedback → {review_link} Thank you! 🌟', tone: 'Professional & brief' },
              { label: 'Incentive Offer', msg: 'Hi {name}! Leave us a Google review and get 50 loyalty points on your next visit! → {review_link} Thank you! 💕', tone: 'Value-driven' },
            ].map((t, i) => (
              <div key={i} style={{ padding: 'var(--space-4)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <strong style={{ fontSize: 'var(--text-sm)' }}>{t.label}</strong>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>{t.tone}</span>
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{t.msg}</p>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === "portfolio" ? (
        /* ═══ INSTAGRAM PORTFOLIO SYNC TAB ═══ */
        <div>
          <div className={`card`} style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>📸 Instagram Portfolio Sync</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>Curate your best before & after photos into a portfolio that syncs to your public booking page and social feeds.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              <div style={{ padding: 'var(--space-5)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-primary)' }}>0</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Portfolio Posts</div>
              </div>
              <div style={{ padding: 'var(--space-5)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-primary)' }}>—</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Instagram Connected</div>
              </div>
              <div style={{ padding: 'var(--space-5)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-primary)' }}>0</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Booking Page Views</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
              {/* Connect Instagram */}
              <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <span style={{ fontSize: '2rem' }}>📸</span>
                  <div>
                    <h3 style={{ fontWeight: 700 }}>Connect Instagram</h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Auto-pull your best posts into the portfolio</p>
                  </div>
                </div>
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>Instagram Handle</label>
                  <input className="input" placeholder="@yoursalon" style={{ width: '100%' }} />
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }}>🔗 Connect Instagram</button>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 'var(--space-2)', textAlign: 'center' }}>Uses Instagram Basic Display API</p>
              </div>
              {/* Manual Portfolio */}
              <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <span style={{ fontSize: '2rem' }}>🖼️</span>
                  <div>
                    <h3 style={{ fontWeight: 700 }}>Gallery → Portfolio</h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Push B&A photos from Gallery to your portfolio</p>
                  </div>
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>Your before & after photos from the Gallery page can be curated into a public portfolio shown on your booking page. Clients browsing your services will see real results.</p>
                <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => window.location.href = '/dashboard/gallery'}>Go to Gallery →</button>
              </div>
            </div>
          </div>
          {/* Portfolio Display Settings */}
          <div className={`card`} style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>⚙️ Portfolio Display Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>Display Style</label>
                <select className="input" style={{ width: '100%' }}>
                  <option>Grid (Instagram-style)</option>
                  <option>Carousel (swipeable)</option>
                  <option>Before/After Slider</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>Show on Booking Page</label>
                <select className="input" style={{ width: '100%' }}>
                  <option>Yes — show portfolio section</option>
                  <option>No — hide from booking page</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{editingPost ? "Edit Post" : "Create Post"}</h2>
            <form onSubmit={handleSave}>
              <div className={styles.formGroup}>
                <label className="label">Content</label>
                <textarea className="input" rows={6} value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} placeholder="Write your social media post..." />
              </div>

              <div className={styles.formGroup}>
                <label className="label">Platforms</label>
                <div className={styles.platformPicker}>
                  {PLATFORMS.map((p) => (
                    <button key={p.value} type="button" className={`${styles.platformBtn} ${formData.platforms.includes(p.value) ? styles.platformActive : ""}`} onClick={() => togglePlatform(p.value)}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className="label">Status</label>
                  <select className="input" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Schedule For</label>
                  <input className="input" type="datetime-local" value={formData.scheduled_at} onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value, status: e.target.value ? "scheduled" : formData.status })} />
                </div>
              </div>

              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingPost ? "Save Changes" : "Create Post"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
