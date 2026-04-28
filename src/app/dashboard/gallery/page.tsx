"use client";

import { useState, useEffect, useCallback } from "react";
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

const CATEGORIES = ["All", "Hair", "Skin", "Nails", "Lashes", "Brows", "Makeup", "Waxing"];

export default function GalleryPage() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<GalleryItem | null>(null);

  const fetchGallery = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const { data } = await queryData<GalleryItem[]>("gallery.list", { limit: 100 });
      setItems(data || []);
    } finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { fetchGallery(); }, [fetchGallery]);

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
          <p>Upload before & after photos when completing appointments to build your gallery. They&apos;ll appear here automatically!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(item => (
            <div key={item.id} className={styles.galleryCard} onClick={() => setSelected(item)}>
              <div className={styles.photoCompare}>
                <div className={styles.photoSide}>
                  {item.before_photo_urls?.[0] ? (
                    <img src={item.before_photo_urls[0]} alt="Before" />
                  ) : (
                    <span className={styles.noPhoto}>No photo</span>
                  )}
                  <span className={`${styles.photoLabel} ${styles.labelBefore}`}>Before</span>
                </div>
                <div className={styles.photoSide}>
                  {item.after_photo_urls?.[0] ? (
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
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalPhotos}>
                <div className={styles.modalPhotoSide}>
                  {selected.before_photo_urls?.[0] ? (
                    <img src={selected.before_photo_urls[0]} alt="Before" />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>No Before Photo</div>
                  )}
                  <span className={`${styles.photoLabel} ${styles.labelBefore}`}>Before</span>
                </div>
                <div className={styles.modalPhotoSide}>
                  {selected.after_photo_urls?.[0] ? (
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
    </div>
  );
}
