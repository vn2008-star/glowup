"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import styles from "./booking.module.css";
import type { Campaign, Staff, Appointment, Client } from "@/lib/types";

/* ─── Open Slot Types ─── */
interface OpenSlot {
  id: string;
  staffId: string;
  staffName: string;
  date: Date;
  startHour: number;
  endHour: number;
  durationMin: number;
}

type FillAudience = "all" | "active" | "at_risk" | "vip" | "selected";

const FILL_DEFAULT_MSG = `Hey {name}! ⚡ We just had an opening — {slots}. {discount}Book now before it's gone → `;

function detectOpenSlots(staff: Staff[], appointments: Appointment[], days: number): OpenSlot[] {
  const slots: OpenSlot[] = [];
  const now = new Date();
  const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dayName = DAY_NAMES[date.getDay()];
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

    for (const s of staff) {
      if (!s.is_active) continue;
      const sched = (s.schedule && typeof s.schedule === 'object' && Object.keys(s.schedule).length > 0)
        ? s.schedule as Record<string, { start?: string; end?: string; off?: boolean }>
        : null;
      const dayConfig = sched?.[dayName];

      const isSunday = date.getDay() === 0;
      if (dayConfig) {
        if (dayConfig.off) continue;
      } else if (isSunday) {
        continue;
      }

      const workStart = dayConfig?.start ? parseInt(dayConfig.start, 10) : 9;
      const workEnd = dayConfig?.end ? parseInt(dayConfig.end, 10) : 17;
      if (workEnd <= workStart) continue;

      const booked: { start: number; end: number }[] = [];
      for (const apt of appointments) {
        if (apt.staff_id !== s.id) continue;
        const aptDate = new Date(apt.start_time);
        const aptDateStr = `${aptDate.getFullYear()}-${String(aptDate.getMonth()+1).padStart(2,"0")}-${String(aptDate.getDate()).padStart(2,"0")}`;
        if (aptDateStr !== dateStr) continue;
        if (apt.status === "cancelled") continue;
        const startH = aptDate.getHours() + aptDate.getMinutes() / 60;
        const endDate = new Date(apt.end_time);
        const endH = endDate.getHours() + endDate.getMinutes() / 60;
        booked.push({ start: startH, end: endH });
      }
      booked.sort((a, b) => a.start - b.start);

      let cursor = workStart;
      for (const b of booked) {
        if (b.start > cursor && (b.start - cursor) >= 0.5) {
          slots.push({
            id: `${s.id}-${dateStr}-${cursor}`,
            staffId: s.id, staffName: s.name,
            date: new Date(date), startHour: cursor, endHour: b.start,
            durationMin: Math.round((b.start - cursor) * 60),
          });
        }
        cursor = Math.max(cursor, b.end);
      }
      if (workEnd > cursor && (workEnd - cursor) >= 0.5) {
        slots.push({
          id: `${s.id}-${dateStr}-${cursor}`,
          staffId: s.id, staffName: s.name,
          date: new Date(date), startHour: cursor, endHour: workEnd,
          durationMin: Math.round((workEnd - cursor) * 60),
        });
      }
    }
  }
  return slots;
}

function formatHour(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

const BOOKING_AUTOMATIONS = [
  { key: "auto_rebooking", name: "🔄 Rebooking Reminder", trigger: "Based on service cycle", channelKey: "auto_rebooking_channel" },
  { key: "auto_noshow", name: "⚠️ No-Show Follow-Up", trigger: "1 hour after missed appt", channelKey: "auto_noshow_channel" },
];

export default function BookingPage() {
  const { tenant, refetch } = useTenant();

  const [fillStep, setFillStep] = useState(1);
  const [fillDays, setFillDays] = useState(3);
  const [allSlots, setAllSlots] = useState<OpenSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [fillMessage, setFillMessage] = useState(FILL_DEFAULT_MSG);
  const [fillDiscount, setFillDiscount] = useState("");
  const [fillChannel, setFillChannel] = useState<"sms" | "email" | "both">("both");
  const [fillAudience, setFillAudience] = useState<FillAudience>("all");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState("");
  const [savedLists, setSavedLists] = useState<{ name: string; clientIds: string[] }[]>([]);
  const [saveListName, setSaveListName] = useState("");
  const [showSaveList, setShowSaveList] = useState(false);
  const [fillSending, setFillSending] = useState(false);
  const [fillSent, setFillSent] = useState(false);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Automation toggles
  const [automationStates, setAutomationStates] = useState<Record<string, boolean | string>>({});

  const loadFillData = useCallback(async () => {
    if (!tenant) return;
    const [staffRes, aptRes, clientRes] = await Promise.all([
      queryData<Staff[]>("staff.list"),
      queryData<Appointment[]>("appointments.list"),
      queryData<Client[]>("clients.list"),
    ]);
    const staff = staffRes.data || [];
    const apts = aptRes.data || [];
    const clients = clientRes.data || [];
    setAllStaff(staff);
    setAllAppointments(apts);
    setAllClients(clients);
    setAllSlots(detectOpenSlots(staff, apts, fillDays));

    // Load automation states
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const autoSettings = (settings.automations || {}) as Record<string, boolean | string>;
    const states: Record<string, boolean | string> = {};
    BOOKING_AUTOMATIONS.forEach((a) => {
      states[a.key] = autoSettings[a.key] ?? true;
      if (autoSettings[a.channelKey]) states[a.channelKey] = autoSettings[a.channelKey];
    });
    // Load FMO settings
    states["auto_fill_openings"] = autoSettings["auto_fill_openings"] ?? false;
    states["auto_fill_openings_channel"] = autoSettings["auto_fill_openings_channel"] || "both";
    states["auto_fill_openings_audience"] = autoSettings["auto_fill_openings_audience"] || "all";
    states["auto_fill_openings_list"] = autoSettings["auto_fill_openings_list"] || "";
    setAutomationStates(states);

    // Load saved client lists
    const lists = (settings.savedClientLists || []) as { name: string; clientIds: string[] }[];
    setSavedLists(lists);
  }, [tenant, fillDays]);

  useEffect(() => { loadFillData(); }, [loadFillData]);

  useEffect(() => {
    if (allStaff.length > 0) {
      setAllSlots(detectOpenSlots(allStaff, allAppointments, fillDays));
    }
  }, [fillDays, allStaff, allAppointments]);

  function toggleSlot(id: string) {
    setSelectedSlots(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllSlots() {
    if (selectedSlots.size === allSlots.length) {
      setSelectedSlots(new Set());
    } else {
      setSelectedSlots(new Set(allSlots.map(s => s.id)));
    }
  }

  function getAudienceCount(audience: FillAudience): number {
    switch (audience) {
      case "all": return allClients.length;
      case "active": return allClients.filter(c => c.status === "active").length;
      case "at_risk": return allClients.filter(c => c.status === "at_risk").length;
      case "vip": return allClients.filter(c => c.visit_count >= 10 || c.lifetime_spend >= 500).length;
      case "selected": return selectedClientIds.size;
    }
  }

  function toggleClient(id: string) {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getSelectedSlotsText(): string {
    const selected = allSlots.filter(s => selectedSlots.has(s.id));
    if (selected.length === 0) return "";
    const grouped = new Map<string, OpenSlot[]>();
    selected.forEach(s => {
      const key = s.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    });
    const parts: string[] = [];
    grouped.forEach((slots, date) => {
      const times = slots.map(s => `${formatHour(s.startHour)} – ${formatHour(s.endHour)}`).join(", ");
      parts.push(`${date} at ${times}`);
    });
    return parts.join("; ");
  }

  async function handleSendBlast() {
    if (selectedSlots.size === 0) return;
    setFillSending(true);

    const slotsText = getSelectedSlotsText();
    const personalizedMessage = fillMessage
      .replace("{slots}", slotsText)
      .replace("{discount}", fillDiscount ? `${fillDiscount} — ` : "");

    const recipientCount = getAudienceCount(fillAudience);
    const payload = {
      name: `Fill My Openings — ${new Date().toLocaleDateString()}`,
      type: "fill_openings",
      template: { message: fillMessage, discount: fillDiscount, slots: slotsText, audience: fillAudience },
      status: "sending",
      metrics: { sent: 0, opened: 0, booked: 0, revenue: 0 },
    };
    const { data: campaign } = await queryData<Campaign>("campaigns.add", payload);
    if (campaign) setCampaigns(prev => [campaign, ...prev]);

    try {
      const res = await fetch("/api/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign?.id,
          message: personalizedMessage,
          audience: fillAudience,
          tenant_id: tenant?.id,
          channel: fillChannel,
        }),
      });
      const result = await res.json();

      if (campaign) {
        const updated: Campaign = {
          ...campaign,
          status: "completed" as Campaign["status"],
          metrics: { sent: result.sent || recipientCount, opened: 0, booked: 0, revenue: 0 },
        };
        setCampaigns(prev => prev.map(c => c.id === campaign.id ? updated : c));
      }
    } catch (err) {
      console.error("Blast send failed:", err);
    }

    setFillSending(false);
    setFillSent(true);
  }

  async function handleToggleAutomation(key: string) {
    const newStates = { ...automationStates, [key]: !automationStates[key] };
    setAutomationStates(newStates);
    const settings = (tenant?.settings || {}) as Record<string, unknown>;
    const existingAuto = (settings.automations || {}) as Record<string, boolean>;
    const res = await fetch("/api/save-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { ...settings, automations: { ...existingAuto, ...newStates } },
      }),
    });
    if (res.ok) refetch();
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>⚡ Fill My Openings</h1>
          <p>Blast open appointment slots to your clients and fill your schedule</p>
        </div>
      </div>

      <div className={styles.fillContainer}>
        {/* Step indicator */}
        <div className={styles.fillSteps}>
          {["Select Openings", "Compose Message", "Choose Client", "Preview & Send"].map((label, i) => {
            const step = i + 1;
            const cls = fillStep === step ? styles.fillStepActive : fillStep > step ? styles.fillStepDone : "";
            return (
              <React.Fragment key={step}>
                {i > 0 && <div className={styles.fillStepDivider} />}
                <div className={`${styles.fillStep} ${cls}`}>
                  <span className={styles.fillStepNum}>{fillStep > step ? "✓" : step}</span>
                  <span>{label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {fillSent ? (
          <div className={`card ${styles.fillSuccess}`}>
            <div className="successEmoji">🚀</div>
            <h3>Blast Sent Successfully!</h3>
            <p>{getAudienceCount(fillAudience)} clients notified about {selectedSlots.size} open slot{selectedSlots.size !== 1 ? "s" : ""}.</p>
            <button className="btn btn-primary" onClick={() => { setFillSent(false); setFillStep(1); setSelectedSlots(new Set()); }}>
              Send Another Blast
            </button>
          </div>
        ) : fillStep === 1 ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Open Slots Found: {allSlots.length}</h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Select the openings you want to fill</p>
              </div>
              <div className={styles.dateRangeBar}>
                {[1, 2, 3, 5, 7].map(d => (
                  <button key={d} className={`${styles.dateRangeBtn} ${fillDays === d ? styles.dateRangeBtnActive : ""}`} onClick={() => setFillDays(d)}>
                    {d === 1 ? "Today" : `Next ${d} days`}
                  </button>
                ))}
              </div>
            </div>
            {allSlots.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className={styles.slotSelectAll} onClick={selectAllSlots}>
                  {selectedSlots.size === allSlots.length ? "Deselect All" : `Select All (${allSlots.length})`}
                </button>
              </div>
            )}
            {allSlots.length === 0 ? (
              <div className={`card ${styles.noSlots}`}>
                <div className="noSlotsEmoji">🎉</div>
                <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Fully Booked!</h3>
                <p>No open slots in the next {fillDays} day{fillDays !== 1 ? "s" : ""}. Try expanding the date range.</p>
              </div>
            ) : (
              <div className={styles.staffGroups}>
                {(() => {
                  // Group slots by staff
                  const grouped = new Map<string, OpenSlot[]>();
                  allSlots.forEach(slot => {
                    if (!grouped.has(slot.staffName)) grouped.set(slot.staffName, []);
                    grouped.get(slot.staffName)!.push(slot);
                  });
                  return Array.from(grouped.entries()).map(([staffName, slots]) => {
                    const staffSlotIds = slots.map(s => s.id);
                    const allSelected = staffSlotIds.every(id => selectedSlots.has(id));
                    const someSelected = staffSlotIds.some(id => selectedSlots.has(id));
                    const selectedCount = staffSlotIds.filter(id => selectedSlots.has(id)).length;

                    function toggleStaffSlots() {
                      setSelectedSlots(prev => {
                        const next = new Set(prev);
                        if (allSelected) {
                          staffSlotIds.forEach(id => next.delete(id));
                        } else {
                          staffSlotIds.forEach(id => next.add(id));
                        }
                        return next;
                      });
                    }

                    return (
                      <div key={staffName} className={styles.staffGroup}>
                        <div className={styles.staffGroupHeader}>
                          <div className={styles.staffGroupInfo}>
                            <div className={styles.staffGroupAvatar}>{staffName[0]}</div>
                            <div>
                              <h4 className={styles.staffGroupName}>{staffName}</h4>
                              <span className={styles.staffGroupCount}>
                                {slots.length} opening{slots.length !== 1 ? "s" : ""}
                                {someSelected && ` · ${selectedCount} selected`}
                              </span>
                            </div>
                          </div>
                          <button
                            className={`${styles.slotSelectAll} ${allSelected ? styles.slotSelectAllActive : ""}`}
                            onClick={toggleStaffSlots}
                          >
                            {allSelected ? "✓ All Selected" : `Select All (${slots.length})`}
                          </button>
                        </div>
                        <div className={styles.slotGrid}>
                          {slots.map(slot => (
                            <div key={slot.id} className={`${styles.slotCard} ${selectedSlots.has(slot.id) ? styles.slotCardSelected : ""}`} onClick={() => toggleSlot(slot.id)}>
                              <div className={styles.slotCheck}>{selectedSlots.has(slot.id) ? "✓" : ""}</div>
                              <div className={styles.slotDate}>{slot.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
                              <div className={styles.slotTime}>
                                {formatHour(slot.startHour)} – {formatHour(slot.endHour)}
                                <span className={styles.slotDuration}>{slot.durationMin} min</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
            <div className={styles.fillNav}>
              <div />
              <button className="btn btn-primary" disabled={selectedSlots.size === 0} onClick={() => setFillStep(2)}>
                Next: Compose Message →
              </button>
            </div>
          </>
        ) : fillStep === 2 ? (
          <div className={styles.fillCompose}>
            <div>
              <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Compose Your Message</h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Customize the blast message. Use merge tags for personalization.</p>
            </div>
            <div className={styles.formGroup}>
              <label className="label">Message Template</label>
              <textarea className="input" rows={5} value={fillMessage} onChange={e => setFillMessage(e.target.value)} />
              <div className={styles.charCount}>{fillMessage.length} characters</div>
              <small style={{ color: "var(--text-tertiary)" }}>
                Merge tags: {"{name}"}, {"{slots}"}, {"{discount}"}
              </small>
            </div>
            <div className={styles.discountRow}>
              <label className={styles.discountLabel}>💰 Optional Discount:</label>
              <input className={`input ${styles.discountInput}`} value={fillDiscount} onChange={e => setFillDiscount(e.target.value)} placeholder="e.g., 15% off" />
            </div>
            <div className={styles.formGroup}>
              <label className="label">📡 Send Via</label>
              <div className={styles.channelPicker}>
                {(["sms", "email", "both"] as const).map(ch => (
                  <button
                    key={ch}
                    type="button"
                    className={`${styles.channelBtn} ${fillChannel === ch ? styles.channelBtnActive : ""}`}
                    onClick={() => setFillChannel(ch)}
                  >
                    {ch === "sms" ? "📱 SMS" : ch === "email" ? "📧 Email" : "📱+📧 Both"}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.fillNav}>
              <button className="btn btn-secondary" onClick={() => setFillStep(1)}>← Back</button>
              <button className="btn btn-primary" onClick={() => setFillStep(3)}>Next: Choose Client →</button>
            </div>
          </div>
        ) : fillStep === 3 ? (
          <>
            <div>
              <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Choose Your Clients</h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>Who should receive this blast?</p>
            </div>
            <div className={styles.audienceGrid}>
              {([
                { key: "all" as FillAudience, icon: "📣", title: "All Clients", desc: "Everyone in your client list" },
                { key: "active" as FillAudience, icon: "✅", title: "Active Clients", desc: "Clients who visited recently" },
                { key: "at_risk" as FillAudience, icon: "⚠️", title: "At-Risk Clients", desc: "Win them back with a deal" },
                { key: "vip" as FillAudience, icon: "👑", title: "VIP Clients", desc: "Top spenders & loyal regulars" },
                { key: "selected" as FillAudience, icon: "✋", title: "Select Clients", desc: "Pick specific people" },
              ]).map(opt => (
                <div key={opt.key} className={`card ${styles.audienceCard} ${fillAudience === opt.key ? styles.audienceCardSelected : ""}`} onClick={() => setFillAudience(opt.key)}>
                  <div className={styles.audienceIcon}>{opt.icon}</div>
                  <h4>{opt.title}</h4>
                  <p>{opt.desc}</p>
                  <div className={styles.audienceCount}>{getAudienceCount(opt.key)} clients</div>
                </div>
              ))}
            </div>

            {/* Individual client picker */}
            {fillAudience === "selected" && (
              <div className={`card ${styles.clientPicker}`}>
                <div className={styles.clientPickerHeader}>
                  <input
                    className="input"
                    placeholder="Search clients..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    style={{ maxWidth: 320 }}
                  />
                  <span className={styles.clientPickerCount}>{selectedClientIds.size} selected</span>
                </div>
                {selectedClientIds.size > 0 && (
                  <div className={styles.selectedChips}>
                    {allClients.filter(c => selectedClientIds.has(c.id)).map(c => (
                      <span key={c.id} className={styles.selectedChip}>
                        {c.first_name} {c.last_name || ""}
                        <button type="button" onClick={() => toggleClient(c.id)} className={styles.chipRemove}>×</button>
                      </span>
                    ))}
                    <button type="button" className={styles.chipClearAll} onClick={() => setSelectedClientIds(new Set())}>Clear all</button>
                  </div>
                )}
                {/* Save / Load list controls */}
                <div className={styles.listActions}>
                  {savedLists.length > 0 && (
                    <div className={styles.loadListRow}>
                      <label className={styles.channelPickerLabel}>Load saved list:</label>
                      <select
                        className="input"
                        style={{ maxWidth: 200, fontSize: "var(--text-xs)" }}
                        defaultValue=""
                        onChange={(e) => {
                          const list = savedLists.find(l => l.name === e.target.value);
                          if (list) setSelectedClientIds(new Set(list.clientIds));
                        }}
                      >
                        <option value="" disabled>Choose a list…</option>
                        {savedLists.map(l => (
                          <option key={l.name} value={l.name}>{l.name} ({l.clientIds.length})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedClientIds.size > 0 && !showSaveList && (
                    <button type="button" className={styles.saveListBtn} onClick={() => setShowSaveList(true)}>💾 Save this list</button>
                  )}
                  {showSaveList && (
                    <div className={styles.saveListRow}>
                      <input
                        className="input"
                        placeholder="List name (e.g., VIP Regulars)"
                        value={saveListName}
                        onChange={e => setSaveListName(e.target.value)}
                        style={{ maxWidth: 220, fontSize: "var(--text-xs)" }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: "var(--text-xs)", padding: "var(--space-2) var(--space-3)" }}
                        disabled={!saveListName.trim()}
                        onClick={async () => {
                          const newList = { name: saveListName.trim(), clientIds: Array.from(selectedClientIds) };
                          const updated = [...savedLists.filter(l => l.name !== newList.name), newList];
                          setSavedLists(updated);
                          setSaveListName("");
                          setShowSaveList(false);
                          await fetch("/api/save-settings", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tenantId: tenant?.id, path: "savedClientLists", value: updated }),
                          });
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className={styles.chipClearAll} onClick={() => { setShowSaveList(false); setSaveListName(""); }}>Cancel</button>
                    </div>
                  )}
                </div>
                <div className={styles.clientPickerList}>
                  {allClients
                    .filter(c => {
                      if (!clientSearch) return true;
                      const q = clientSearch.toLowerCase();
                      const fullName = `${c.first_name} ${c.last_name || ""}`.toLowerCase();
                      return fullName.includes(q) || (c.phone || "").includes(q);
                    })
                    .map(c => {
                      const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
                      return (
                      <label key={c.id} className={`${styles.clientPickerRow} ${selectedClientIds.has(c.id) ? styles.clientPickerRowSelected : ""}`}>
                        <input type="checkbox" checked={selectedClientIds.has(c.id)} onChange={() => toggleClient(c.id)} />
                        <div className={styles.clientPickerAvatar}>{c.first_name[0]}</div>
                        <div className={styles.clientPickerInfo}>
                          <span className={styles.clientPickerName}>{fullName || "Unknown"}</span>
                          <span className={styles.clientPickerPhone}>{c.phone || "No phone"}</span>
                        </div>
                      </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div className={styles.fillNav}>
              <button className="btn btn-secondary" onClick={() => setFillStep(2)}>← Back</button>
              <button className="btn btn-primary" disabled={fillAudience === "selected" && selectedClientIds.size === 0} onClick={() => setFillStep(4)}>Next: Preview & Send →</button>
            </div>
          </>
        ) : (
          <>
            <div className={`card ${styles.fillPreview}`}>
              <div className={styles.fillPreviewHeader}>
                <h3>⚡ Fill My Openings Blast Preview</h3>
              </div>
              <div className={styles.fillPreviewBody}>
                <div className={styles.previewMessage}>
                  {fillMessage.replace("{name}", "Sarah").replace("{slots}", getSelectedSlotsText()).replace("{discount}", fillDiscount ? `${fillDiscount} — ` : "")}
                </div>
                <div className={styles.previewStats}>
                  <div className={styles.previewStat}>
                    <div className={styles.previewStatValue}>{selectedSlots.size}</div>
                    <div className={styles.previewStatLabel}>Open Slots</div>
                  </div>
                  <div className={styles.previewStat}>
                    <div className={styles.previewStatValue}>{getAudienceCount(fillAudience)}</div>
                    <div className={styles.previewStatLabel}>Recipients</div>
                  </div>
                  <div className={styles.previewStat}>
                    <div className={styles.previewStatValue}>{fillDiscount || "—"}</div>
                    <div className={styles.previewStatLabel}>Discount</div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.fillNav}>
              <button className="btn btn-secondary" onClick={() => setFillStep(3)}>← Back</button>
              <button className={styles.fillSendBtn} disabled={fillSending} onClick={handleSendBlast}>
                {fillSending ? "Sending..." : "🚀 Send Blast Now"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Auto-Send Settings ── */}
      <div className={styles.autoSendSection}>
        <h2>🤖 Booking Auto-Send</h2>
        <p>Automatically follow up to keep your schedule full</p>
        <div className={styles.automationList}>
          {/* Fill My Openings Automation */}
          {(() => {
            const fmoChannel = (automationStates["auto_fill_openings_channel"] as unknown as string) || "both";
            const fmoAudience = (automationStates["auto_fill_openings_audience"] as unknown as string) || "all";
            return (
              <div className={`card ${styles.automationCard} ${styles.automationCardExpanded}`}>
                <div className={styles.automationCardRow}>
                  <div className={styles.automationInfo}>
                    <h3>⚡ Fill My Openings</h3>
                    <div className={styles.automationMeta}>
                      <span className={styles.trigger}>Auto-blast when openings appear</span>
                    </div>
                  </div>
                  <div>
                    <label className={styles.toggleLabel}>
                      <input type="checkbox" checked={!!automationStates["auto_fill_openings"]} onChange={() => handleToggleAutomation("auto_fill_openings")} />
                      <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                    </label>
                  </div>
                </div>

                {!!automationStates["auto_fill_openings"] && (
                  <div className={styles.fmoSettings}>
                    {/* Channel */}
                    <div className={styles.channelPickerSmall}>
                      <span className={styles.channelPickerLabel}>Send via:</span>
                      {([["sms", "📱 SMS", "Send via text message"], ["email", "📧 Email", "Send via email"], ["both", "📱+📧 Both", "Send via SMS and email"]] as const).map(([ch, label, tip]) => (
                        <button
                          key={ch}
                          type="button"
                          title={tip}
                          className={`${styles.channelBtnSm} ${fmoChannel === ch ? styles.channelBtnSmActive : ""}`}
                          onClick={async () => {
                            setAutomationStates(prev => ({ ...prev, auto_fill_openings_channel: ch }));
                            await fetch("/api/save-settings", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tenantId: tenant?.id, path: "automations.auto_fill_openings_channel", value: ch }),
                            });
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Audience */}
                    <div className={styles.channelPickerSmall} style={{ flexWrap: "wrap" }}>
                      <span className={styles.channelPickerLabel}>Send to:</span>
                      {([
                        ["all", "📣 All", "Notify everyone"],
                        ["active", "✅ Active", "Recently visited clients"],
                        ["at_risk", "⚠️ At-Risk", "Win them back"],
                        ["vip", "👑 VIP", "Top spenders & regulars"],
                        ["saved_list", "📋 Saved List", "Use a saved client list"],
                      ] as const).map(([aud, label, tip]) => (
                        <button
                          key={aud}
                          type="button"
                          title={tip}
                          className={`${styles.channelBtnSm} ${fmoAudience === aud ? styles.channelBtnSmActive : ""}`}
                          onClick={async () => {
                            setAutomationStates(prev => ({ ...prev, auto_fill_openings_audience: aud }));
                            await fetch("/api/save-settings", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tenantId: tenant?.id, path: "automations.auto_fill_openings_audience", value: aud }),
                            });
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Saved list selector */}
                    {fmoAudience === "saved_list" && (
                      <div className={styles.channelPickerSmall}>
                        <span className={styles.channelPickerLabel}>Use list:</span>
                        {savedLists.length === 0 ? (
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>No saved lists yet — save one from the wizard above</span>
                        ) : (
                          <select
                            className="input"
                            style={{ maxWidth: 220, fontSize: "var(--text-xs)" }}
                            value={(automationStates["auto_fill_openings_list"] as string) || ""}
                            onChange={async (e) => {
                              setAutomationStates(prev => ({ ...prev, auto_fill_openings_list: e.target.value }));
                              await fetch("/api/save-settings", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ tenantId: tenant?.id, path: "automations.auto_fill_openings_list", value: e.target.value }),
                              });
                            }}
                          >
                            <option value="" disabled>Choose a list…</option>
                            {savedLists.map(l => (
                              <option key={l.name} value={l.name}>{l.name} ({l.clientIds.length} clients)</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {BOOKING_AUTOMATIONS.map((a) => {
            const currentChannel = (automationStates[a.channelKey] as unknown as string) || "both";
            return (
            <div key={a.key} className={`card ${styles.automationCard}`}>
              <div className={styles.automationInfo}>
                <h3>{a.name}</h3>
                <div className={styles.automationMeta}>
                  <span className={styles.trigger}>⚡ {a.trigger}</span>
                </div>
                <div className={styles.channelPickerSmall}>
                  <span className={styles.channelPickerLabel}>Send via:</span>
                  {([["sms", "📱 SMS", "Send via text message"], ["email", "📧 Email", "Send via email"], ["both", "📱+📧 Both", "Send via SMS and email"]] as const).map(([ch, label, tip]) => (
                    <button
                      key={ch}
                      type="button"
                      title={tip}
                      className={`${styles.channelBtnSm} ${currentChannel === ch ? styles.channelBtnSmActive : ""}`}
                      onClick={async () => {
                        setAutomationStates(prev => ({ ...prev, [a.channelKey]: ch }));
                        await fetch("/api/save-settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tenantId: tenant?.id, path: `automations.${a.channelKey}`, value: ch }),
                        });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={styles.toggleLabel}>
                  <input type="checkbox" checked={!!automationStates[a.key]} onChange={() => handleToggleAutomation(a.key)} />
                  <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
                </label>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
