"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData, mutateData } from "@/lib/api";
import styles from "./packages.module.css";

interface ServiceOption { id: string; name: string; price: number; category: string; is_active?: boolean }
interface PkgService { service_id: string; quantity: number; name?: string }
interface Package {
  id: string; name: string; description: string | null; type: 'bundle' | 'membership';
  services: PkgService[]; price: number; original_price: number | null;
  validity_days: number; max_redemptions: number | null;
  times_sold: number; revenue_generated: number; is_active: boolean;
  created_at: string;
}
interface GiftCard {
  id: string; code: string; initial_amount: number; balance: number;
  purchaser_name: string | null; recipient_name: string | null;
  recipient_email: string | null; message: string | null;
  status: string; expires_at: string | null; created_at: string;
}

const TABS = ["Packages", "Gift Cards"] as const;

export default function PackagesPage() {
  const { tenant } = useTenant();
  const t = useTranslations("packagesPage");
  const [tab, setTab] = useState<string>(TABS[0]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showGCModal, setShowGCModal] = useState(false);
  const [editPkg, setEditPkg] = useState<Package | null>(null);

  // Package form state
  const [pkgName, setPkgName] = useState("");
  const [pkgDesc, setPkgDesc] = useState("");
  const [pkgType, setPkgType] = useState<'bundle' | 'membership'>("bundle");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgValidity, setPkgValidity] = useState("365");
  const [pkgServices, setPkgServices] = useState<PkgService[]>([]);

  // Gift card form state
  const [gcAmount, setGcAmount] = useState("");
  const [gcRecipient, setGcRecipient] = useState("");
  const [gcEmail, setGcEmail] = useState("");
  const [gcMessage, setGcMessage] = useState("");
  const [gcPurchaser, setGcPurchaser] = useState("");

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const [pkgRes, gcRes, svcRes] = await Promise.all([
        queryData<Package[]>("packages.list"),
        queryData<GiftCard[]>("giftcards.list"),
        queryData<ServiceOption[]>("services.list"),
      ]);
      setPackages(pkgRes.data || []);
      setGiftCards(gcRes.data || []);
      setServices(svcRes.data || []);
    } finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetPkgForm = () => { setPkgName(""); setPkgDesc(""); setPkgType("bundle"); setPkgPrice(""); setPkgValidity("365"); setPkgServices([]); setEditPkg(null); };
  const resetGCForm = () => { setGcAmount(""); setGcRecipient(""); setGcEmail(""); setGcMessage(""); setGcPurchaser(""); };

  const openEditPkg = (pkg: Package) => {
    setEditPkg(pkg); setPkgName(pkg.name); setPkgDesc(pkg.description || "");
    setPkgType(pkg.type); setPkgPrice(String(pkg.price)); setPkgValidity(String(pkg.validity_days));
    setPkgServices(pkg.services || []); setShowPkgModal(true);
  };

  const handleSavePkg = async () => {
    const originalPrice = pkgServices.reduce((sum, ps) => {
      const svc = services.find(s => s.id === ps.service_id);
      return sum + ((svc?.price || 0) * ps.quantity);
    }, 0);

    const payload = {
      name: pkgName, description: pkgDesc || null, type: pkgType,
      price: parseFloat(pkgPrice) || 0, original_price: originalPrice || null,
      validity_days: parseInt(pkgValidity) || 365,
      services: pkgServices.map(ps => ({ ...ps, name: services.find(s => s.id === ps.service_id)?.name })),
    };

    if (editPkg) {
      await mutateData("packages.update", { id: editPkg.id, ...payload });
    } else {
      await mutateData("packages.add", payload);
    }
    setShowPkgModal(false); resetPkgForm(); fetchData();
  };

  const handleDeletePkg = async (id: string) => {
    if (!confirm("Delete this package?")) return;
    await mutateData("packages.delete", { id }); fetchData();
  };

  const handleCreateGC = async () => {
    try {
      const res = await mutateData("giftcards.create", {
        initial_amount: parseFloat(gcAmount) || 0,
        balance: parseFloat(gcAmount) || 0,
        recipient_name: gcRecipient || null,
        recipient_email: gcEmail || null,
        message: gcMessage || null,
        purchaser_name: gcPurchaser || null,
      });
      if (res.error) {
        alert(`Failed to create gift card: ${res.error}`);
        return;
      }
      setShowGCModal(false); resetGCForm(); fetchData();
    } catch (err) {
      alert(`Failed to create gift card: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const addServiceToPkg = () => setPkgServices([...pkgServices, { service_id: "", quantity: 1 }]);
  const updatePkgService = (i: number, field: string, val: string | number) => {
    const updated = [...pkgServices];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[i] as any)[field] = val;
    setPkgServices(updated);
  };
  const removePkgService = (i: number) => setPkgServices(pkgServices.filter((_, idx) => idx !== i));

  const calcOriginalPrice = () => pkgServices.reduce((sum, ps) => {
    const svc = services.find(s => s.id === ps.service_id);
    return sum + ((svc?.price || 0) * ps.quantity);
  }, 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Packages & Gift Cards</h1>
          <p>Sell bundles, memberships, and digital gift cards</p>
        </div>
        <div className={styles.headerActions}>
          {tab === "Packages" && (
            <button className="btn btn-primary" onClick={() => { resetPkgForm(); setShowPkgModal(true); }}>+ New Package</button>
          )}
          {tab === "Gift Cards" && (
            <button className="btn btn-primary" onClick={() => { resetGCForm(); setShowGCModal(true); }}>+ Create Gift Card</button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t === "Packages" ? `📦 Packages (${packages.length})` : `🎁 Gift Cards (${giftCards.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading...</div>
      ) : (
        <>
          {/* ═══ PACKAGES TAB ═══ */}
          {tab === "Packages" && (
            packages.length === 0 ? (
              <div className={`card ${styles.emptyState}`}>
                <h3>📦 No Packages Yet</h3>
                <p>Create service bundles or monthly memberships to drive recurring revenue and increase average ticket size.</p>
              </div>
            ) : (
              <div className={styles.grid}>
                {packages.map(pkg => (
                  <div key={pkg.id} className={styles.pkgCard}>
                    <span className={`${styles.pkgBadge} ${pkg.type === 'bundle' ? styles.badgeBundle : styles.badgeMembership}`}>
                      {pkg.type}
                    </span>
                    <div className={styles.pkgBody}>
                      <div className={styles.pkgName}>{pkg.name}</div>
                      {pkg.description && <div className={styles.pkgDesc}>{pkg.description}</div>}
                      <div className={styles.pkgPricing}>
                        <span className={styles.pkgPrice}>${pkg.price}</span>
                        {pkg.original_price && pkg.original_price > pkg.price && (
                          <>
                            <span className={styles.pkgOriginal}>${pkg.original_price}</span>
                            <span className={styles.pkgSavings}>Save {Math.round(((pkg.original_price - pkg.price) / pkg.original_price) * 100)}%</span>
                          </>
                        )}
                      </div>
                      {pkg.services?.length > 0 && (
                        <ul className={styles.pkgServices}>
                          {pkg.services.map((s, i) => (
                            <li key={i}>{s.name || services.find(sv => sv.id === s.service_id)?.name || 'Service'} {s.quantity > 1 ? `× ${s.quantity}` : ''}</li>
                          ))}
                        </ul>
                      )}
                      <div className={styles.pkgMeta}>
                        <span>🛒 {pkg.times_sold} sold</span>
                        <span>💰 ${pkg.revenue_generated} earned</span>
                        <span>📅 {pkg.validity_days}d validity</span>
                      </div>
                    </div>
                    <div className={styles.pkgActions}>
                      <button className="btn btn-sm btn-outline" onClick={() => openEditPkg(pkg)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeletePkg(pkg.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ═══ GIFT CARDS TAB ═══ */}
          {tab === "Gift Cards" && (
            giftCards.length === 0 ? (
              <div className={`card ${styles.emptyState}`}>
                <h3>🎁 No Gift Cards Yet</h3>
                <p>Create digital gift cards with unique codes. Perfect for holidays, birthdays, and referral rewards.</p>
              </div>
            ) : (
              <div className={styles.gcGrid}>
                {giftCards.map(gc => (
                  <div key={gc.id} className={styles.gcCard}>
                    <div className={styles.gcCode}>{gc.code}</div>
                    <div className={styles.gcAmounts}>
                      <div className={styles.gcAmount}>
                        <div className={styles.gcAmountValue} style={{ color: gc.balance > 0 ? 'var(--color-success)' : 'var(--text-tertiary)' }}>${gc.balance}</div>
                        <div className={styles.gcAmountLabel}>Balance</div>
                      </div>
                      <div className={styles.gcAmount}>
                        <div className={styles.gcAmountValue}>${gc.initial_amount}</div>
                        <div className={styles.gcAmountLabel}>Original</div>
                      </div>
                    </div>
                    <div className={styles.gcInfo}>
                      {gc.recipient_name && <span>🎀 To: {gc.recipient_name}</span>}
                      {gc.purchaser_name && <span>🛍️ From: {gc.purchaser_name}</span>}
                      {gc.message && <span>💬 &quot;{gc.message}&quot;</span>}
                      <span>📅 Created: {new Date(gc.created_at).toLocaleDateString()}</span>
                      {gc.expires_at && <span>⏰ Expires: {new Date(gc.expires_at).toLocaleDateString()}</span>}
                    </div>
                    <span className={`${styles.gcStatus} ${gc.status === 'active' ? styles.gcActive : styles.gcRedeemed}`}>
                      {gc.status === 'active' ? '● Active' : gc.status === 'redeemed' ? '✓ Fully Redeemed' : gc.status}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* ═══ Package Modal ═══ */}
      {showPkgModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowPkgModal(false); resetPkgForm(); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editPkg ? 'Edit Package' : 'New Package'}</h2>
              <button className={styles.closeBtn} onClick={() => { setShowPkgModal(false); resetPkgForm(); }}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Package Name</label>
                <input value={pkgName} onChange={e => setPkgName(e.target.value)} placeholder="e.g. Blowout Bundle, Monthly Glow" />
              </div>
              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea value={pkgDesc} onChange={e => setPkgDesc(e.target.value)} placeholder="What's included and why it's great..." />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Type</label>
                  <select value={pkgType} onChange={e => setPkgType(e.target.value as 'bundle' | 'membership')}>
                    <option value="bundle">Bundle (one-time)</option>
                    <option value="membership">Membership (recurring)</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Price ($)</label>
                  <input type="number" value={pkgPrice} onChange={e => setPkgPrice(e.target.value)} placeholder="99.00" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Validity (days)</label>
                <input type="number" value={pkgValidity} onChange={e => setPkgValidity(e.target.value)} />
              </div>

              <div className={styles.formGroup}>
                <label>Included Services</label>
                {pkgServices.map((ps, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select value={ps.service_id} onChange={e => updatePkgService(i, 'service_id', e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                      <option value="">Select service...</option>
                      {services.filter(s => s.is_active !== false).map(s => (
                        <option key={s.id} value={s.id}>{s.name} (${s.price})</option>
                      ))}
                    </select>
                    <input type="number" value={ps.quantity} onChange={e => updatePkgService(i, 'quantity', parseInt(e.target.value) || 1)} style={{ width: '60px', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} min={1} />
                    <button onClick={() => removePkgService(i)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                  </div>
                ))}
                <button className="btn btn-sm btn-outline" onClick={addServiceToPkg} style={{ marginTop: '4px' }}>+ Add Service</button>
                {pkgServices.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                    Individual total: <strong>${calcOriginalPrice().toFixed(2)}</strong>
                    {pkgPrice && calcOriginalPrice() > parseFloat(pkgPrice) && (
                      <span style={{ color: 'var(--color-success)', marginLeft: '8px' }}>
                        Savings: ${(calcOriginalPrice() - parseFloat(pkgPrice)).toFixed(2)} ({Math.round(((calcOriginalPrice() - parseFloat(pkgPrice)) / calcOriginalPrice()) * 100)}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className="btn btn-outline" onClick={() => { setShowPkgModal(false); resetPkgForm(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePkg} disabled={!pkgName || !pkgPrice}>{editPkg ? 'Update' : 'Create'} Package</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Gift Card Modal ═══ */}
      {showGCModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowGCModal(false); resetGCForm(); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create Gift Card</h2>
              <button className={styles.closeBtn} onClick={() => { setShowGCModal(false); resetGCForm(); }}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Amount ($)</label>
                <input type="number" value={gcAmount} onChange={e => setGcAmount(e.target.value)} placeholder="50.00" />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  {[25, 50, 75, 100, 150, 200].map(amt => (
                    <button key={amt} className="btn btn-sm btn-outline" onClick={() => setGcAmount(String(amt))} style={gcAmount === String(amt) ? { background: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' } : {}}>
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Purchased By</label>
                  <input value={gcPurchaser} onChange={e => setGcPurchaser(e.target.value)} placeholder="Staff or client name" />
                </div>
                <div className={styles.formGroup}>
                  <label>Recipient Name</label>
                  <input value={gcRecipient} onChange={e => setGcRecipient(e.target.value)} placeholder="Who is it for?" />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Recipient Email (optional)</label>
                <input type="email" value={gcEmail} onChange={e => setGcEmail(e.target.value)} placeholder="Send code to this email" />
              </div>
              <div className={styles.formGroup}>
                <label>Personal Message (optional)</label>
                <textarea value={gcMessage} onChange={e => setGcMessage(e.target.value)} placeholder="Happy Birthday! Enjoy your glow-up! 💕" />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className="btn btn-outline" onClick={() => { setShowGCModal(false); resetGCForm(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateGC} disabled={!gcAmount}>Create Gift Card</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
