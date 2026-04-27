"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./services.module.css";
import type { Service } from "@/lib/types";

export default function ServicesPage() {
  const { tenant } = useTenant();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState({
    name: "", category: "Nails", duration_minutes: 60, price: 0, description: "", is_active: true, image_url: "" as string,
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setFormData({ name: "", category: "Nails", duration_minutes: 60, price: 0, description: "", is_active: true, image_url: "" });
    setShowModal(true);
  };

  const openEdit = (s: Service) => {
    setEditingService(s);
    setFormData({
      name: s.name, category: s.category, duration_minutes: s.duration_minutes,
      price: s.price, description: s.description || "", is_active: s.is_active, image_url: s.image_url || "",
    });
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

    const payload = {
      ...formData,
      image_url: formData.image_url || null,
    };

    if (editingService) {
      const { data } = await queryData<Service>("services.update", { id: editingService.id, ...payload });
      if (data) setServices(prev => prev.map(s => s.id === data.id ? data : s));
    } else {
      const { data } = await queryData<Service>("services.add", payload);
      if (data) setServices(prev => [...prev, data]);
    }
    setShowModal(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this service?")) return;
    await queryData("services.delete", { id });
    setServices(prev => prev.filter(s => s.id !== id));
  }

  const activeServices = services.filter(s => s.is_active);
  const inactiveServices = services.filter(s => !s.is_active);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Service Menu</h1>
          <p>{activeServices.length} active services · {inactiveServices.length} inactive</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add Service</button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading services...</div>
      ) : services.length === 0 ? (
        <div className={styles.empty}>
          <p>No services yet</p>
          <button className="btn btn-primary" onClick={openNew}>Add Your First Service</button>
        </div>
      ) : (
        <div className={styles.serviceGrid}>
          {services.map((s) => (
            <div key={s.id} className={`${styles.serviceCard} ${!s.is_active ? styles.inactive : ""}`}>
              {/* Service Image */}
              {s.image_url && (
                <div className={styles.serviceImage}>
                  <img src={s.image_url} alt={s.name} />
                </div>
              )}
              <div className={styles.serviceCardBody}>
                <div className={styles.serviceCardHeader}>
                  <div className={styles.serviceCategory}>
                    <span className="badge badge-primary">{s.category}</span>
                    {!s.is_active && <span className="badge badge-warning">Inactive</span>}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button className="btn btn-icon btn-ghost" onClick={() => openEdit(s)} title="Edit">✏️</button>
                    <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(s.id)} title="Delete">🗑️</button>
                  </div>
                </div>
                <h3 className={styles.serviceName}>{s.name}</h3>
                <p className={styles.serviceDesc}>{s.description}</p>
                <div className={styles.serviceMeta}>
                  <span className={styles.servicePrice}>${s.price}</span>
                  <span className={styles.serviceDuration}>{s.duration_minutes} min</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
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
                    <option>Nails</option><option>Lashes</option><option>Hair</option><option>Facial</option><option>Waxing</option><option>Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Price ($)</label>
                  <input className="input" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })} required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Duration (minutes)</label>
                  <input className="input" type="number" value={formData.duration_minutes} onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })} />
                </div>
                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                  <label className="label">Description</label>
                  <textarea className="input" rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
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
    </div>
  );
}
