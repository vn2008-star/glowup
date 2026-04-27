'use client'

/**
 * GlowUp Logomark — Custom SVG logo component
 * A stylized "G" with an integrated sparkle, rendered in the brand gradient.
 */
export function GlowUpLogo({ size = 24 }: { size?: number }) {
  const id = `glowup-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GlowUp logo"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c9a0dc" />
          <stop offset="100%" stopColor="#f0a3b5" />
        </linearGradient>
      </defs>

      {/* Outer G arc */}
      <path
        d="M38 24c0 7.732-6.268 14-14 14s-14-6.268-14-14S16.268 10 24 10c3.5 0 6.7 1.28 9.16 3.4"
        stroke={`url(#${id})`}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {/* G crossbar */}
      <path
        d="M38 24H26"
        stroke={`url(#${id})`}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Sparkle accent — top right */}
      <path
        d="M38 6l1.2 3.6L43 11l-3.8 1.4L38 16l-1.2-3.6L33 11l3.8-1.4z"
        fill={`url(#${id})`}
      />

      {/* Small sparkle dot */}
      <circle cx="43" cy="6" r="1.5" fill="#f0a3b5" opacity="0.6" />
    </svg>
  );
}

/** Text logo with logomark */
export function GlowUpWordmark({ size = 24 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <GlowUpLogo size={size} />
      <span>GlowUp</span>
    </span>
  );
}
