import styles from "./calendar.module.css";

export default function CalendarLoading() {
  return (
    <div className={styles.page}>
      {/* Header skeleton */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div style={{ width: 120, height: 28, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div className={styles.dateNav}>
            <div style={{ width: 32, height: 32, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
            <div style={{ width: 200, height: 20, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: 32, height: 32, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
          </div>
        </div>
        <div className={styles.headerRight}>
          <div style={{ width: 70, height: 36, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ width: 180, height: 36, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }} />
          <div style={{ width: 140, height: 36, background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)' }} />
        </div>
      </div>

      {/* Week grid skeleton */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        {/* Staff filter bar skeleton */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}>
          {[80, 90, 70, 85].map((w, i) => (
            <div key={i} style={{
              width: w,
              height: 30,
              background: 'var(--bg-muted)',
              borderRadius: 'var(--radius-full)',
              animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite`,
            }} />
          ))}
        </div>

        {/* Grid skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)' }}>
          {/* Time axis */}
          <div style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div style={{ height: 64, borderBottom: '1px solid var(--border-subtle)' }} />
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} style={{ height: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8 }}>
                <div style={{ width: 32, height: 12, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', marginTop: 2, animation: `pulse 1.5s ease-in-out ${i * 0.05}s infinite` }} />
              </div>
            ))}
          </div>
          {/* Day columns */}
          {Array.from({ length: 7 }, (_, dayIdx) => (
            <div key={dayIdx} style={{ borderRight: dayIdx < 6 ? '1px solid var(--border-subtle)' : 'none' }}>
              {/* Header */}
              <div style={{
                height: 64,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
              }}>
                <div style={{ width: 28, height: 10, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)' }} />
                <div style={{ width: 24, height: 20, background: 'var(--bg-muted)', borderRadius: 'var(--radius-sm)', animation: `pulse 1.5s ease-in-out ${dayIdx * 0.1}s infinite` }} />
              </div>
              {/* Body with fake appointment blocks */}
              <div style={{ position: 'relative', height: 540 }}>
                {/* Hour lines */}
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 60, height: 1, background: 'var(--border-subtle)' }} />
                ))}
                {/* Fake appointment blocks */}
                {dayIdx % 2 === 0 && (
                  <div style={{
                    position: 'absolute',
                    left: 2,
                    right: 2,
                    top: (dayIdx * 30 + 60),
                    height: 80,
                    background: 'var(--bg-muted)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--bg-muted)',
                    animation: `pulse 1.5s ease-in-out ${dayIdx * 0.15}s infinite`,
                  }} />
                )}
                {dayIdx % 3 === 1 && (
                  <div style={{
                    position: 'absolute',
                    left: 2,
                    right: 2,
                    top: (dayIdx * 20 + 180),
                    height: 60,
                    background: 'var(--bg-muted)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--bg-muted)',
                    animation: `pulse 1.5s ease-in-out ${dayIdx * 0.15}s infinite`,
                  }} />
                )}
              </div>
            </div>
          ))}
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
