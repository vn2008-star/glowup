import styles from "./overview.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.overview}>
      {/* Greeting skeleton */}
      <div className={styles.greeting}>
        <div>
          <div style={{ width: 280, height: 32, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 200, height: 18, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', animation: 'pulse 1.5s ease-in-out 0.1s infinite' }} />
        </div>
        <div style={{ width: 180, height: 20, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
      </div>

      {/* KPI Cards skeleton */}
      <div className={styles.metricsGrid}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`card ${styles.metricCard}`}>
            <div style={{ width: 40, height: 40, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite` }} />
            <div className={styles.metricInfo}>
              <div style={{ width: 100, height: 14, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginBottom: 6 }} />
              <div style={{ width: 60, height: 24, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite` }} />
              <div style={{ width: 80, height: 12, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Schedule + Right Column skeleton */}
      <div className={styles.mainGrid}>
        <div className={`card ${styles.scheduleCard}`}>
          <div className={styles.cardHeader}>
            <div style={{ width: 140, height: 22, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
            <div style={{ width: 100, height: 16, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 48, height: 16, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: `${60 + i * 10}%`, height: 14, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginBottom: 4, animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite` }} />
                <div style={{ width: '40%', height: 12, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
              </div>
              <div style={{ width: 64, height: 22, background: 'var(--bg-muted)', borderRadius: 'var(--radius-full)' }} />
            </div>
          ))}
        </div>

        <div className={styles.rightCol}>
          <div className={`card ${styles.recentCard}`}>
            <div style={{ width: 120, height: 22, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }} />
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-muted)', animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite` }} />
                <div>
                  <div style={{ width: 100, height: 14, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }} />
                  <div style={{ width: 80, height: 12, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
