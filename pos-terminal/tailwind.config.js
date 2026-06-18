/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pos: {
          bg:      '#0a0f1e',
          surface: '#111827',
          card:    '#1a2234',
          border:  '#1e2d45',
          accent:  '#38bdf8',
          success: '#4ade80',
          error:   '#f87171',
          muted:   '#64748b',
          dim:     '#94a3b8',
          gold:    '#f59e0b',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'slide-up':   'slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        'pop-in':     'pop-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-in':    'fade-in 0.2s ease-out',
        'check-draw': 'check-draw 0.6s ease-out 0.15s both',
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(16px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        'pop-in': {
          '0%':   { transform: 'scale(0.85)', opacity: '0' },
          '80%':  { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'check-draw': {
          from: { strokeDashoffset: '100' },
          to:   { strokeDashoffset: '0' },
        },
      },
    },
  },
  plugins: [],
};
