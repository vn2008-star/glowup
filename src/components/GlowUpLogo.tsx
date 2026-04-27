'use client'

/**
 * GlowUp Logomark — Custom SVG logo component
 * A stylized "G" with an integrated sparkle and animated bling effects.
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
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c9a0dc" />
          <stop offset="100%" stopColor="#f0a3b5" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Subtle glow behind the G */}
      <circle cx="24" cy="24" r="16" fill={`url(#${id})`} opacity="0.08">
        <animate attributeName="opacity" values="0.05;0.12;0.05" dur="3s" repeatCount="indefinite" />
        <animate attributeName="r" values="15;17;15" dur="3s" repeatCount="indefinite" />
      </circle>

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

      {/* Main sparkle accent — top right */}
      <g filter={`url(#${id}-glow)`}>
        <path
          d="M38 6l1.2 3.6L43 11l-3.8 1.4L38 16l-1.2-3.6L33 11l3.8-1.4z"
          fill={`url(#${id})`}
        >
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
          <animateTransform
            attributeName="transform"
            type="scale"
            values="0.9;1.15;0.9"
            dur="2s"
            repeatCount="indefinite"
            additive="sum"
            calcMode="spline"
            keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
          />
        </path>
      </g>

      {/* Sparkle dot 1 — top */}
      <circle cx="43" cy="6" r="1.5" fill="#f0a3b5">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="r" values="1;2;1" dur="1.8s" repeatCount="indefinite" />
      </circle>

      {/* Sparkle dot 2 — extra bling */}
      <circle cx="44" cy="17" r="1" fill="#c9a0dc">
        <animate attributeName="opacity" values="0;0.8;0" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
        <animate attributeName="r" values="0.5;1.5;0.5" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
      </circle>

      {/* Sparkle dot 3 — lower left accent */}
      <circle cx="8" cy="34" r="1" fill="#f0a3b5">
        <animate attributeName="opacity" values="0;0.6;0" dur="3s" repeatCount="indefinite" begin="1s" />
        <animate attributeName="r" values="0.5;1.5;0.5" dur="3s" repeatCount="indefinite" begin="1s" />
      </circle>

      {/* Mini sparkle cross — bottom right */}
      <g opacity="0.5">
        <line x1="42" y1="32" x2="42" y2="36" stroke="#c9a0dc" strokeWidth="1" strokeLinecap="round">
          <animate attributeName="opacity" values="0;0.7;0" dur="2.2s" repeatCount="indefinite" begin="0.8s" />
        </line>
        <line x1="40" y1="34" x2="44" y2="34" stroke="#c9a0dc" strokeWidth="1" strokeLinecap="round">
          <animate attributeName="opacity" values="0;0.7;0" dur="2.2s" repeatCount="indefinite" begin="0.8s" />
        </line>
      </g>
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
