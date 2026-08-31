/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Replace, not extend: the design system is deliberately narrow, and
    // leaving Tailwind's full palette available invites drift.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      paper: {
        DEFAULT: 'var(--paper)',
        raised: 'var(--paper-raised)',
        sunken: 'var(--paper-sunken)',
      },
      ink: {
        DEFAULT: 'var(--ink)',
        muted: 'var(--ink-muted)',
        faint: 'var(--ink-faint)',
      },
      rule: {
        DEFAULT: 'var(--rule)',
        strong: 'var(--rule-strong)',
      },
      accent: {
        DEFAULT: 'var(--accent)',
        hover: 'var(--accent-hover)',
        wash: 'var(--accent-wash)',
      },
      live: 'var(--signal-live)',
      warn: 'var(--signal-warn)',
    },
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '3px',
      full: '9999px',
    },
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4', letterSpacing: '0.14em' }],
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
