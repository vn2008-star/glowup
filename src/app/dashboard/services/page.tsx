"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./services.module.css";
import type { Service } from "@/lib/types";
import { SERVICE_CATEGORIES, type ServiceTemplate, type ServiceCategory } from "./service-catalog";

/* ─── All category labels for dropdown ─── */
const CATEGORY_OPTIONS = SERVICE_CATEGORIES.map((c) => c.label);

export default function ServicesPage() {
  const { tenant } = useTenant();
  const t = useTranslations("servicesPage");
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [catalogCategory, setCatalogCategory] = useState<ServiceCategory>(SERVICE_CATEGORIES[0]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: "", category: CATEGORY_OPTIONS[0], duration_minutes: 60, price: 0, description: "", is_active: true, image_url: "" as string,
    price_addons: [] as { label: string; price: number }[],
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Drag & Drop state ─── */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<Service[]>("services.list");
    setServices(data || []);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const openNew = () => {
    setEditingService(null);
    setFormData({ name: "", category: CATEGORY_OPTIONS[0], duration_minutes: 60, price: 0, description: "", is_active: true, image_url: "", price_addons: [] });
    setShowModal(true);
  };

  const openEdit = (s: Service) => {
    setEditingService(s);
    setFormData({
      name: s.name, category: s.category, duration_minutes: s.duration_minutes,
      price: s.price, description: s.description || "", is_active: s.is_active, image_url: s.image_url || "",
      price_addons: s.price_addons || [],
    });
    setShowModal(true);
  };

  const openFromTemplate = (tpl: ServiceTemplate) => {
    setEditingService(null);
    setFormData({
      name: tpl.name, category: tpl.category, duration_minutes: tpl.duration_minutes,
      price: tpl.price, description: tpl.description, is_active: true, image_url: "",
      price_addons: [],
    });
    setShowCatalog(false);
    setShowModal(true);
  };

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'services');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setFormData(prev => ({ ...prev, image_url: url }));
      } else {
        const err = await res.json();
        alert(`Upload failed: ${err.error}`);
      }
    } catch {
      alert('Upload failed. Please try again.');
    }
    setUploading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || !formData.price) return;

    // Filter out empty add-on rows
    const validAddons = formData.price_addons.filter(a => a.label.trim() && a.price > 0);

    const payload = {
      ...formData,
      image_url: formData.image_url || null,
      price_addons: validAddons.length > 0 ? validAddons : null,
    };

    if (editingService) {
      const { data, error } = await queryData<Service>("services.update", { id: editingService.id, ...payload });
      if (error) { console.error('Update error:', error); alert('Save failed: ' + error); return; }
      if (data) setServices(prev => prev.map(s => s.id === data.id ? data : s));
    } else {
      const { data, error } = await queryData<Service>("services.add", payload);
      if (error) { console.error('Add error:', error); alert('Save failed: ' + error); return; }
      if (data) setServices(prev => [...prev, data]);
    }
    setShowModal(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this service?")) return;
    await queryData("services.delete", { id });
    setServices(prev => prev.filter(s => s.id !== id));
  }

  function toggleTemplate(idx: number) {
    setSelectedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function selectAllTemplates() {
    if (selectedTemplates.size === catalogCategory.templates.length) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(new Set(catalogCategory.templates.map((_, i) => i)));
    }
  }

  async function handleBulkAdd() {
    if (selectedTemplates.size === 0) return;
    setBulkAdding(true);

    const templatesToAdd = catalogCategory.templates.filter((_, i) => selectedTemplates.has(i));

    for (const tpl of templatesToAdd) {
      const payload = {
        name: tpl.name,
        category: tpl.category,
        duration_minutes: tpl.duration_minutes,
        price: tpl.price,
        description: tpl.description,
        is_active: true,
        image_url: null,
      };
      const { data } = await queryData<Service>("services.add", payload);
      if (data) setServices(prev => [...prev, data]);
    }

    setBulkAdding(false);
    setSelectedTemplates(new Set());
    setShowCatalog(false);
  }

  /* ─── Drag & Drop handlers ─── */
  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  async function handleDrop(targetId: string, categoryServices: Service[]) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const fromIdx = categoryServices.findIndex(s => s.id === dragId);
    const toIdx = categoryServices.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }

    // Reorder the array
    const reordered = [...categoryServices];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Build sort_order updates
    const items = reordered.map((s, i) => ({ id: s.id, sort_order: i }));

    // Optimistic update
    setServices(prev => {
      const updated = [...prev];
      for (const item of items) {
        const idx = updated.findIndex(s => s.id === item.id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: item.sort_order };
      }
      return updated.sort((a, b) => a.sort_order - b.sort_order);
    });

    setDragId(null);
    setDragOverId(null);

    // Persist to DB
    await queryData("services.reorder", { items });
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  /* ─── Category reorder ─── */
  async function moveCategory(cat: string, direction: 'up' | 'down') {
    const catIdx = categoriesInUse.indexOf(cat);
    const swapIdx = direction === 'up' ? catIdx - 1 : catIdx + 1;
    if (swapIdx < 0 || swapIdx >= categoriesInUse.length) return;

    // Rebuild sort_order: put categories in new order, assign incrementing sort_order
    const newOrder = [...categoriesInUse];
    [newOrder[catIdx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[catIdx]];

    const items: { id: string; sort_order: number }[] = [];
    let order = 0;
    for (const c of newOrder) {
      const catServices = services.filter(s => s.category === c);
      for (const s of catServices) {
        items.push({ id: s.id, sort_order: order++ });
      }
    }

    // Optimistic update
    setServices(prev => {
      const updated = [...prev];
      for (const item of items) {
        const idx = updated.findIndex(s => s.id === item.id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: item.sort_order };
      }
      return updated.sort((a, b) => a.sort_order - b.sort_order);
    });

    await queryData("services.reorder", { items });
  }

  /* ─── Derived state ─── */
  const activeServices = services.filter(s => s.is_active);
  const inactiveServices = services.filter(s => !s.is_active);

  /* Group services by category */
  const categoriesInUse = [...new Set(services.map(s => s.category))];

  const filteredServices = activeFilter === "all"
    ? services
    : activeFilter === "inactive"
    ? inactiveServices
    : services.filter(s => s.category === activeFilter);

  /* Get matching category color */
  const getCategoryColor = (label: string) => {
    const cat = SERVICE_CATEGORIES.find(c => c.label === label);
    return cat?.color || "#C37EDA";
  };

  const getCategoryIcon = (label: string) => {
    const cat = SERVICE_CATEGORIES.find(c => c.label === label);
    return cat?.icon || "✦";
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{t("title")}</h1>
          <p>{activeServices.length} active services · {inactiveServices.length} inactive · {categoriesInUse.length} categories</p>
        </div>
        <div className={styles.headerActions}>
          <button className="btn btn-secondary" onClick={() => { setShowCatalog(true); setCatalogCategory(SERVICE_CATEGORIES[0]); setSelectedTemplates(new Set()); }}>
            📋 Browse Templates
          </button>
          <button className="btn btn-primary" onClick={openNew}>{t("addService")}</button>
        </div>
      </div>

      {/* ── Category Filter Tabs ── */}
      <div className={styles.filterBar}>
        <button
          className={`${styles.filterTab} ${activeFilter === "all" ? styles.filterTabActive : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          All ({services.length})
        </button>
        {categoriesInUse.map((cat) => (
          <button
            key={cat}
            className={`${styles.filterTab} ${activeFilter === cat ? styles.filterTabActive : ""}`}
            onClick={() => setActiveFilter(cat)}
          >
            <span className={styles.filterDot} style={{ background: getCategoryColor(cat) }} />
            {cat} ({services.filter(s => s.category === cat).length})
          </button>
        ))}
        {inactiveServices.length > 0 && (
          <button
            className={`${styles.filterTab} ${activeFilter === "inactive" ? styles.filterTabActive : ""}`}
            onClick={() => setActiveFilter("inactive")}
          >
            Inactive ({inactiveServices.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>Loading services...</div>
      ) : services.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>✦</div>
          <h2>Build Your {t("title")}</h2>
          <p>Choose from our curated templates organized by specialty, or create your own from scratch.</p>
          <div className={styles.emptyActions}>
            <button className="btn btn-primary btn-lg" onClick={() => { setShowCatalog(true); setCatalogCategory(SERVICE_CATEGORIES[0]); setSelectedTemplates(new Set()); }}>
              📋 Browse Service Templates
            </button>
            <button className="btn btn-secondary btn-lg" onClick={openNew}>+ Create Custom Service</button>
          </div>

          {/* Quick-start category cards */}
          <div className={styles.quickStartGrid}>
            {SERVICE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={styles.quickStartCard}
                onClick={() => { setCatalogCategory(cat); setSelectedTemplates(new Set()); setShowCatalog(true); }}
              >
                <span className={styles.quickStartIcon} style={{ background: `${cat.color}18`, color: cat.color }}>{cat.icon}</span>
                <span className={styles.quickStartLabel}>{cat.label}</span>
                <span className={styles.quickStartCount}>{cat.templates.length} services</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {services.length > 1 && (
            <p className={styles.reorderHint}>⇅ Drag services to reorder how they appear to clients</p>
          )}

          {/* Category section headers when showing "All" */}
          {activeFilter === "all" ? (
            categoriesInUse.map((cat, catIndex) => {
              const catServices = services.filter(s => s.category === cat);
              return (
                <div key={cat} className={styles.categorySection}>
                  <div className={styles.categorySectionHeader}>
                    <div className={styles.categorySectionTitle}>
                      <span className={styles.categorySectionIcon} style={{ background: `${getCategoryColor(cat)}18`, color: getCategoryColor(cat) }}>
                        {getCategoryIcon(cat)}
                      </span>
                      <h2>{cat}</h2>
                      <span className={styles.categorySectionCount}>{catServices.length} service{catServices.length !== 1 ? "s" : ""}</span>
                    </div>
                    {categoriesInUse.length > 1 && (
                      <div className={styles.categoryReorderBtns}>
                        <button
                          className={styles.categoryArrowBtn}
                          disabled={catIndex === 0}
                          onClick={() => moveCategory(cat, 'up')}
                          title="Move category up"
                        >▲</button>
                        <button
                          className={styles.categoryArrowBtn}
                          disabled={catIndex === categoriesInUse.length - 1}
                          onClick={() => moveCategory(cat, 'down')}
                          title="Move category down"
                        >▼</button>
                      </div>
                    )}
                  </div>
                  <div className={styles.serviceGrid}>
                    {catServices.map((s) => (
                      <ServiceCard
                        key={s.id} s={s}
                        getCategoryColor={getCategoryColor}
                        openEdit={openEdit}
                        handleDelete={handleDelete}
                        isDragging={dragId === s.id}
                        isDragOver={dragOverId === s.id}
                        onDragStart={() => handleDragStart(s.id)}
                        onDragOver={(e) => handleDragOver(e, s.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={() => handleDrop(s.id, catServices)}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.serviceGrid}>
              {filteredServices.map((s) => (
                <ServiceCard
                  key={s.id} s={s}
                  getCategoryColor={getCategoryColor}
                  openEdit={openEdit}
                  handleDelete={handleDelete}
                  isDragging={dragId === s.id}
                  isDragOver={dragOverId === s.id}
                  onDragStart={() => handleDragStart(s.id)}
                  onDragOver={(e) => handleDragOver(e, s.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(s.id, filteredServices)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ Add/Edit Modal ═══ */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{editingService ? "Edit Service" : "Add New Service"}</h2>
            <form onSubmit={handleSave}>
              {/* Image Upload */}
              <div className={styles.imageUploadSection}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
                />
                {formData.image_url ? (
                  <div className={styles.imagePreview}>
                    <img src={formData.image_url} alt="Service" />
                    <div className={styles.imageOverlay}>
                      <button type="button" className={styles.imageChangeBtn} onClick={() => fileInputRef.current?.click()}>
                        Change Photo
                      </button>
                      <button type="button" className={styles.imageRemoveBtn} onClick={() => setFormData(prev => ({ ...prev, image_url: "" }))}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.imageDropzone}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <span className={styles.uploadingText}>Uploading...</span>
                    ) : (
                      <>
                        <span className={styles.uploadIcon}>📷</span>
                        <span className={styles.uploadLabel}>Add Photo</span>
                        <span className={styles.uploadHint}>JPG, PNG up to 5MB</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className="label">Service Name</label>
                  <input className="input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Full Set Acrylic" required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Category</label>
                  <select className="input" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Price ($)</label>
                  <input className="input" type="number" value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Duration (minutes)</label>
                  <input className="input" type="number" value={formData.duration_minutes || ''} onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })} />
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className="label">Description</label>
                  <textarea className="input" rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>

                {/* Price Add-ons */}
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className="label">Price Add-Ons <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional surcharges)</span></label>
                  <div className={styles.addonsList}>
                    {formData.price_addons.map((addon, i) => (
                      <div key={i} className={styles.addonRow}>
                        <input
                          className="input"
                          placeholder="e.g., Dense hair surcharge"
                          value={addon.label}
                          onChange={(e) => {
                            const updated = [...formData.price_addons];
                            updated[i] = { ...updated[i], label: e.target.value };
                            setFormData({ ...formData, price_addons: updated });
                          }}
                        />
                        <div className={styles.addonPriceWrap}>
                          <span className={styles.addonPlus}>+$</span>
                          <input
                            className="input"
                            type="number"
                            placeholder="0"
                            value={addon.price}
                            onChange={(e) => {
                              const updated = [...formData.price_addons];
                              updated[i] = { ...updated[i], price: Number(e.target.value) };
                              setFormData({ ...formData, price_addons: updated });
                            }}
                            style={{ width: 80 }}
                          />
                        </div>
                        <button
                          type="button"
                          className={styles.addonRemoveBtn}
                          onClick={() => {
                            const updated = formData.price_addons.filter((_, j) => j !== i);
                            setFormData({ ...formData, price_addons: updated });
                          }}
                        >✕</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.addonAddBtn}
                      onClick={() => setFormData({ ...formData, price_addons: [...formData.price_addons, { label: '', price: 0 }] })}
                    >
                      + Add surcharge tier
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.toggleLabel}>
                    <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                    <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                    Active on booking page
                  </label>
                </div>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingService ? "Save Changes" : "Add Service"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Template Catalog Modal ═══ */}
      {showCatalog && (
        <div className={styles.modalOverlay} onClick={() => setShowCatalog(false)}>
          <div className={`${styles.modal} ${styles.catalogModal}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.catalogHeader}>
              <div>
                <h2>Service Templates</h2>
                <p>Choose services to add to your menu — customize pricing after import.</p>
              </div>
              <button className={styles.catalogClose} onClick={() => setShowCatalog(false)}>✕</button>
            </div>

            {/* Category sidebar + templates */}
            <div className={styles.catalogLayout}>
              <nav className={styles.catalogNav}>
                {SERVICE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className={`${styles.catalogNavItem} ${catalogCategory.id === cat.id ? styles.catalogNavActive : ""}`}
                    onClick={() => { setCatalogCategory(cat); setSelectedTemplates(new Set()); }}
                  >
                    <span className={styles.catalogNavIcon} style={{ background: `${cat.color}18`, color: cat.color }}>{cat.icon}</span>
                    <div className={styles.catalogNavText}>
                      <span className={styles.catalogNavLabel}>{cat.label}</span>
                      <span className={styles.catalogNavCount}>{cat.templates.length} services</span>
                    </div>
                  </button>
                ))}
              </nav>

              <div className={styles.catalogContent}>
                <div className={styles.catalogContentHeader}>
                  <div className={styles.catalogCategoryInfo}>
                    <span className={styles.catalogCategoryIcon} style={{ background: `${catalogCategory.color}18`, color: catalogCategory.color }}>{catalogCategory.icon}</span>
                    <div>
                      <h3>{catalogCategory.label}</h3>
                      <p>{catalogCategory.description}</p>
                    </div>
                  </div>
                  <button className={styles.selectAllBtn} onClick={selectAllTemplates}>
                    {selectedTemplates.size === catalogCategory.templates.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <div className={styles.templateList}>
                  {catalogCategory.templates.map((tpl, idx) => {
                    const isSelected = selectedTemplates.has(idx);
                    const alreadyExists = services.some(s => s.name === tpl.name && s.category === tpl.category);

                    return (
                      <div
                        key={idx}
                        className={`${styles.templateRow} ${isSelected ? styles.templateRowSelected : ""} ${alreadyExists ? styles.templateRowExists : ""}`}
                        onClick={() => !alreadyExists && toggleTemplate(idx)}
                      >
                        <div className={styles.templateCheckbox}>
                          {alreadyExists ? (
                            <span className={styles.templateExistsBadge}>✓ Added</span>
                          ) : (
                            <span className={`${styles.templateCheck} ${isSelected ? styles.templateChecked : ""}`}>
                              {isSelected && "✓"}
                            </span>
                          )}
                        </div>
                        <div className={styles.templateInfo}>
                          <div className={styles.templateName}>{tpl.name}</div>
                          <div className={styles.templateDesc}>{tpl.description}</div>
                        </div>
                        <div className={styles.templateMeta}>
                          <span className={styles.templatePrice}>${tpl.price}</span>
                          <span className={styles.templateDuration}>{tpl.duration_minutes} min</span>
                        </div>
                        {!alreadyExists && (
                          <button
                            className={styles.templateAddSingle}
                            onClick={(e) => { e.stopPropagation(); openFromTemplate(tpl); }}
                            title="Customize & add"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bulk add footer */}
                {selectedTemplates.size > 0 && (
                  <div className={styles.catalogFooter}>
                    <span>{selectedTemplates.size} service{selectedTemplates.size !== 1 ? "s" : ""} selected</span>
                    <button className="btn btn-primary" onClick={handleBulkAdd} disabled={bulkAdding}>
                      {bulkAdding ? "Adding..." : `Add ${selectedTemplates.size} Service${selectedTemplates.size !== 1 ? "s" : ""}`}
                    </button>
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

/* ─── Service Card sub-component ─── */
function ServiceCard({ s, getCategoryColor, openEdit, handleDelete, isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: {
  s: Service;
  getCategoryColor: (label: string) => string;
  openEdit: (s: Service) => void;
  handleDelete: (id: string) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`${styles.serviceCard} ${!s.is_active ? styles.inactive : ""} ${isDragging ? styles.dragging : ""} ${isDragOver ? styles.dragOver : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.dragHandle} title="Drag to reorder">⠿</div>
      {s.image_url && (
        <div className={styles.serviceImage}>
          <img src={s.image_url} alt={s.name} />
        </div>
      )}
      <div className={styles.serviceCardBody}>
        <div className={styles.serviceCardHeader}>
          <div className={styles.serviceCategory}>
            <span className={styles.categoryBadge} style={{ background: `${getCategoryColor(s.category)}18`, color: getCategoryColor(s.category), borderColor: `${getCategoryColor(s.category)}40` }}>
              {s.category}
            </span>
            {!s.is_active && <span className="badge badge-warning">Inactive</span>}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <button className="btn btn-icon btn-ghost" onClick={() => openEdit(s)} title="Edit">✏️</button>
            <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(s.id)} title="Delete">🗑️</button>
          </div>
        </div>
        <h3 className={styles.serviceName}>{s.name}</h3>
        <p className={styles.serviceDesc}>{s.description}</p>
        {s.price_addons && s.price_addons.length > 0 && (
          <div className={styles.addonPills}>
            {s.price_addons.map((a, i) => (
              <span key={i} className={styles.addonPill}>+${a.price} {a.label}</span>
            ))}
          </div>
        )}
        <div className={styles.serviceMeta}>
          <span className={styles.servicePrice}>${s.price}{s.price_addons && s.price_addons.length > 0 ? '+' : ''}</span>
          <span className={styles.serviceDuration}>{s.duration_minutes} min</span>
        </div>
      </div>
    </div>
  );
}
