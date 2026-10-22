"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { US_TIMEZONES } from "@/lib/tz";
import type { ImportDraft, DraftService, DraftStaff } from "@/lib/site-import";
import adminStyles from "./admin.module.css";
import styles from "./siteImporter.module.css";

// ─── Import a business from its website ───
// Paste a salon's URL → the server crawls it and Gemini drafts the setup →
// review/fix everything here → Create builds the tenant in preview mode and
// hands back the owner's invite (claim) link. See /api/admin/import-site.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const BUSINESS_TYPES: [string, string][] = [
  ["med_spa", "Medical spa"], ["skin_care", "Skin care / esthetics"], ["nail_salon", "Nail salon"], ["hair_salon", "Hair salon"],
  ["barbershop", "Barbershop"], ["lash_brow", "Lash & brow"], ["massage", "Massage"], ["day_spa", "Day spa"], ["other", "Other"],
];
const SCAN_STEPS = ["Reading the website…", "Finding the price menu…", "Reading prices off the menu images…", "Building services and team…", "Writing the AI receptionist's FAQ…", "Almost there…"];

type Imported = {
  id: string; name: string; slug: string; website: string | null; logo_url: string | null; created_at: string;
  preview: boolean; claimed_at: string | null; claimed_by: string | null; owner_email: string | null;
};
type CreateResult = { tenant_id: string; slug: string; booking_url: string; claim_url: string; services: number; staff: number; logo: boolean };

async function post<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch("/api/admin/import-site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
    if (!res.ok && !json.error) json.error = `Server error (${res.status})`;
    return json;
  } catch {
    return { error: "Network error — check your connection" };
  }
}

async function viewAs(tenantId: string): Promise<string | null> {
  const res = await fetch("/api/admin/impersonate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: tenantId }) });
  if (!res.ok) return (await res.json().catch(() => ({}))).error || "Couldn't switch to that salon";
  try { sessionStorage.removeItem("glowup_tenant_cache"); } catch {}
  window.location.href = "/dashboard";
  return null;
}

export default function SiteImporter() {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [ownerIndex, setOwnerIndex] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [imported, setImported] = useState<Imported[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadImported = useCallback(() => {
    fetch("/api/admin/import-site")
      .then(r => r.json())
      .then(json => { if (json?.data) setImported(json.data); })
      .catch(() => {});
  }, []);
  useEffect(loadImported, [loadImported]);

  useEffect(() => {
    if (!scanning) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(timer);
  }, [scanning]);

  async function scan() {
    if (!url.trim()) return;
    setScanning(true); setElapsed(0); setDraft(null); setResult(null); setScanError(null);
    const { data, error } = await post<ImportDraft>({ action: "scan", url });
    setScanning(false);
    // Kept on screen, not just a toast — a toast fades while you're looking away during a 30s scan
    if (error || !data) { setScanError(error || "Scan failed"); toast.error(error || "Scan failed"); return; }
    setDraft(data);
    setOwnerIndex(data.staff.findIndex(s => s.role === "owner"));
  }

  async function create() {
    if (!draft) return;
    setCreating(true);
    const { data, error } = await post<CreateResult>({ action: "create", draft, owner_index: ownerIndex });
    setCreating(false);
    if (error || !data) { toast.error(error || "Couldn't create the salon"); return; }
    setResult(data);
    setDraft(null);
    toast.success(`${draft.business.name} created`);
    loadImported();
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success("Link copied"); } catch { toast.info(text); }
  }

  async function claimLink(t: Imported, rotate = false) {
    setBusy(t.id);
    const { data, error } = await post<{ claim_url: string }>({ action: "claim-link", tenant_id: t.id, rotate });
    setBusy(null);
    if (error || !data) { toast.error(error || "Couldn't get the link"); return; }
    await copy(data.claim_url);
    if (rotate) toast.info("Old invite link no longer works");
  }

  async function setPreview(t: Imported, preview: boolean) {
    setBusy(t.id);
    const { error } = await post({ action: "set-preview", tenant_id: t.id, preview });
    setBusy(null);
    if (error) { toast.error(error); return; }
    toast.success(preview ? "Booking page back in preview" : `${t.name} is live — clients can book`);
    loadImported();
  }

  // ── Draft editing helpers ──
  const setBiz = (patch: Partial<ImportDraft["business"]>) => setDraft(d => d && { ...d, business: { ...d.business, ...patch } });
  const setService = (i: number, patch: Partial<DraftService>) => setDraft(d => d && { ...d, services: d.services.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const setStaff = (i: number, patch: Partial<DraftStaff>) => setDraft(d => d && { ...d, staff: d.staff.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const setHour = (day: string, patch: Partial<ImportDraft["hours"][string]>) => setDraft(d => d && { ...d, hours: { ...d.hours, [day]: { ...d.hours[day], ...patch } } });

  const included = draft?.services.filter(s => s.include).length || 0;
  const step = SCAN_STEPS[Math.min(SCAN_STEPS.length - 1, Math.floor(elapsed / 5))];

  return (
    <div className={adminStyles.settingsCard}>
      <h3>🌐 Import a business from its website</h3>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
        Paste a salon&apos;s website. GlowUp reads its pages and price menu (even when the menu is a picture), drafts the services, team, hours and AI receptionist,
        and lets you fix everything before creating the salon. The booking page starts in <strong>preview</strong> (no bookings) until the owner goes live.
      </p>

      <div className={styles.scanRow}>
        <input
          type="url"
          inputMode="url"
          placeholder="peachy-skincare.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") scan(); }}
          disabled={scanning}
          aria-label="Website address"
        />
        <button className={adminStyles.enableBtn} onClick={scan} disabled={scanning || !url.trim()}>
          {scanning ? "Scanning…" : draft ? "Scan again" : "Scan website"}
        </button>
      </div>
      {scanning && <div className={styles.progress} role="status">⏳ {step} <span style={{ color: "var(--text-tertiary)" }}>({elapsed}s — usually 20–40s)</span></div>}
      {scanError && !scanning && (
        <div className={`${styles.warnings} ${styles.scanError}`} role="alert">
          <strong>Scan didn&apos;t finish:</strong> {scanError}. Try <em>Scan website</em> again — the AI service is sometimes briefly busy.
        </div>
      )}

      {result && (
        <div className={styles.result}>
          <strong>✅ Created — {result.services} services, {result.staff} team members{result.logo ? ", logo" : ""}.</strong>
          <div className={styles.linkLine}><span>Booking page (preview):</span><code>{result.booking_url}</code>
            <a className={styles.smallBtn} href={result.booking_url} target="_blank" rel="noreferrer">Open</a></div>
          <div className={styles.linkLine}><span>Owner invite link:</span><code>{result.claim_url}</code>
            <button className={styles.smallBtn} onClick={() => copy(result.claim_url)}>Copy</button></div>
          <p style={{ fontSize: 13, marginTop: 8, color: "var(--text-secondary)" }}>
            Send the invite link to the owner. Signing up through it gives them this salon (their 30-day trial starts then). Use View As to polish anything first.
          </p>
          <button className={styles.smallBtn} style={{ marginTop: 8 }} onClick={async () => { const e = await viewAs(result.tenant_id); if (e) toast.error(e); }}>👁 View As</button>
        </div>
      )}

      {draft && (
        <>
          {draft.warnings.length > 0 && (
            <div className={styles.warnings}>
              <strong>Check before creating</strong>
              <ul>{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {/* ── Business ── */}
          <div className={styles.section}>
            <h4>Business</h4>
            <div className={styles.grid}>
              <label className={styles.field}><span>Name</span><input value={draft.business.name} onChange={e => setBiz({ name: e.target.value })} /></label>
              <label className={styles.field}><span>Type</span>
                <select value={draft.business.business_type} onChange={e => setBiz({ business_type: e.target.value })}>
                  {BUSINESS_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className={styles.field}><span>Phone</span><input value={draft.business.phone} onChange={e => setBiz({ phone: e.target.value })} /></label>
              <label className={styles.field}><span>Email (pre-fills the owner&apos;s signup)</span><input type="email" value={draft.business.email} onChange={e => setBiz({ email: e.target.value })} /></label>
              <label className={`${styles.field} ${styles.wide}`}><span>Address</span><input value={draft.business.address} onChange={e => setBiz({ address: e.target.value })} /></label>
              <label className={styles.field}><span>Timezone</span>
                <select value={draft.business.timezone} onChange={e => setBiz({ timezone: e.target.value })}>
                  {!US_TIMEZONES.some(z => z.value === draft.business.timezone) && <option value={draft.business.timezone}>{draft.business.timezone}</option>}
                  {US_TIMEZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                </select>
              </label>
              <label className={styles.field}><span>Website</span><input value={draft.business.website} onChange={e => setBiz({ website: e.target.value })} /></label>
              <div className={styles.field}>
                <span className={styles.label}>Brand colour (booking page accent)</span>
                <div className={styles.swatches}>
                  <input type="color" className={styles.colorInput} value={draft.business.brand_color || "#c37eda"} onChange={e => setBiz({ brand_color: e.target.value })} aria-label="Brand colour" />
                  {draft.business.palette.map(c => (
                    <button key={c} type="button" title={c} aria-label={`Use ${c}`}
                      className={`${styles.swatch} ${draft.business.brand_color === c ? styles.swatchOn : ""}`}
                      style={{ background: c }} onClick={() => setBiz({ brand_color: c })} />
                  ))}
                  {draft.business.brand_color && <button type="button" className={styles.linkBtn} onClick={() => setBiz({ brand_color: null })}>none</button>}
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Logo</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {draft.business.logo_url ? <img src={draft.business.logo_url} alt="" className={styles.logo} /> : <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>none found</span>}
                  <input placeholder="Logo image URL" value={draft.business.logo_url || ""} onChange={e => setBiz({ logo_url: e.target.value || null })} />
                </div>
              </div>
              {draft.business.about && (
                <label className={`${styles.field} ${styles.wide}`}><span>About (kept for reference)</span>
                  <textarea className={styles.textarea} value={draft.business.about} onChange={e => setBiz({ about: e.target.value })} />
                </label>
              )}
            </div>
          </div>

          {/* ── Hours ── */}
          <div className={styles.section}>
            <h4>Bookable hours {draft.hours_estimated && <span className={styles.est}>NOT ON SITE — CONFIRM</span>}</h4>
            {draft.business.hours_text && <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Site says: “{draft.business.hours_text}”</p>}
            <div className={styles.hours}>
              {DAYS.map(day => {
                const h = draft.hours[day];
                return (
                  <div key={day} className={styles.hourRow}>
                    <span>{day}</span>
                    <input type="time" value={h.open} disabled={h.closed} onChange={e => setHour(day, { open: e.target.value })} aria-label={`${day} opens`} />
                    <input type="time" value={h.close} disabled={h.closed} onChange={e => setHour(day, { close: e.target.value })} aria-label={`${day} closes`} />
                    <label className={styles.check}><input type="checkbox" checked={h.closed} onChange={e => setHour(day, { closed: e.target.checked })} /> Closed</label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Services ── */}
          <div className={styles.section}>
            <h4>Services <span className={styles.count}>{included} of {draft.services.length} included</span></h4>
            <div className={`${styles.menuLayout} ${draft.menu_images.length ? styles.hasImages : ""}`}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th></th><th>Name</th><th>Category</th><th>Price $</th><th>Pricing note</th><th>Minutes</th><th>Description</th></tr></thead>
                  <tbody>
                    {draft.services.map((s, i) => (
                      <tr key={i} className={s.include ? "" : styles.off}>
                        <td><input type="checkbox" checked={s.include} onChange={e => setService(i, { include: e.target.checked })} aria-label={`Include ${s.name}`} /></td>
                        <td style={{ minWidth: 200 }}><input value={s.name} onChange={e => setService(i, { name: e.target.value })} /></td>
                        <td style={{ minWidth: 120 }}><input value={s.category} onChange={e => setService(i, { category: e.target.value })} /></td>
                        <td><input className={styles.num} type="number" min={0} step="0.01" value={s.price} onChange={e => setService(i, { price: Number(e.target.value) })} /></td>
                        <td style={{ minWidth: 110 }}><input value={s.price_note} placeholder="per unit…" onChange={e => setService(i, { price_note: e.target.value })} /></td>
                        <td>
                          <input className={styles.num} type="number" min={5} step={5} value={s.duration_minutes} onChange={e => setService(i, { duration_minutes: Number(e.target.value), duration_estimated: false })} />
                          {s.duration_estimated && <div className={styles.est}>EST.</div>}
                        </td>
                        <td style={{ minWidth: 200 }}><input value={s.description} onChange={e => setService(i, { description: e.target.value })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className={styles.linkBtn} onClick={() => setDraft(d => d && { ...d, services: [...d.services, { include: true, name: "", category: d.services[d.services.length - 1]?.category || "Services", description: "", price: 0, price_note: "", duration_minutes: 60, duration_estimated: false, addons: [] }] })}>
                  + Add service
                </button>
              </div>
              {draft.menu_images.length > 0 && (
                <div className={styles.menuImages}>
                  <span className={styles.label}>Menu images read — compare prices</span>
                  {draft.menu_images.map(src => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Menu image from the website" loading="lazy" /></a>)}
                </div>
              )}
            </div>
          </div>

          {/* ── Team ── */}
          <div className={styles.section}>
            <h4>Team <span className={styles.count}>the owner gets the login through the invite link</span></h4>
            <div className={styles.cards}>
              {draft.staff.map((s, i) => (
                <div key={i} className={`${styles.card} ${s.include ? "" : styles.cardOff}`}>
                  <div className={styles.cardHead}>
                    {s.photo_url ? <img src={s.photo_url} alt="" className={styles.avatar} /> : <div className={styles.avatar} />}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <input value={s.name} onChange={e => setStaff(i, { name: e.target.value })} aria-label="Name" />
                      <input value={s.title} placeholder="Title / credentials" onChange={e => setStaff(i, { title: e.target.value })} aria-label="Title" />
                    </div>
                  </div>
                  <label className={styles.check}><input type="checkbox" checked={s.include} onChange={e => { setStaff(i, { include: e.target.checked }); if (!e.target.checked && ownerIndex === i) setOwnerIndex(-1); }} /> Add to the team (bookable)</label>
                  <label className={styles.check}><input type="radio" name="import-owner" checked={ownerIndex === i} disabled={!s.include} onChange={() => setOwnerIndex(i)} /> Owner — gets the login</label>
                  {ownerIndex !== i && (
                    <select value={s.role === "owner" ? "manager" : s.role} onChange={e => setStaff(i, { role: e.target.value as DraftStaff["role"] })} aria-label="Role">
                      <option value="manager">Manager</option>
                      <option value="technician">Technician / provider</option>
                    </select>
                  )}
                  {s.specialties.length > 0 && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Specialties: {s.specialties.join(", ")}</div>}
                  <details>
                    <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--text-secondary)" }}>Bio (the AI receptionist uses it)</summary>
                    <textarea className={styles.textarea} value={s.bio} onChange={e => setStaff(i, { bio: e.target.value })} />
                    <input placeholder="Photo URL" value={s.photo_url || ""} onChange={e => setStaff(i, { photo_url: e.target.value || null })} style={{ marginTop: 6 }} />
                  </details>
                </div>
              ))}
            </div>
            {ownerIndex < 0 && <p style={{ fontSize: 13, color: "var(--status-pending)", marginTop: 8 }}>No owner picked — a placeholder “{draft.business.name} Owner” login row will be created for the invite link.</p>}
            <button type="button" className={styles.linkBtn} onClick={() => setDraft(d => d && { ...d, staff: [...d.staff, { include: true, name: "", title: "", bio: "", photo_url: null, role: "technician", specialties: [] }] })}>+ Add team member</button>
          </div>

          {/* ── AI receptionist ── */}
          <div className={styles.section}>
            <h4>AI receptionist FAQ <span className={styles.count}>team bios are added automatically</span></h4>
            {draft.faq.map((f, i) => (
              <div key={i} className={styles.faqRow}>
                <input value={f.q} onChange={e => setDraft(d => d && { ...d, faq: d.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} aria-label="Question" />
                <textarea rows={2} value={f.a} onChange={e => setDraft(d => d && { ...d, faq: d.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} aria-label="Answer" />
                <button type="button" className={styles.removeBtn} aria-label="Remove" onClick={() => setDraft(d => d && { ...d, faq: d.faq.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" className={styles.linkBtn} onClick={() => setDraft(d => d && { ...d, faq: [...d.faq, { q: "", a: "" }] })}>+ Add question</button>

            {draft.promotions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <span className={styles.label}>Promotions on the site — tick any still running so the AI can mention them</span>
                {draft.promotions.map((p, i) => (
                  <label key={i} className={styles.check} style={{ marginTop: 6 }}>
                    <input type="checkbox" checked={p.include} onChange={e => setDraft(d => d && { ...d, promotions: d.promotions.map((x, j) => j === i ? { ...x, include: e.target.checked } : x) })} />
                    <span><strong>{p.title}</strong>{p.details ? ` — ${p.details}` : ""}</span>
                  </label>
                ))}
              </div>
            )}

            <label className={styles.field} style={{ marginTop: 12 }}>
              <span>Arrival instructions (added to confirmation emails)</span>
              <textarea className={styles.textarea} value={draft.special_instructions} onChange={e => setDraft(d => d && { ...d, special_instructions: e.target.value })} />
            </label>
          </div>

          <div className={styles.section}>
            <details className={styles.sources}>
              <summary style={{ cursor: "pointer" }}>Read {draft.pages_read.length} pages{draft.booking_platform ? ` · currently books with ${draft.booking_platform}` : ""}</summary>
              {draft.pages_read.map(p => <div key={p}><a href={p} target="_blank" rel="noreferrer">{p}</a></div>)}
            </details>
          </div>

          <div className={styles.footer}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Creates <strong>{draft.business.name || "the salon"}</strong> with {included} services and {draft.staff.filter(s => s.include).length + (ownerIndex < 0 ? 1 : 0)} team members, booking page in preview.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={styles.smallBtn} onClick={() => setDraft(null)} disabled={creating}>Discard</button>
              <button className={adminStyles.enableBtn} onClick={create} disabled={creating || included === 0 || !draft.business.name.trim()}>
                {creating ? "Creating…" : "Create salon"}
              </button>
            </div>
          </div>
        </>
      )}

      {imported.length > 0 && (
        <div className={styles.section}>
          <h4>Imported salons</h4>
          <div className={styles.importedList}>
            {imported.map(t => (
              <div key={t.id} className={styles.importedRow}>
                {t.logo_url ? <img src={t.logo_url} alt="" /> : null}
                <div className={styles.importedName}>
                  <strong>{t.name}</strong>{" "}
                  <a href={`/book/${t.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>/book/{t.slug}</a>
                </div>
                <span className={`${styles.chip} ${t.preview ? styles.chipPreview : styles.chipLive}`}>{t.preview ? "Preview" : "Live"}</span>
                <span className={`${styles.chip} ${t.claimed_at ? styles.chipClaimed : styles.chipWaiting}`} title={t.claimed_by || t.owner_email || ""}>
                  {t.claimed_at ? `Claimed by ${t.claimed_by}` : "Owner not signed up"}
                </span>
                {!t.claimed_at && <button className={styles.smallBtn} disabled={busy === t.id} onClick={() => claimLink(t)}>Copy invite</button>}
                {!t.claimed_at && <button className={styles.smallBtn} disabled={busy === t.id} onClick={() => claimLink(t, true)} title="Make a new link and stop the old one working">New invite</button>}
                <button className={styles.smallBtn} disabled={busy === t.id} onClick={() => setPreview(t, !t.preview)}>{t.preview ? "Go live" : "Back to preview"}</button>
                <button className={styles.smallBtn} disabled={busy === t.id} onClick={async () => { setBusy(t.id); const e = await viewAs(t.id); setBusy(null); if (e) toast.error(e); }}>👁 View As</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
