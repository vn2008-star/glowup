"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface StatementLine {
  date: string;
  time: string;
  client: string;
  service: string;
  price: number;
  tip: number;
}

interface StatementData {
  businessName: string;
  staffName: string;
  staffRole: string;
  staffEmail: string;
  commissionRate: number;
  commissionEarned: number;
  periodLabel: string;
  lines: StatementLine[];
  totals: {
    appointments: number;
    revenue: number;
    tips: number;
    earnings: number;
  };
}

function StatementContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<StatementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const staff = searchParams.get("staff");
    const tenant = searchParams.get("tenant");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const token = searchParams.get("token");

    if (!staff || !tenant || !start || !end || !token) {
      setError("Invalid statement link. Please check your email for the correct link.");
      setLoading(false);
      return;
    }

    fetch(`/api/staff-statement?staff=${staff}&tenant=${tenant}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&token=${token}`)
      .then(res => {
        if (!res.ok) throw new Error("Invalid or expired link");
        return res.json();
      })
      .then(res => setData(res.data))
      .catch(() => setError("Unable to load statement. The link may have expired or is invalid."))
      .finally(() => setLoading(false));
  }, [searchParams]);

  const fmt = (n: number) => `$${n.toLocaleString()}`;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#1a1625" }}>
        <div style={{ textAlign: "center", color: "#a0a0b0" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>📄</div>
          <p>Loading your statement...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#1a1625" }}>
        <div style={{ textAlign: "center", color: "#ff6b6b", maxWidth: "400px", padding: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
          <h2 style={{ marginBottom: "8px" }}>Statement Unavailable</h2>
          <p style={{ color: "#a0a0b0", fontSize: "14px" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .statement-page { background: white !important; color: #111 !important; padding: 20px !important; }
          .statement-page * { color: #111 !important; border-color: #ddd !important; }
          .statement-header { background: #f5f5f5 !important; }
          .statement-card { background: #fafafa !important; border-color: #ddd !important; }
          .highlight-value { color: #7c3aed !important; }
          .highlight-green { color: #16a34a !important; }
          .highlight-pink { color: #db2777 !important; }
          table th { background: #f0f0f0 !important; }
          table td, table th { border-bottom-color: #eee !important; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      <div className="statement-page" style={{
        minHeight: "100vh",
        background: "#1a1625",
        color: "#f0f0f5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        {/* Action Bar (hidden on print) */}
        <div className="no-print" style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "rgba(26, 22, 37, 0.95)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid #3d3550",
          padding: "12px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "24px" }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "14px" }}>Revenue Statement</div>
              <div style={{ fontSize: "12px", color: "#a0a0b0" }}>{data.periodLabel}</div>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            style={{
              background: "linear-gradient(135deg, #c9a0dc, #e8b4cb)",
              color: "#1a1625",
              border: "none",
              padding: "10px 24px",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            🖨️ Print / Save PDF
          </button>
        </div>

        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#c9a0dc", margin: "0 0 4px" }}>
              {data.businessName}
            </h1>
            <p style={{ color: "#a0a0b0", fontSize: "14px", margin: "0 0 16px" }}>Revenue Statement</p>
            <div style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #c9a0dc, #e8b4cb)",
              color: "#1a1625", fontWeight: 700,
              padding: "8px 28px", borderRadius: "24px", fontSize: "15px",
            }}>
              {data.periodLabel}
            </div>
          </div>

          {/* Staff Info */}
          <div className="statement-card" style={{
            background: "#231e30", border: "1px solid #3d3550", borderRadius: "16px",
            padding: "20px 24px", marginBottom: "24px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "18px" }}>{data.staffName}</div>
              <div style={{ color: "#a0a0b0", fontSize: "13px", textTransform: "capitalize" }}>{data.staffRole}</div>
              {data.staffEmail && <div style={{ color: "#a0a0b0", fontSize: "12px", marginTop: "4px" }}>{data.staffEmail}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", color: "#a0a0b0" }}>Commission Rate</div>
              <div className="highlight-value" style={{ fontSize: "24px", fontWeight: 800, color: "#c9a0dc" }}>{data.commissionRate}%</div>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "32px" }}>
            {[
              { label: "Revenue", value: fmt(data.totals.revenue), color: "#c9a0dc", cls: "highlight-value" },
              { label: "Commission", value: fmt(data.commissionEarned), color: "#66d9a0", cls: "highlight-green" },
              { label: "Tips", value: fmt(data.totals.tips), color: "#e8b4cb", cls: "highlight-pink" },
              { label: "Total Earned", value: fmt(data.totals.earnings), color: "#c9a0dc", cls: "highlight-value" },
            ].map(kpi => (
              <div key={kpi.label} className="statement-card" style={{
                background: "#231e30", border: "1px solid #3d3550", borderRadius: "12px",
                padding: "16px", textAlign: "center",
              }}>
                <div className={kpi.cls} style={{ fontSize: "24px", fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: "11px", color: "#a0a0b0", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Itemized Table */}
          <div className="statement-card" style={{
            background: "#231e30", border: "1px solid #3d3550", borderRadius: "16px",
            padding: "24px", marginBottom: "32px", overflowX: "auto",
          }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px", paddingBottom: "12px", borderBottom: "1px solid #3d3550" }}>
              📋 Itemized Services ({data.lines.length} appointments)
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>#</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>Date</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>Time</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>Client</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>Service</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>Price</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#a0a0b0", borderBottom: "2px solid #3d3550", background: "rgba(201,160,220,0.05)" }}>Tip</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(201,160,220,0.02)" }}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840", color: "#666" }}>{i + 1}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840" }}>{line.date}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840", color: "#a0a0b0" }}>{line.time}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840" }}>{line.client}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840" }}>{line.service}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840", textAlign: "right", fontWeight: 600 }}>{fmt(line.price)}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #2d2840", textAlign: "right", color: "#e8b4cb" }}>{line.tip > 0 ? fmt(line.tip) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ padding: "12px 10px 0", borderTop: "2px solid #3d3550", fontWeight: 700, fontSize: "14px" }}>SUBTOTAL</td>
                  <td style={{ padding: "12px 10px 0", borderTop: "2px solid #3d3550", textAlign: "right", fontWeight: 800, fontSize: "14px" }}>{fmt(data.totals.revenue)}</td>
                  <td style={{ padding: "12px 10px 0", borderTop: "2px solid #3d3550", textAlign: "right", fontWeight: 800, fontSize: "14px", color: "#e8b4cb" }}>{fmt(data.totals.tips)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Earnings Summary */}
          <div className="statement-card" style={{
            background: "#231e30", border: "1px solid #3d3550", borderRadius: "16px",
            padding: "24px", marginBottom: "32px",
          }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px", paddingBottom: "12px", borderBottom: "1px solid #3d3550" }}>
              💰 Earnings Calculation
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "10px 0", color: "#a0a0b0" }}>Total Revenue Generated</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600 }}>{fmt(data.totals.revenue)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 0", color: "#a0a0b0" }}>Commission Rate</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600 }}>× {data.commissionRate}%</td>
                </tr>
                <tr style={{ borderTop: "1px solid #3d3550" }}>
                  <td className="highlight-green" style={{ padding: "10px 0", fontWeight: 600, color: "#66d9a0" }}>Commission Earned</td>
                  <td className="highlight-green" style={{ padding: "10px 0", textAlign: "right", fontWeight: 700, fontSize: "16px", color: "#66d9a0" }}>{fmt(data.commissionEarned)}</td>
                </tr>
                <tr>
                  <td className="highlight-pink" style={{ padding: "10px 0", color: "#e8b4cb" }}>Tips Received</td>
                  <td className="highlight-pink" style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, color: "#e8b4cb" }}>+ {fmt(data.totals.tips)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid #c9a0dc" }}>
                  <td className="highlight-value" style={{ padding: "14px 0 0", fontSize: "18px", fontWeight: 800, color: "#c9a0dc" }}>TOTAL EARNINGS</td>
                  <td className="highlight-value" style={{ padding: "14px 0 0", textAlign: "right", fontSize: "22px", fontWeight: 800, color: "#c9a0dc" }}>{fmt(data.totals.earnings)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", padding: "24px 0", color: "#666", fontSize: "12px" }}>
            <p style={{ margin: "0" }}>
              This statement was generated by <span style={{ color: "#c9a0dc", fontWeight: 600 }}>GlowUp</span> for {data.businessName}.
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "11px" }}>
              Generated on {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function StatementPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#1a1625" }}>
        <div style={{ textAlign: "center", color: "#a0a0b0" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>📄</div>
          <p>Loading statement...</p>
        </div>
      </div>
    }>
      <StatementContent />
    </Suspense>
  );
}
