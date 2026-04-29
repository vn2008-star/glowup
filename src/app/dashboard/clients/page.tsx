"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./clients.module.css";
import type { Client, Service, Staff } from "@/lib/types";

/* ── Masking helpers (mirrors API logic for "View as Technician" preview) ── */
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return `(•••) •••-${last4}`;
}
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '•••@•••';
  return `${email[0]}${'•'.repeat(Math.max(at - 1, 2))}${email.slice(at)}`;
}

export default function ClientsPage() {
  const { tenant, currentStaff } = useTenant();
  const t = useTranslations("clientsPage");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({ first_name: "", last_name: "", phone: "", email: "", birthday: "", notes: "", photo_url: "" });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // ── Client Protection ──
  const protectionEnabled = !!(tenant?.settings as Record<string, unknown> | undefined)?.client_protection;
  const [viewAsTechnician, setViewAsTechnician] = useState(false);
  const isOwnerOrManager = currentStaff?.role === 'owner' || currentStaff?.role === 'manager';
  const shouldMask = protectionEnabled && (viewAsTechnician || currentStaff?.role === 'technician');

  // Apply masking to displayed data
  const displayPhone = useCallback((phone: string | null) => shouldMask ? maskPhone(phone) : phone, [shouldMask]);
  const displayEmail = useCallback((email: string | null) => shouldMask ? maskEmail(email) : email, [shouldMask]);

  // Edit profile state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState({ first_name: "", last_name: "", phone: "", email: "", birthday: "", notes: "", photo_url: "" });
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);

  // Import clients state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Book appointment state
  const [showBookModal, setShowBookModal] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [bookData, setBookData] = useState({ service_id: "", staff_id: "", start_time: "", notes: "" });
  const [bookingSaving, setBookingSaving] = useState(false);

  const fetchClients = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<Client[]>("clients.list");
    setClients(data || []);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = clients.filter((c) => {
    const matchesSearch = `${c.first_name} ${c.last_name || ""} ${c.email || ""} ${c.phone || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await queryData<Client>("clients.add", { ...formData, status: "new" });
    if (data) {
      setClients((prev) => [data, ...prev]);
      setShowAddModal(false);
      setFormData({ first_name: "", last_name: "", phone: "", email: "", birthday: "", notes: "", photo_url: "" });
      setPhotoPreview(null);
    }
  }

  // ── Import CSV ──
  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    // Detect delimiter
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.every(v => !v)) continue;
      const row: Record<string, string> = {};
      headers.forEach((h, j) => { row[h] = values[j] || ''; });
      rows.push(row);
    }
    return rows;
  }

  function guessField(headers: string[], targets: string[]): string | null {
    for (const t of targets) {
      const found = headers.find(h => h.includes(t));
      if (found) return found;
    }
    return null;
  }

  function handleImportFile(file: File) {
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      setImportData(rows);
    };
    reader.readAsText(file);
  }

  async function handleImportSubmit() {
    if (!importData.length) return;
    setImportLoading(true);
    const headers = Object.keys(importData[0]);
    const firstNameCol = guessField(headers, ['first_name', 'first name', 'firstname', 'name', 'first']);
    const lastNameCol = guessField(headers, ['last_name', 'last name', 'lastname', 'last', 'surname']);
    const phoneCol = guessField(headers, ['phone', 'phone number', 'mobile', 'cell', 'tel', 'telephone']);
    const emailCol = guessField(headers, ['email', 'e-mail', 'email address']);
    const birthdayCol = guessField(headers, ['birthday', 'birth date', 'birthdate', 'dob', 'date of birth']);
    const notesCol = guessField(headers, ['notes', 'note', 'comments', 'comment']);

    let added = 0;
    let skipped = 0;

    for (const row of importData) {
      let firstName = firstNameCol ? row[firstNameCol] : '';
      let lastName = lastNameCol ? row[lastNameCol] : '';

      // If only a "name" column, split it
      if (firstName && !lastNameCol && firstName.includes(' ')) {
        const parts = firstName.split(' ');
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }

      if (!firstName) { skipped++; continue; }

      const clientPayload = {
        first_name: firstName,
        last_name: lastName || '',
        phone: phoneCol ? row[phoneCol] : '',
        email: emailCol ? row[emailCol] : '',
        birthday: birthdayCol ? row[birthdayCol] : '',
        notes: notesCol ? row[notesCol] : '',
        status: 'active' as const,
      };

      const { data } = await queryData<Client>('clients.add', clientPayload);
      if (data) {
        added++;
        setClients(prev => [data, ...prev]);
      } else {
        skipped++;
      }
    }

    setImportResult({ added, skipped });
    setImportLoading(false);
  }

  async function handleDeleteClient(id: string) {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    await queryData("clients.delete", { id });
    setClients((prev) => prev.filter((c) => c.id !== id));
    setSelectedClient(null);
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} selected client(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    for (const id of selectedIds) {
      await queryData("clients.delete", { id });
    }
    setClients(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
    setSelectedClient(null);
  }

  // ── Edit Profile ──
  function openEditProfile() {
    if (!selectedClient) return;
    setEditData({
      first_name: selectedClient.first_name,
      last_name: selectedClient.last_name || "",
      phone: selectedClient.phone || "",
      email: selectedClient.email || "",
      birthday: selectedClient.birthday || "",
      notes: selectedClient.notes || "",
      photo_url: selectedClient.photo_url || "",
    });
    setEditPhotoPreview(selectedClient.photo_url || null);
    setShowEditModal(true);
  }

  async function handleEditProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient) return;
    const cleanData = {
      ...editData,
      birthday: editData.birthday || null,
    };
    const { data } = await queryData<Client>("clients.update", { id: selectedClient.id, ...cleanData });
    if (data) {
      setClients((prev) => prev.map((c) => c.id === data.id ? data : c));
      setSelectedClient(data);
      setShowEditModal(false);
    }
  }

  // ── Book Appointment ──
  async function openBookAppointment() {
    if (!selectedClient) return;
    // Fetch services + staff for dropdowns
    const [svcRes, staffRes] = await Promise.all([
      queryData<Service[]>("services.list"),
      queryData<Staff[]>("staff.list"),
    ]);
    setServices((svcRes.data || []).filter(s => s.is_active));
    setStaffMembers(staffRes.data || []);
    const today = new Date().toISOString().split("T")[0];
    setBookData({ service_id: "", staff_id: "", start_time: `${today}T09:00`, notes: "" });
    setShowBookModal(true);
  }

  async function handleBookAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient || !bookData.service_id || !bookData.start_time) return;
    setBookingSaving(true);

    const service = services.find(s => s.id === bookData.service_id);
    const start = new Date(bookData.start_time);
    const end = new Date(start.getTime() + (service?.duration_minutes || 60) * 60 * 1000);

    const { data, error } = await queryData("appointments.add", {
      client_id: selectedClient.id,
      service_id: bookData.service_id,
      staff_id: bookData.staff_id || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "confirmed",
      total_price: service?.price || 0,
      notes: bookData.notes || null,
    });

    setBookingSaving(false);

    if (data && !error) {
      setShowBookModal(false);
      alert(`✅ Appointment booked for ${selectedClient.first_name} on ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } else {
      alert("Failed to book appointment. Please try again.");
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>, mode: 'add' | 'edit') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (mode === 'add') {
        setPhotoPreview(result);
        setFormData(prev => ({ ...prev, photo_url: result }));
      } else {
        setEditPhotoPreview(result);
        setEditData(prev => ({ ...prev, photo_url: result }));
      }
    };
    reader.readAsDataURL(file);
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1>{t("title")}</h1>
          <p>{clients.length} total clients</p>
          {protectionEnabled && (
            <span className={styles.protectionBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Client Protection Active
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          {protectionEnabled && isOwnerOrManager && (
            <button
              className={`${styles.techViewBtn} ${viewAsTechnician ? styles.techViewActive : ''}`}
              onClick={() => setViewAsTechnician(!viewAsTechnician)}
              title="Preview what technicians see with masked contact info"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {viewAsTechnician ? 'Exit Technician View' : 'View as Technician'}
            </button>
          )}
          <button className={styles.importBtn} onClick={() => { setShowImportModal(true); setImportData([]); setImportFileName(''); setImportResult(null); }}>📥 Import</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>{t("addClient")}</button>
        </div>
      </div>

      {/* Technician View Banner */}
      {viewAsTechnician && (
        <div className={styles.techBanner}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Viewing as Technician — contact info is masked. <button onClick={() => setViewAsTechnician(false)} className={styles.techBannerLink}>Exit preview</button></span>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarLeft}>
            <input type="checkbox" checked={selectedIds.size === filtered.length} onChange={toggleSelectAll} className={styles.bulkCheckbox} />
            <span>{selectedIds.size} client{selectedIds.size !== 1 ? 's' : ''} selected</span>
          </div>
          <div className={styles.bulkBarRight}>
            <button className={styles.bulkClearBtn} onClick={() => setSelectedIds(new Set())}>Clear Selection</button>
            <button className={styles.bulkDeleteBtn} onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting...' : `🗑️ Delete ${selectedIds.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className={styles.toolbar}>
        <input className={`input ${styles.searchInput}`} placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className={styles.filters}>
          {["all", "active", "new", "at_risk", "inactive"].map((f) => (
            <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.activeFilter : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "at_risk" ? "At Risk" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Client List */}
      {loading ? (
        <div className={styles.loading}>Loading clients...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No clients found</p>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>Add Your First Client</button>
        </div>
      ) : (
        <div className={styles.clientGrid}>
          {filtered.map((c) => (
            <div key={c.id} className={`card ${styles.clientCard} ${selectedIds.has(c.id) ? styles.clientCardSelected : ''}`} onClick={() => setSelectedClient(c)}>
              <div className={styles.clientHeader}>
                <input
                  type="checkbox"
                  className={styles.clientCheckbox}
                  checked={selectedIds.has(c.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                  onClick={(e) => e.stopPropagation()}
                />
                {c.photo_url ? (
                  <img src={c.photo_url} alt="" className={styles.clientAvatarImg} />
                ) : (
                  <div className={styles.clientAvatar}>{c.first_name[0]}{c.last_name?.[0] || ""}</div>
                )}
                <div>
                  <h3>{c.first_name} {c.last_name || ""}</h3>
                  <span className={`badge ${c.status === "active" ? "badge-success" : c.status === "new" ? "badge-info" : c.status === "at_risk" ? "badge-danger" : "badge-warning"}`}>
                    {c.status}
                  </span>
                </div>
              </div>
              <div className={styles.clientMeta}>
                {c.phone && <span>📱 {displayPhone(c.phone)}{shouldMask && <span className={styles.protectedTag}>Protected</span>}</span>}
                {c.email && <span>✉️ {displayEmail(c.email)}{shouldMask && <span className={styles.protectedTag}>Protected</span>}</span>}
              </div>
              <div className={styles.clientStats}>
                <span>{c.visit_count} visits</span>
                <span>${c.lifetime_spend} spent</span>
                <span>{c.loyalty_points} pts</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Client Modal ── */}
      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Add New Client</h2>
            <form onSubmit={handleAddClient}>
              <div className={styles.photoUpload}>
                <label className={styles.photoUploadLabel}>
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className={styles.photoPreviewImg} />
                  ) : (
                    <div className={styles.photoPlaceholder}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      <span>Add Photo</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handlePhotoChange(e, 'add')} hidden />
                </label>
              </div>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className="label">First Name *</label>
                  <input className="input" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Last Name</label>
                  <input className="input" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Phone</label>
                  <input className="input" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Birthday</label>
                  <input className="input" type="date" value={formData.birthday} onChange={(e) => setFormData({ ...formData, birthday: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className="label">Notes</label>
                <textarea className="input" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Client</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Profile Modal ── */}
      {showEditModal && selectedClient && (
        <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Client Profile</h2>
            <form onSubmit={handleEditProfile}>
              <div className={styles.photoUpload}>
                <label className={styles.photoUploadLabel}>
                  {editPhotoPreview ? (
                    <img src={editPhotoPreview} alt="Preview" className={styles.photoPreviewImg} />
                  ) : (
                    <div className={styles.photoPlaceholder}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      <span>Add Photo</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handlePhotoChange(e, 'edit')} hidden />
                </label>
              </div>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className="label">First Name *</label>
                  <input className="input" value={editData.first_name} onChange={(e) => setEditData({ ...editData, first_name: e.target.value })} required />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Last Name</label>
                  <input className="input" value={editData.last_name} onChange={(e) => setEditData({ ...editData, last_name: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Phone</label>
                  <input className="input" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Birthday</label>
                  <input className="input" type="date" value={editData.birthday} onChange={(e) => setEditData({ ...editData, birthday: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className="label">Notes</label>
                <textarea className="input" rows={3} value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Book Appointment Modal ── */}
      {showBookModal && selectedClient && (
        <div className={styles.modalOverlay} onClick={() => setShowBookModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Book Appointment for {selectedClient.first_name}</h2>
            <form onSubmit={handleBookAppointment}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className="label">Service *</label>
                  <select className="input" value={bookData.service_id} onChange={(e) => setBookData({ ...bookData, service_id: e.target.value })} required>
                    <option value="">Select a service...</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price} ({s.duration_minutes} min)</option>)}
                  </select>
                  {services.length === 0 && <small style={{ color: "var(--text-tertiary)" }}>No services found. Add services first in the Services page.</small>}
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Staff Member</label>
                  <select className="input" value={bookData.staff_id} onChange={(e) => setBookData({ ...bookData, staff_id: e.target.value })}>
                    <option value="">Any available</option>
                    {staffMembers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className="label">Date & Time *</label>
                  <input className="input" type="datetime-local" value={bookData.start_time} onChange={(e) => setBookData({ ...bookData, start_time: e.target.value })} required />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={bookData.notes} onChange={(e) => setBookData({ ...bookData, notes: e.target.value })} placeholder="Any special requests..." />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBookModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={bookingSaving}>{bookingSaving ? "Booking..." : "Book Appointment"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────── COMPLETE CLIENT PROFILE DRAWER ────────── */}
      {selectedClient && (
        <div className={styles.profileOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedClient(null); }}>
          <div className={styles.profileDrawer} onClick={(e) => e.stopPropagation()}>
            <button className={styles.profileClose} onClick={() => setSelectedClient(null)}>✕</button>

            {/* Profile Header */}
            <div className={styles.profileHeader}>
              <div className={styles.profileAvatar}>
                {selectedClient.photo_url ? (
                  <img src={selectedClient.photo_url} alt="" className={styles.profileAvatarImg} />
                ) : (
                  <>{selectedClient.first_name[0]}{selectedClient.last_name?.[0] || ""}</>
                )}
              </div>
              <h2 className={styles.profileName}>{selectedClient.first_name} {selectedClient.last_name || ""}</h2>
              <span className={`badge ${selectedClient.status === "active" ? "badge-success" : selectedClient.status === "new" ? "badge-info" : selectedClient.status === "at_risk" ? "badge-danger" : "badge-warning"}`}>
                {selectedClient.status}
              </span>
              <p className={styles.profileSince}>Client since {formatDate(selectedClient.created_at) || "—"}</p>
            </div>

            {/* KPI Strip */}
            <div className={styles.profileKpis}>
              <div className={styles.profileKpi}>
                <span className={styles.kpiValue}>{selectedClient.visit_count}</span>
                <span className={styles.kpiLabel}>Total Visits</span>
              </div>
              <div className={styles.profileKpi}>
                <span className={styles.kpiValue}>${selectedClient.lifetime_spend}</span>
                <span className={styles.kpiLabel}>Lifetime Spend</span>
              </div>
              <div className={styles.profileKpi}>
                <span className={styles.kpiValue}>{selectedClient.loyalty_points}</span>
                <span className={styles.kpiLabel}>Loyalty Points</span>
              </div>
            </div>

            {/* Contact Info */}
            <div className={styles.profileSection}>
              <h3 className={styles.sectionTitle}>Contact Information</h3>
              <div className={styles.infoGrid}>
                <div className={`${styles.infoItem} ${shouldMask ? styles.infoItemMasked : ''}`}>
                  <span className={styles.infoIcon}>📱</span>
                  <div>
                    <span className={styles.infoLabel}>Phone {shouldMask && <span className={styles.protectedTagSmall}>🛡️</span>}</span>
                    <span className={styles.infoValue}>{displayPhone(selectedClient.phone) || "Not provided"}</span>
                  </div>
                </div>
                <div className={`${styles.infoItem} ${shouldMask ? styles.infoItemMasked : ''}`}>
                  <span className={styles.infoIcon}>✉️</span>
                  <div>
                    <span className={styles.infoLabel}>Email {shouldMask && <span className={styles.protectedTagSmall}>🛡️</span>}</span>
                    <span className={styles.infoValue}>{displayEmail(selectedClient.email) || "Not provided"}</span>
                  </div>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>🎂</span>
                  <div>
                    <span className={styles.infoLabel}>Birthday</span>
                    <span className={styles.infoValue}>{formatDate(selectedClient.birthday) || "Not provided"}</span>
                  </div>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoIcon}>📅</span>
                  <div>
                    <span className={styles.infoLabel}>Last Visit</span>
                    <span className={styles.infoValue}>{formatDate(selectedClient.last_visit) || "No visits yet"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Preferences & Notes */}
            <div className={styles.profileSection}>
              <h3 className={styles.sectionTitle}>Preferences & Notes</h3>
              {selectedClient.notes ? (
                <div className={styles.notesBox}>{selectedClient.notes}</div>
              ) : (
                <div className={styles.emptyNote}>No notes added yet</div>
              )}
            </div>

            {/* Allergies / Warnings */}
            {selectedClient.allergies && selectedClient.allergies.length > 0 && (
              <div className={styles.profileSection}>
                <h3 className={styles.sectionTitle}>⚠️ Allergies & Sensitivities</h3>
                <div className={styles.tagList}>
                  {selectedClient.allergies.map((a) => (
                    <span key={a} className={styles.allergyTag}>{a}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {selectedClient.tags && selectedClient.tags.length > 0 && (
              <div className={styles.profileSection}>
                <h3 className={styles.sectionTitle}>Tags</h3>
                <div className={styles.tagList}>
                  {selectedClient.tags.map((t) => (
                    <span key={t} className="badge badge-primary">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Service History Placeholder */}
            <div className={styles.profileSection}>
              <h3 className={styles.sectionTitle}>Service History</h3>
              <div className={styles.emptyNote}>
                Service history will appear here as appointments are completed.
              </div>
            </div>

            {/* Actions — WIRED */}
            <div className={styles.profileActions}>
              <button className="btn btn-primary" onClick={openBookAppointment}>📅 Book</button>
              <button className="btn btn-secondary" onClick={openEditProfile}>✏️ Edit</button>
              <button className="btn btn-danger" onClick={() => handleDeleteClient(selectedClient.id)}>🗑️ Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Clients Modal ── */}
      {showImportModal && (
        <div className={styles.modalOverlay} onClick={() => setShowImportModal(false)}>
          <div className={styles.importModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>📥 Import Clients</h2>
              <button className={styles.modalClose} onClick={() => setShowImportModal(false)}>✕</button>
            </div>

            {!importData.length && !importResult ? (
              <div className={styles.importUploadArea}>
                <div
                  className={styles.importDropZone}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.dragOver); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove(styles.dragOver); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove(styles.dragOver);
                    const file = e.dataTransfer.files[0];
                    if (file) handleImportFile(file);
                  }}
                >
                  <div className={styles.importIcon}>📄</div>
                  <p className={styles.importDropText}>Drag & drop a CSV file here</p>
                  <p className={styles.importDropSubtext}>or</p>
                  <label className={styles.importBrowseBtn}>
                    Browse Files
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportFile(file);
                      }}
                    />
                  </label>
                </div>
                <div className={styles.importFormatHelp}>
                  <h4>Supported Format</h4>
                  <p>CSV with columns like: <strong>Name, Phone, Email, Birthday, Notes</strong></p>
                  <p>Column names are auto-detected. Export from your phone contacts or any spreadsheet app.</p>
                  <div className={styles.importExample}>
                    <code>Name,Phone,Email,Birthday{"\n"}Jane Smith,(415) 555-1234,jane@email.com,1990-05-15{"\n"}Maria Garcia,(916) 555-5678,maria@email.com,</code>
                  </div>
                </div>
              </div>
            ) : importResult ? (
              <div className={styles.importResultArea}>
                <div className={styles.importResultIcon}>✅</div>
                <h3>Import Complete!</h3>
                <div className={styles.importResultStats}>
                  <div className={styles.importStat}>
                    <span className={styles.importStatNum}>{importResult.added}</span>
                    <span>clients added</span>
                  </div>
                  {importResult.skipped > 0 && (
                    <div className={styles.importStat}>
                      <span className={styles.importStatNum}>{importResult.skipped}</span>
                      <span>skipped</span>
                    </div>
                  )}
                </div>
                <button className="btn btn-primary" onClick={() => setShowImportModal(false)}>Done</button>
              </div>
            ) : (
              <div className={styles.importPreviewArea}>
                <p className={styles.importPreviewInfo}>
                  📎 <strong>{importFileName}</strong> — {importData.length} client{importData.length !== 1 ? 's' : ''} found
                </p>
                <div className={styles.importPreviewTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        {Object.keys(importData[0]).slice(0, 5).map(h => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {importData.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          {Object.keys(importData[0]).slice(0, 5).map(h => <td key={h}>{row[h]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importData.length > 5 && <p className={styles.importMoreText}>...and {importData.length - 5} more</p>}
                </div>
                <div className={styles.importActions}>
                  <button className="btn btn-secondary" onClick={() => { setImportData([]); setImportFileName(''); }}>← Choose Another File</button>
                  <button className="btn btn-primary" onClick={handleImportSubmit} disabled={importLoading}>
                    {importLoading ? 'Importing...' : `Import ${importData.length} Clients`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
