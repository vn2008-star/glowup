"use client";

import { useState } from "react";
import { renderSmsTemplate, SMS_TEMPLATES, type SmsTemplateId } from "@/lib/outreach-templates";
import styles from "./admin.module.css";

// ─── Outreach texts, sent from the admin's own phone ───
// Replaces bulk texting from the leads table: cold marketing texts to cell
// numbers need prior written consent (TCPA), and GlowUp's Twilio toll-free
// number was rejected, so nothing it sends is delivered anyway. These texts
// are for people who replied or asked to be texted.

const IDS = Object.keys(SMS_TEMPLATES) as SmsTemplateId[];

/** sms: link that opens the phone's Messages app with the text typed in ("?&body=" works on iOS and Android) */
function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;
}

const input: React.CSSProperties = {
  width: "100%", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", fontSize: "13px",
};
const label: React.CSSProperties = { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "var(--text-secondary)" };

export default function OutreachTextKit() {
  const [templateId, setTemplateId] = useState<SmsTemplateId>("sms_thanks");
  const [first, setFirst] = useState("");
  const [salon, setSalon] = useState("");
  const [phone, setPhone] = useState("");
  const [sender, setSender] = useState("");
  const [signup, setSignup] = useState("https://joinglowup.org/auth/signup");
  const [preview, setPreview] = useState("");
  const [copied, setCopied] = useState(false);

  const needsPreview = SMS_TEMPLATES[templateId].link === "preview";
  const link = needsPreview ? preview.trim() : signup.trim();
  const text = renderSmsTemplate(templateId, { salon, first, sender, link: link || (needsPreview ? "[booking page link]" : "[link]") });
  const canText = phone.replace(/\D/g, "").length >= 10 && !!link;

  return (
    <div>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "var(--space-4)", lineHeight: 1.6 }}>
        Text <strong>only people who replied or asked to be texted</strong>. Cold sales texts to cell phones need the owner&apos;s written consent, and fines run $500–$1,500 per text.
        These go from <strong>your own phone</strong>: GlowUp&apos;s texting number was rejected by Twilio, so texts sent by the app aren&apos;t delivered.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        {IDS.map(id => (
          <div
            key={id}
            onClick={() => { setTemplateId(id); setCopied(false); }}
            style={{
              padding: "var(--space-3)", borderRadius: "var(--radius-md)", cursor: "pointer",
              border: templateId === id ? "2px solid var(--color-primary)" : "1px solid var(--border-default)",
              background: templateId === id ? "rgba(195, 126, 218, 0.08)" : "transparent",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700 }}>{SMS_TEMPLATES[id].name}</div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>{SMS_TEMPLATES[id].description}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <div><label style={label}>Their first name</label><input style={input} value={first} onChange={e => setFirst(e.target.value)} placeholder="Sarah" /></div>
        <div><label style={label}>Business name</label><input style={input} value={salon} onChange={e => setSalon(e.target.value)} placeholder="Luxe Nails & Spa" /></div>
        <div><label style={label}>Their mobile</label><input style={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(530) 555-0123" /></div>
        <div><label style={label}>Your name</label><input style={input} value={sender} onChange={e => setSender(e.target.value)} placeholder="James" /></div>
        {needsPreview
          ? <div style={{ gridColumn: "1 / -1" }}><label style={label}>Their booking page link (from Imported salons)</label><input style={input} value={preview} onChange={e => setPreview(e.target.value)} placeholder="https://www.joinglowup.org/book/luxe-nails-spa" /></div>
          : <div style={{ gridColumn: "1 / -1" }}><label style={label}>Sign-up link</label><input style={input} value={signup} onChange={e => setSignup(e.target.value)} /></div>}
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
        <div style={{ fontSize: "14px", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div>
        <div style={{ fontSize: "11px", color: text.length > 160 ? "var(--status-pending)" : "var(--text-tertiary)", marginTop: "6px" }}>
          {text.length} characters{text.length > 160 ? " — goes as 2 texts; a shorter link helps" : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        {canText
          ? <a className={styles.enableBtn} style={{ textDecoration: "none" }} href={smsHref(phone, text)}>💬 Text from my phone</a>
          : <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Add their mobile{needsPreview ? " and booking page link" : ""} to text it</span>}
        <button
          type="button"
          className={styles.enableBtn}
          onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* select the text instead */ } }}
        >
          {copied ? "Copied" : "Copy text"}
        </button>
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "var(--space-3)" }}>
        &ldquo;Text from my phone&rdquo; opens Messages with the text ready — use it with /admin open on your phone. On a computer, use Copy text.
      </p>
    </div>
  );
}
