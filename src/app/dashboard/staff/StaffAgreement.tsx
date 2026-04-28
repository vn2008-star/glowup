"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTenant } from "@/lib/tenant-context";
import { queryData } from "@/lib/api";
import type { Staff } from "@/lib/types";
import styles from "./agreement.module.css";

interface Props {
  staff: Staff;
  onClose: () => void;
  onSigned: () => void;
}

export default function StaffAgreement({ staff, onClose, onSigned }: Props) {
  const { tenant } = useTenant();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Check if already signed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agreement = (staff as any).agreement_signed_at ? {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signed_at: (staff as any).agreement_signed_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signature: (staff as any).agreement_signature,
  } : null;

  const businessName = tenant?.name || "[Business Name]";

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || agreement) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Set canvas resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [agreement]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSigned(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleSign = useCallback(async () => {
    if (!hasSigned || !canvasRef.current) return;
    setSaving(true);
    const signatureDataUrl = canvasRef.current.toDataURL("image/png");
    await queryData("staff.update", {
      id: staff.id,
      agreement_signature: signatureDataUrl,
      agreement_signed_at: new Date(signDate).toISOString(),
    });
    setSaving(false);
    onSigned();
  }, [hasSigned, signDate, staff.id, onSigned]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Employee Agreement</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.document}>
            <div className={styles.docTitle}>Employee Agreement (Salon Professional)</div>
            <div className={styles.docSubtitle}>{businessName}</div>

            <p className={styles.docIntro}>
              This Employee Agreement (&ldquo;Agreement&rdquo;) is entered into between <strong>{businessName}</strong> and <strong>{staff.name}</strong> (&ldquo;Employee&rdquo;) as of <strong>{new Date(signDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.
            </p>

            {/* Section 1 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>1. At-Will Employment</div>
              <p>Employment with {businessName} is at-will. Either party may terminate employment at any time, with or without cause or notice, in accordance with California law.</p>
            </div>

            {/* Section 2 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>2. Confidentiality &amp; Trade Secrets</div>
              <p>Employee acknowledges that during employment they will have access to confidential and proprietary information, including but not limited to:</p>
              <ul>
                <li>Client lists and contact information</li>
                <li>Service history and preferences</li>
                <li>Pricing, marketing strategies, and business operations</li>
              </ul>
              <p>Employee agrees not to copy, download, photograph, or remove such information, and not to use or disclose it outside the business during or after employment.</p>
            </div>

            {/* Section 3 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>3. Client Relationship &amp; Booking Policy</div>
              <p>All client appointments, communications, and transactions must be conducted through {businessName} systems.</p>
              <p>Employees may not:</p>
              <ul>
                <li>Book clients outside the system</li>
                <li>Accept direct payments outside the business</li>
                <li>Divert clients to personal or external services</li>
              </ul>
            </div>

            {/* Section 4 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>4. Non-Solicitation (California-Compliant)</div>
              <p>During employment, Employee agrees not to solicit clients of the business for services outside of {businessName}.</p>
              <p>After employment ends, Employee agrees not to use or rely on confidential client information obtained through {businessName} to solicit clients.</p>
            </div>

            {/* Section 5 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>5. No Personal Contact Capture</div>
              <p>Employees may not collect or maintain personal client contact information outside of the business system for business purposes.</p>
              <p>All client records remain the sole property of {businessName}.</p>
            </div>

            {/* Section 6 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>6. Social Media &amp; Branding</div>
              <p>Any content created featuring clients, services, or work performed at {businessName} may be used by the business for marketing and must not be used to redirect clients away from the business.</p>
            </div>

            {/* Section 7 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>7. Return of Property</div>
              <p>Upon termination, Employee must return all business property including devices, client records, photos, files, or data. No copies may be retained.</p>
            </div>

            {/* Section 8 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>8. Acknowledgment</div>
              <p>Employee acknowledges that client relationships are developed through the business and that business resources contribute to client acquisition and retention.</p>
            </div>

            {/* Signature Area */}
            <div className={styles.signatureArea}>
              <div className={styles.signatureTitle}>Signatures</div>

              {agreement ? (
                /* Already signed */
                <div className={styles.signedView}>
                  <span className={styles.signedBadge}>✓ Agreement Signed</span>
                  {agreement.signature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={agreement.signature} alt="Signature" />
                  )}
                  <div className={styles.signedDate}>
                    Signed on {new Date(agreement.signed_at).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </div>
                </div>
              ) : (
                /* Sign now */
                <div className={styles.signatureRow}>
                  <div className={styles.signatureBlock}>
                    <span className={styles.signatureLabel}>Employee Signature</span>
                    <div className={`${styles.canvasWrapper} ${hasSigned ? styles.canvasSigned : ""}`}>
                      {!hasSigned && <span className={styles.canvasHint}>Draw your signature here</span>}
                      <canvas
                        ref={canvasRef}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={endDraw}
                        onMouseLeave={endDraw}
                        onTouchStart={startDraw}
                        onTouchMove={draw}
                        onTouchEnd={endDraw}
                      />
                    </div>
                    {hasSigned && <button className={styles.clearBtn} onClick={clearSignature}>Clear signature</button>}
                  </div>
                  <div className={styles.signatureBlock}>
                    <span className={styles.signatureLabel}>Date</span>
                    <input type="date" className={styles.dateField} value={signDate} onChange={e => setSignDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <div>
            {agreement ? (
              <span className={styles.signedBadge}>✓ Signed</span>
            ) : (
              <span className={styles.unsignedBadge}>⏳ Pending Signature</span>
            )}
          </div>
          <div className={styles.footerActions}>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
            {!agreement && (
              <button className="btn btn-primary" onClick={handleSign} disabled={!hasSigned || saving}>
                {saving ? "Saving..." : "✍️ Sign Agreement"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
