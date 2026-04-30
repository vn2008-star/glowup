"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./gallery.module.css";

interface GalleryItem {
  id: string;
  date: string;
  notes: string | null;
  formula: string | null;
  before_photo_urls: string[];
  after_photo_urls: string[];
  satisfaction: number | null;
  service?: { id: string; name: string; category: string };
  staff_member?: { id: string; name: string };
  client?: { id: string; first_name: string; last_name: string | null };
}

interface ClientOption { id: string; first_name: string; last_name: string | null }
interface StaffOption { id: string; name: string }
interface ServiceOption { id: string; name: string; category: string; price: number }

const CATEGORIES = ["All", "Hair", "Skin", "Nails", "Lashes", "Brows", "Makeup", "Waxing"];

export default function GalleryPage() {
  const { tenant } = useTenant();
  const t = useTranslations("galleryPage");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  // Add Transformation modal state
  const [showAdd, setShowAdd] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [servicesList, setServicesList] = useState<ServiceOption[]>([]);
  const [addForm, setAddForm] = useState({
    client_id: "",
    staff_id: "",
    service_id: "",
    notes: "",
    formula: "",
    satisfaction: "",
  });
  const [addBefore, setAddBefore] = useState<string | null>(null);
  const [addAfter, setAddAfter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchGallery = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const { data } = await queryData<GalleryItem[]>("gallery.list", { limit: 100 });
      setItems(data || []);
    } finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchGallery(); }, [fetchGallery]);

  // Fetch dropdown options when Add modal opens
  useEffect(() => {
    if (!showAdd || !tenant) return;
    Promise.all([
      queryData<ClientOption[]>("clients.list"),
      queryData<StaffOption[]>("staff.list"),
      queryData<ServiceOption[]>("services.list"),
    ]).then(([c, s, sv]) => {
      setClients(c.data || []);
      setStaffList((s.data || []).filter((st: StaffOption & { is_active?: boolean }) => (st as StaffOption & { is_active?: boolean }).is_active !== false));
      setServicesList(sv.data || []);
    });
  }, [showAdd, tenant]);

  function handleFileRead(setter: (v: string | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2 MB"); return; }
      const r = new FileReader();
      r.onload = () => setter(r.result as string);
      r.readAsDataURL(file);
    };
  }

  async function handleAddSubmit() {
    if (!addBefore && !addAfter) { alert("Please upload at least one photo"); return; }
    setSaving(true);
    try {
      await queryData("gallery.create", {
        client_id: addForm.client_id || null,
        staff_id: addForm.staff_id || null,
        service_id: addForm.service_id || null,
        notes: addForm.notes || null,
        formula: addForm.formula || null,
        satisfaction: addForm.satisfaction ? Number(addForm.satisfaction) : null,
        before_photo_urls: addBefore ? [addBefore] : [],
        after_photo_urls: addAfter ? [addAfter] : [],
      });
      setShowAdd(false);
      setAddForm({ client_id: "", staff_id: "", service_id: "", notes: "", formula: "", satisfaction: "" });
      setAddBefore(null);
      setAddAfter(null);
      fetchGallery();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this transformation?")) return;
    await queryData("gallery.delete", { id });
    setItems(prev => prev.filter(i => i.id !== id));
    setSelected(null);
  }

  const filtered = filter === "All"
    ? items
    : items.filter(i => i.service?.category?.toLowerCase() === filter.toLowerCase());

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Before & After Gallery</h1>
          <p>Showcase your transformations & build social proof</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          ＋ Add Transformation
        </button>
      </div>

      <div className={styles.filters}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`${styles.filterBtn} ${filter === cat ? styles.filterActive : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading gallery...</div>
      ) : filtered.length === 0 ? (
        <div className={`card ${styles.emptyState}`}>
          <h3>📸 No Transformations Yet</h3>
          <p>Upload before & after photos when completing appointments or click &quot;Add Transformation&quot; above to get started!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(item => (
            <div key={item.id} className={styles.galleryCard} onClick={() => setSelected(item)}>
              <div className={styles.photoCompare}>
                <div className={styles.photoSide}>
                  {item.before_photo_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.before_photo_urls[0]} alt="Before" />
                  ) : (
                    <span className={styles.noPhoto}>No photo</span>
                  )}
                  <span className={`${styles.photoLabel} ${styles.labelBefore}`}>Before</span>
                </div>
                <div className={styles.photoSide}>
                  {item.after_photo_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.after_photo_urls[0]} alt="After" />
                  ) : (
                    <span className={styles.noPhoto}>No photo</span>
                  )}
                  <span className={`${styles.photoLabel} ${styles.labelAfter}`}>After</span>
                </div>
              </div>
              <div className={styles.cardInfo}>
                <div className={styles.cardService}>{item.service?.name || 'Service'}</div>
                <div className={styles.cardMeta}>
                  <span>👤 {item.client?.first_name} {item.client?.last_name || ''}</span>
                  <span>✂️ {item.staff_member?.name || 'Staff'}</span>
                  <span>📅 {new Date(item.date).toLocaleDateString()}</span>
                  {item.satisfaction && <span>⭐ {item.satisfaction}/5</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className={styles.modalOverlay} onClick={() => setSelected(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{selected.service?.name || 'Transformation'}</h2>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ color: "var(--color-danger)", fontSize: "var(--text-xs)" }}
                  onClick={() => handleDelete(selected.id)}
                >
                  Delete
                </button>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
              </div>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalPhotos}>
                <div className={styles.modalPhotoSide}>
                  {selected.before_photo_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.before_photo_urls[0]} alt="Before" />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>No Before Photo</div>
                  )}
                  <span className={`${styles.photoLabel} ${styles.labelBefore}`}>Before</span>
                </div>
                <div className={styles.modalPhotoSide}>
                  {selected.after_photo_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.after_photo_urls[0]} alt="After" />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>No After Photo</div>
                  )}
                  <span className={`${styles.photoLabel} ${styles.labelAfter}`}>After</span>
                </div>
              </div>

              <div className={styles.modalDetails}>
                <div className={styles.modalDetail}>
                  <div className={styles.modalDetailLabel}>Client</div>
                  <div className={styles.modalDetailValue}>{selected.client?.first_name} {selected.client?.last_name || ''}</div>
                </div>
                <div className={styles.modalDetail}>
                  <div className={styles.modalDetailLabel}>Stylist</div>
                  <div className={styles.modalDetailValue}>{selected.staff_member?.name || '—'}</div>
                </div>
                <div className={styles.modalDetail}>
                  <div className={styles.modalDetailLabel}>Date</div>
                  <div className={styles.modalDetailValue}>{new Date(selected.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div className={styles.modalDetail}>
                  <div className={styles.modalDetailLabel}>Category</div>
                  <div className={styles.modalDetailValue}>{selected.service?.category || '—'}</div>
                </div>
                {selected.formula && (
                  <div className={styles.modalDetail} style={{ gridColumn: '1 / -1' }}>
                    <div className={styles.modalDetailLabel}>Formula / Products</div>
                    <div className={styles.modalDetailValue}>{selected.formula}</div>
                  </div>
                )}
                {selected.notes && (
                  <div className={styles.modalDetail} style={{ gridColumn: '1 / -1' }}>
                    <div className={styles.modalDetailLabel}>Notes</div>
                    <div className={styles.modalDetailValue}>{selected.notes}</div>
                  </div>
                )}
                {selected.satisfaction && (
                  <div className={styles.modalDetail}>
                    <div className={styles.modalDetailLabel}>Satisfaction</div>
                    <div className={styles.modalDetailValue}>{'⭐'.repeat(selected.satisfaction)} ({selected.satisfaction}/5)</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Transformation Modal */}
      {showAdd && (
        <div className={styles.modalOverlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>📸 Add Transformation</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            <div className={styles.modalBody}>
              {/* Photo Upload */}
              <div className={styles.addPhotoRow}>
                <label className={styles.addPhotoSlot}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileRead(setAddBefore)} />
                  {addBefore ? (
                    <div className={styles.addPhotoPreview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={addBefore} alt="Before" />
                      <div className={styles.addPhotoOverlay}>Change</div>
                    </div>
                  ) : (
                    <div className={styles.addPhotoEmpty}>
                      <span>＋</span>
                      <small>Before Photo</small>
                    </div>
                  )}
                </label>
                <label className={styles.addPhotoSlot}>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileRead(setAddAfter)} />
                  {addAfter ? (
                    <div className={styles.addPhotoPreview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={addAfter} alt="After" />
                      <div className={styles.addPhotoOverlay}>Change</div>
                    </div>
                  ) : (
                    <div className={styles.addPhotoEmpty}>
                      <span>＋</span>
                      <small>After Photo</small>
                    </div>
                  )}
                </label>
              </div>

              {/* Form Fields */}
              <div className={styles.addFormGrid}>
                <div className={styles.addFormGroup}>
                  <label className="label">Client</label>
                  <select className="input" value={addForm.client_id} onChange={e => setAddForm({ ...addForm, client_id: e.target.value })}>
                    <option value="">Select client...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ''}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.addFormGroup}>
                  <label className="label">Staff</label>
                  <select className="input" value={addForm.staff_id} onChange={e => setAddForm({ ...addForm, staff_id: e.target.value })}>
                    <option value="">Select staff...</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.addFormGroup}>
                  <label className="label">Service</label>
                  <select className="input" value={addForm.service_id} onChange={e => setAddForm({ ...addForm, service_id: e.target.value })}>
                    <option value="">Select service...</option>
                    {servicesList.map(sv => (
                      <option key={sv.id} value={sv.id}>{sv.name} ({sv.category})</option>
                    ))}
                  </select>
                </div>
                <div className={styles.addFormGroup}>
                  <label className="label">Satisfaction (1-5)</label>
                  <select className="input" value={addForm.satisfaction} onChange={e => setAddForm({ ...addForm, satisfaction: e.target.value })}>
                    <option value="">Optional</option>
                    {[5,4,3,2,1].map(n => (
                      <option key={n} value={n}>{'⭐'.repeat(n)} ({n})</option>
                    ))}
                  </select>
                </div>
                <div className={styles.addFormGroup} style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Formula / Products Used</label>
                  <input className="input" value={addForm.formula} onChange={e => setAddForm({ ...addForm, formula: e.target.value })} placeholder="e.g., 0.5mm C-curl, 10mm–14mm mixed" />
                </div>
                <div className={styles.addFormGroup} style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Notes</label>
                  <textarea className="input" rows={2} value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Any notes about this transformation..." />
                </div>
              </div>

              <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddSubmit} disabled={saving}>
                  {saving ? "Saving..." : "Save Transformation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
