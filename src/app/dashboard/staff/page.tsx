"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./staff.module.css";
import type { Staff } from "@/lib/types";
import { PROFESSIONAL_TYPES, getProfessionalType } from "./staff-specialties";
import StaffAgreement from "./StaffAgreement";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

import { formatPhone } from "@/lib/utils";

export default function StaffPage() {
  const { tenant } = useTenant();
  const t = useTranslations("staffPage");
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", role: "technician" as string,
    professional_title: PROFESSIONAL_TYPES[0].title,
    specialties: [] as string[], commission_rate: 0, is_active: true, photo_url: "", pin: "",
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Schedule editor state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleData, setScheduleData] = useState<Record<string, { open: string; close: string; off: boolean; useSlots?: boolean; slots?: { start: string; end: string }[] }>>({}); 

  const [agreementStaff, setAgreementStaff] = useState<Staff | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await queryData<Staff[]>("staff.list");
    setStaffMembers(data || []);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  /* Derive professional title from specialties for existing staff */
  function inferProfessionalTitle(s: Staff): string {
    // Check if specialties match any professional type
    for (const pt of PROFESSIONAL_TYPES) {
      const overlap = (s.specialties || []).filter(sp => pt.specialties.includes(sp));
      if (overlap.length > 0) return pt.title;
    }
    return PROFESSIONAL_TYPES[0].title;
  }

  function openNew() {
    setEditingStaff(null);
    setFormData({
      name: "", email: "", phone: "", role: "technician",
      professional_title: PROFESSIONAL_TYPES[0].title,
      specialties: [], commission_rate: 0, is_active: true, photo_url: "", pin: "",
    });
    setPhotoPreview(null);
    setShowModal(true);
  }

  function openEdit(s: Staff) {
    setEditingStaff(s);
    setFormData({
      name: s.name,
      email: s.email || "",
      phone: s.phone || "",
      role: s.role,
      professional_title: inferProfessionalTitle(s),
      specialties: s.specialties || [],
      commission_rate: s.commission_rate,
      is_active: s.is_active,
      photo_url: s.photo_url || "",
      pin: s.pin || "",
    });
    setPhotoPreview(s.photo_url || null);
    setShowModal(true);
  }

  function openSchedule(s: Staff) {
    setSelectedStaff(s);
    const sched = (s.schedule || {}) as Record<string, { open: string; close: string; off: boolean; useSlots?: boolean; slots?: { start: string; end: string }[] }>;
    const filled: Record<string, { open: string; close: string; off: boolean; useSlots?: boolean; slots?: { start: string; end: string }[] }> = {};
    DAYS.forEach((d) => {
      const existing = sched[d];
      filled[d] = existing
        ? { open: existing.open || "09:00", close: existing.close || "18:00", off: !!existing.off, useSlots: !!existing.useSlots, slots: existing.slots || [] }
        : { open: "09:00", close: "18:00", off: d === "Sunday", useSlots: false, slots: [] };
    });
    setScheduleData(filled);
    setShowScheduleModal(true);
  }

  function addSlot(day: string) {
    setScheduleData((prev) => {
      const dayData = prev[day];
      const slots = dayData.slots || [];
      // Default new slot: start after last slot's end, or day open time
      const lastEnd = slots.length > 0 ? slots[slots.length - 1].end : dayData.open;
      const [h, m] = lastEnd.split(':').map(Number);
      const endMinutes = Math.min(h * 60 + m + 90, 23 * 60 + 30); // +1.5h
      const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
      const endM = String(endMinutes % 60).padStart(2, '0');
      return {
        ...prev,
        [day]: { ...dayData, slots: [...slots, { start: lastEnd, end: `${endH}:${endM}` }] },
      };
    });
  }

  function updateSlot(day: string, index: number, field: 'start' | 'end', value: string) {
    setScheduleData((prev) => {
      const dayData = prev[day];
      const slots = [...(dayData.slots || [])];
      slots[index] = { ...slots[index], [field]: value };
      return { ...prev, [day]: { ...dayData, slots } };
    });
  }

  function removeSlot(day: string, index: number) {
    setScheduleData((prev) => {
      const dayData = prev[day];
      const slots = (dayData.slots || []).filter((_, i) => i !== index);
      return { ...prev, [day]: { ...dayData, slots } };
    });
  }

  function toggleSlotMode(day: string) {
    setScheduleData((prev) => {
      const dayData = prev[day];
      return { ...prev, [day]: { ...dayData, useSlots: !dayData.useSlots } };
    });
  }

  function copySlots(fromDay: string) {
    setScheduleData((prev) => {
      const source = prev[fromDay];
      const updated = { ...prev };
      DAYS.forEach((d) => {
        if (d !== fromDay && !prev[d].off) {
          updated[d] = { ...prev[d], useSlots: source.useSlots, slots: source.slots ? [...source.slots.map(s => ({ ...s }))] : [] };
        }
      });
      return updated;
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhotoPreview(result);
      setFormData(prev => ({ ...prev, photo_url: result }));
    };
    reader.readAsDataURL(file);
  }

  function toggleSpecialty(sp: string) {
    setFormData(prev => {
      const current = prev.specialties;
      const next = current.includes(sp)
        ? current.filter(s => s !== sp)
        : [...current, sp];
      return { ...prev, specialties: next };
    });
  }

  function handleProfessionalTitleChange(title: string) {
    setFormData(prev => ({
      ...prev,
      professional_title: title,
      specialties: [], // reset specialties when type changes
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Prepend the professional title to specialties for storage
    const allSpecialties = [formData.professional_title, ...formData.specialties];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      role: formData.role,
      specialties: allSpecialties,
      commission_rate: formData.commission_rate,
      is_active: formData.is_active,
      pin: formData.pin || null,
    };

    // Only include photo_url if present (column may not exist yet)
    if (formData.photo_url) {
      payload.photo_url = formData.photo_url;
    }

    if (editingStaff) {
      const { data, error } = await queryData<Staff>("staff.update", { id: editingStaff.id, ...payload });
      if (error) {
        // Retry without photo_url if column doesn't exist
        if (error.includes("photo_url")) {
          delete payload.photo_url;
          const retry = await queryData<Staff>("staff.update", { id: editingStaff.id, ...payload });
          if (retry.error) { alert(`Error updating staff: ${retry.error}`); return; }
          if (retry.data) {
            setStaffMembers((prev) => prev.map((s) => (s.id === retry.data!.id ? retry.data! : s)));
            if (selectedStaff?.id === retry.data.id) setSelectedStaff(retry.data);
          }
        } else {
          alert(`Error updating staff: ${error}`); return;
        }
      } else if (data) {
        setStaffMembers((prev) => prev.map((s) => (s.id === data.id ? data : s)));
        if (selectedStaff?.id === data.id) setSelectedStaff(data);
      }
    } else {
      const { data, error } = await queryData<Staff>("staff.add", payload);
      if (error) {
        // Retry without photo_url if column doesn't exist
        if (error.includes("photo_url")) {
          delete payload.photo_url;
          const retry = await queryData<Staff>("staff.add", payload);
          if (retry.error) { alert(`Error adding staff: ${retry.error}`); return; }
          if (retry.data) setStaffMembers((prev) => [...prev, retry.data!]);
        } else {
          alert(`Error adding staff: ${error}`); return;
        }
      } else if (data) {
        setStaffMembers((prev) => [...prev, data]);
      }
    }
    setShowModal(false);
    setPhotoPreview(null);
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    const { error } = await queryData("staff.delete", { id });
    if (error) {
      if (error.includes("foreign key") || error.includes("violates") || error.includes("referenced")) {
        alert("Cannot delete this staff member because they have existing appointments. Deactivate them instead.");
      } else {
        alert(`Error deleting staff: ${error}`);
      }
      return;
    }
    setStaffMembers((prev) => prev.filter((s) => s.id !== id));
    if (selectedStaff?.id === id) setSelectedStaff(null);
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaff) return;
    const { data } = await queryData<Staff>("staff.update", { id: selectedStaff.id, schedule: scheduleData });
    if (data) {
      setStaffMembers((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      setSelectedStaff(data);
    }
    setShowScheduleModal(false);
  }

  /* Helper: extract professional title from stored specialties */
  function getStaffProfTitle(s: Staff): string | null {
    for (const pt of PROFESSIONAL_TYPES) {
      if (s.specialties?.includes(pt.title)) return pt.title;
    }
    return null;
  }

  function getStaffSkills(s: Staff): string[] {
    return (s.specialties || []).filter(sp => !PROFESSIONAL_TYPES.some(pt => pt.title === sp));
  }

  function getTypeInfo(title: string | null) {
    if (!title) return null;
    return getProfessionalType(title);
  }

  const activeStaff = staffMembers.filter((s) => s.is_active);
  const inactiveStaff = staffMembers.filter((s) => !s.is_active);

  /* Current form's professional type */
  const currentProfType = getProfessionalType(formData.professional_title);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{t("title")}</h1>
          <p>{activeStaff.length} active · {inactiveStaff.length} inactive</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>{t("addStaff")}</button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading staff...</div>
      ) : staffMembers.length === 0 ? (
        <div className={styles.empty}>
          <p>No staff members yet</p>
          <button className="btn btn-primary" onClick={openNew}>Add Your First Team Member</button>
        </div>
      ) : (
        <div className={styles.staffGrid}>
          {staffMembers.map((s) => {
            const profTitle = getStaffProfTitle(s);
            const typeInfo = getTypeInfo(profTitle);
            const skills = getStaffSkills(s);

            return (
              <div key={s.id} className={`card ${styles.staffCard} ${!s.is_active ? styles.inactive : ""}`} onClick={() => setSelectedStaff(s)}>
                <div className={styles.staffHeader}>
                  {s.photo_url ? (
                    <img src={s.photo_url} alt={s.name} className={styles.staffAvatarImg} />
                  ) : (
                    <div className={styles.staffAvatar}>{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
                  )}
                  <div>
                    <h3>{s.name}</h3>
                    {profTitle && typeInfo ? (
                      <div className={styles.profTitleBadge} style={{ background: `${typeInfo.color}18`, color: typeInfo.color, borderColor: `${typeInfo.color}40` }}>
                        <span>{typeInfo.icon}</span> {profTitle}
                      </div>
                    ) : (
                      <span className={styles.staffRole}>{s.role}</span>
                    )}
                  </div>
                </div>
                {skills.length > 0 && (
                  <div className={styles.specialties}>
                    {skills.slice(0, 4).map((sp) => (
                      <span key={sp} className="badge badge-primary">{sp}</span>
                    ))}
                    {skills.length > 4 && (
                      <span className={styles.moreTag}>+{skills.length - 4} more</span>
                    )}
                  </div>
                )}
                <div className={styles.staffStats}>
                  <div className={styles.sStat}>
                    <span className={styles.sStatValue}>{s.commission_rate}%</span>
                    <span className={styles.sStatLabel}>Commission</span>
                  </div>
                  <div className={styles.sStat}>
                    <span className={styles.sStatValue}>{s.is_active ? "Active" : "Inactive"}</span>
                    <span className={styles.sStatLabel}>Status</span>
                  </div>
                </div>
                <div className={styles.staffMeta}>
                  {s.email && <span>✉️ {s.email}</span>}
                  {s.phone && <span>📱 {s.phone}</span>}
                </div>
                <div className={styles.staffActions}>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>✏️ Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openSchedule(s); }}>📅 Schedule</button>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setAgreementStaff(s); }}>{(s as any).agreement_signed_at ? '✅' : '📝'} Agreement</button>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(s.id); }} style={{ color: "var(--color-danger)" }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Staff Detail Drawer ── */}
      {selectedStaff && !showModal && !showScheduleModal && (() => {
        const profTitle = getStaffProfTitle(selectedStaff);
        const typeInfo = getTypeInfo(profTitle);
        const skills = getStaffSkills(selectedStaff);

        return (
          <div className={styles.profileOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedStaff(null); }}>
            <div className={styles.profileDrawer} onClick={(e) => e.stopPropagation()}>
              <button className={styles.profileClose} onClick={() => setSelectedStaff(null)}>✕</button>

              <div className={styles.profileHeader}>
                {selectedStaff.photo_url ? (
                  <img src={selectedStaff.photo_url} alt={selectedStaff.name} className={styles.profileAvatarImg} />
                ) : (
                  <div className={styles.profileAvatar}>
                    {selectedStaff.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                )}
                <h2>{selectedStaff.name}</h2>
                {profTitle && typeInfo ? (
                  <div className={styles.profTitleBadgeLg} style={{ background: `${typeInfo.color}18`, color: typeInfo.color, borderColor: `${typeInfo.color}40` }}>
                    <span>{typeInfo.icon}</span> {profTitle}
                  </div>
                ) : (
                  <span className={`badge ${selectedStaff.role === "owner" ? "badge-primary" : selectedStaff.role === "manager" ? "badge-info" : "badge-success"}`}>
                    {selectedStaff.role}
                  </span>
                )}
                <span className={`badge ${selectedStaff.is_active ? "badge-success" : "badge-warning"}`} style={{ marginTop: 4 }}>
                  {selectedStaff.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {/* Contact */}
              <div className={styles.drawerSection}>
                <h3>Contact</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span>✉️</span>
                    <span>{selectedStaff.email || "No email"}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span>📱</span>
                    <span>{selectedStaff.phone || "No phone"}</span>
                  </div>
                </div>
              </div>

              {/* Professional Title */}
              {profTitle && typeInfo && (
                <div className={styles.drawerSection}>
                  <h3>Professional Type</h3>
                  <div className={styles.profTypeCard} style={{ borderColor: `${typeInfo.color}40` }}>
                    <span className={styles.profTypeIcon} style={{ background: `${typeInfo.color}18`, color: typeInfo.color }}>{typeInfo.icon}</span>
                    <div>
                      <div className={styles.profTypeTitle}>{profTitle}</div>
                      {typeInfo.aliases.length > 0 && (
                        <div className={styles.profTypeAliases}>Also known as: {typeInfo.aliases.join(", ")}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Specialties */}
              {skills.length > 0 && (
                <div className={styles.drawerSection}>
                  <h3>Specialties</h3>
                  <div className={styles.skillTags}>
                    {skills.map((sp) => (
                      <span key={sp} className={styles.skillTag} style={typeInfo ? { background: `${typeInfo.color}12`, color: typeInfo.color, borderColor: `${typeInfo.color}30` } : undefined}>{sp}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div className={styles.drawerSection}>
                <h3>Weekly Schedule</h3>
                <div className={styles.scheduleGrid}>
                  {DAYS.map((day) => {
                    const sched = (selectedStaff.schedule as Record<string, { open: string; close: string; off: boolean; useSlots?: boolean; slots?: { start: string; end: string }[] }>)?.[day];
                    const formatSlotTime = (t: string) => {
                      const [h, m] = t.split(':').map(Number);
                      const ampm = h >= 12 ? 'PM' : 'AM';
                      const h12 = h % 12 || 12;
                      return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
                    };
                    return (
                      <div key={day} className={styles.scheduleRow}>
                        <span className={styles.schedDay}>{day.slice(0, 3)}</span>
                        <span className={styles.schedTime}>
                          {sched?.off ? (
                            <span style={{ color: "var(--text-tertiary)" }}>Off</span>
                          ) : sched?.useSlots && sched.slots && sched.slots.length > 0 ? (
                            <span className={styles.slotBadges}>
                              {sched.slots.map((sl, i) => (
                                <span key={i} className={styles.slotBadge}>{formatSlotTime(sl.start)}–{formatSlotTime(sl.end)}</span>
                              ))}
                            </span>
                          ) : (
                            `${sched?.open || "9:00"} – ${sched?.close || "18:00"}`
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stats */}
              <div className={styles.drawerSection}>
                <h3>Compensation</h3>
                <div className={styles.infoItem}>
                  <span>💰</span>
                  <span>{selectedStaff.commission_rate}% commission rate</span>
                </div>
              </div>

              <div className={styles.drawerActions}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openEdit(selectedStaff)}>✏️ Edit Profile</button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => openSchedule(selectedStaff)}>📅 Edit Schedule</button>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setAgreementStaff(selectedStaff)}>{(selectedStaff as any).agreement_signed_at ? '✅ View Agreement' : '📝 Sign Agreement'}</button>
                <button className="btn btn-ghost" style={{ color: "var(--color-danger)" }} onClick={() => setDeleteConfirmId(selectedStaff.id)}>🗑️</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit Staff Modal ── */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</h2>
            </div>
            <form onSubmit={handleSave} className={styles.modalForm}>
              <div className={styles.modalBody}>
                {/* Photo Upload — matches client page pattern */}
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
                    <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
                  </label>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className="label">Name *</label>
                    <input className="input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label className="label">Business Role</label>
                    <select className="input" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                      <option value="technician">Technician</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className="label">Email</label>
                    <input className="input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className="label">Phone</label>
                    <input className="input" value={formData.phone} placeholder="(555) 123-4567" onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className="label">Commission Rate (%)</label>
                    <input className="input" type="number" value={formData.commission_rate} onChange={(e) => setFormData({ ...formData, commission_rate: Number(e.target.value) })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className="label">🔒 Tablet PIN</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={formData.pin}
                      placeholder="4-digit PIN"
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setFormData({ ...formData, pin: v });
                      }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                      {formData.pin ? `PIN: ${formData.pin}` : "No PIN set — staff can access without PIN"}
                    </span>
                  </div>
                  {editingStaff && (
                    <div className={styles.formGroup}>
                      <label className={styles.checkLabel}>
                        <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                        Active
                      </label>
                    </div>
                  )}
                </div>

                {/* ── Professional Type Picker ── */}
                <div className={styles.profSection}>
                  <label className="label">Professional Type</label>
                  <p className={styles.profHint}>Select the type of beauty professional to see relevant specialties</p>
                  <div className={styles.profTypeGrid}>
                    {PROFESSIONAL_TYPES.map((pt) => (
                      <button
                        key={pt.id}
                        type="button"
                        className={`${styles.profTypeBtn} ${formData.professional_title === pt.title ? styles.profTypeBtnActive : ""}`}
                        style={formData.professional_title === pt.title ? { borderColor: pt.color, background: `${pt.color}12` } : undefined}
                        onClick={() => handleProfessionalTitleChange(pt.title)}
                      >
                        <span className={styles.profTypeBtnIcon} style={{ background: `${pt.color}18`, color: pt.color }}>{pt.icon}</span>
                        <span className={styles.profTypeBtnLabel}>{pt.title.split(" / ")[0].split(" & ")[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Specialties Chips ── */}
                {currentProfType && (
                  <div className={styles.profSection}>
                    <div className={styles.specHeader}>
                      <label className="label">
                        {currentProfType.icon} {currentProfType.title} — Specialties
                      </label>
                      <span className={styles.specCount}>
                        {formData.specialties.length} selected
                      </span>
                    </div>
                    <p className={styles.profHint}>Click to select skills this team member specializes in</p>
                    <div className={styles.specGrid}>
                      {currentProfType.specialties.map((sp) => {
                        const isSelected = formData.specialties.includes(sp);
                        return (
                          <button
                            key={sp}
                            type="button"
                            className={`${styles.specChip} ${isSelected ? styles.specChipActive : ""}`}
                            style={isSelected ? { background: `${currentProfType.color}18`, color: currentProfType.color, borderColor: `${currentProfType.color}50` } : undefined}
                            onClick={() => toggleSpecialty(sp)}
                          >
                            {isSelected && <span className={styles.specCheck}>✓</span>}
                            {sp}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setPhotoPreview(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingStaff ? "Save Changes" : "Add Staff"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Schedule Editor Modal ── */}
      {showScheduleModal && selectedStaff && (
        <div className={styles.modalOverlay} onClick={() => { setShowScheduleModal(false); setSelectedStaff(null); }}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()} style={{ padding: 0 }}>
            <div style={{ padding: 'var(--space-6) var(--space-8) 0' }}>
              <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Schedule — {selectedStaff.name}
                <button type="button" style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 }} onClick={() => { setShowScheduleModal(false); setSelectedStaff(null); }}>×</button>
              </h2>
            </div>
            <form onSubmit={handleSaveSchedule} className={styles.modalForm}>
              <div className={styles.modalBody}>
                <div className={styles.scheduleEditor}>
                  {DAYS.map((day) => {
                    const dayData = scheduleData[day];
                    const isOff = dayData?.off;
                    const useSlots = dayData?.useSlots;
                    const slots = dayData?.slots || [];

                    return (
                      <div key={day} className={styles.schedDayBlock}>
                        {/* Day header row */}
                        <div className={styles.schedEditRow}>
                          <span className={styles.schedEditDay}>{day}</span>
                          <div className={styles.schedDayControls}>
                            {!isOff && (
                              <>
                                <input className="input" type="time" value={dayData?.open || ""}
                                  onChange={(e) => setScheduleData((prev) => ({ ...prev, [day]: { ...prev[day], open: e.target.value } }))}
                                  style={{ width: 120 }}
                                />
                                <span style={{ color: "var(--text-tertiary)", fontSize: 'var(--text-sm)' }}>to</span>
                                <input className="input" type="time" value={dayData?.close || ""}
                                  onChange={(e) => setScheduleData((prev) => ({ ...prev, [day]: { ...prev[day], close: e.target.value } }))}
                                  style={{ width: 120 }}
                                />
                              </>
                            )}
                            <label className={styles.checkLabel}>
                              <input type="checkbox" checked={isOff || false}
                                onChange={() => setScheduleData((prev) => ({ ...prev, [day]: { ...prev[day], off: !prev[day].off } }))}
                              />
                              Off
                            </label>
                          </div>
                        </div>

                        {/* Slot mode toggle */}
                        {!isOff && (
                          <div className={styles.slotToggleRow}>
                            <button
                              type="button"
                              className={`${styles.slotModeBtn} ${!useSlots ? styles.slotModeBtnActive : ''}`}
                              onClick={() => { if (useSlots) toggleSlotMode(day); }}
                            >
                              Continuous
                            </button>
                            <button
                              type="button"
                              className={`${styles.slotModeBtn} ${useSlots ? styles.slotModeBtnActive : ''}`}
                              onClick={() => { if (!useSlots) toggleSlotMode(day); }}
                            >
                              🕐 Custom Slots
                            </button>
                          </div>
                        )}

                        {/* Appointment Slots */}
                        {!isOff && useSlots && (
                          <div className={styles.slotsContainer}>
                            {slots.length === 0 && (
                              <p className={styles.slotsEmpty}>No slots yet — add your first appointment block</p>
                            )}
                            {slots.map((slot, i) => (
                              <div key={i} className={styles.slotRow}>
                                <span className={styles.slotNum}>{i + 1}</span>
                                <input className="input" type="time" value={slot.start}
                                  onChange={(e) => updateSlot(day, i, 'start', e.target.value)}
                                  style={{ width: 110 }}
                                />
                                <span style={{ color: "var(--text-tertiary)", fontSize: 'var(--text-sm)' }}>→</span>
                                <input className="input" type="time" value={slot.end}
                                  onChange={(e) => updateSlot(day, i, 'end', e.target.value)}
                                  style={{ width: 110 }}
                                />
                                <span className={styles.slotDuration}>
                                  {(() => {
                                    const [sh, sm] = slot.start.split(':').map(Number);
                                    const [eh, em] = slot.end.split(':').map(Number);
                                    const mins = (eh * 60 + em) - (sh * 60 + sm);
                                    if (mins <= 0) return '';
                                    const h = Math.floor(mins / 60);
                                    const m = mins % 60;
                                    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
                                  })()}
                                </span>
                                <button type="button" className={styles.slotRemoveBtn} onClick={() => removeSlot(day, i)} title="Remove slot">✕</button>
                              </div>
                            ))}
                            <button type="button" className={styles.addSlotBtn} onClick={() => addSlot(day)}>
                              + Add Slot
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Copy to all days */}
                <div className={styles.copySection}>
                  <span className={styles.copyLabel}>Copy schedule from:</span>
                  <div className={styles.copyBtns}>
                    {DAYS.filter(d => !scheduleData[d]?.off).map((d) => (
                      <button key={d} type="button" className={styles.copyBtn} onClick={() => copySlots(d)} title={`Copy ${d}'s schedule to all other working days`}>
                        {d.slice(0, 3)} → All
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-secondary" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowScheduleModal(false); setSelectedStaff(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Staff Agreement Modal ── */}
      {agreementStaff && (
        <StaffAgreement
          staff={agreementStaff}
          onClose={() => setAgreementStaff(null)}
          onSigned={() => { setAgreementStaff(null); fetchStaff(); }}
        />
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId && (
        <div className={styles.profileOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirmId(null); }}>
          <div style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-8)',
            maxWidth: 400,
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>⚠️</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-2)', fontSize: '1.1rem' }}>Delete Staff Member?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: '0.9rem' }}>
              This action cannot be undone. The staff member will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              <button className="btn" onClick={handleDeleteConfirmed} style={{
                background: 'var(--color-danger, #ef4444)',
                color: 'white',
                border: 'none',
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
