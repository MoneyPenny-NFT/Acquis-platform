/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pos: {
          bg:      '#04111F',
          surface: '#06182A',
          card:    '#081C2E',
          border:  '#1A3A52',
          accent:  '#02C39A',
          success: '#22D48F',
          error:   '#F07070',
          muted:   '#8AABBC',
          dim:     '#B8CDD9',
          text:    '#F2F6F8',
          gold:    '#D4AC50',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'slide-up':   'slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        'pop-in':     'pop-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        'fade-in':    'fade-in 0.2s ease-out',
        'check-draw': 'check-draw 0.6s ease-out 0.15s both',
        'pulse-teal': 'pulse-teal 2.5s ease-in-out infinite',
        'pulse-gold': 'pulse-gold 2.5s ease-in-out infinite',
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(20px)', opacity: '0' },
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
        'pulse-teal': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(2,195,154,0.45)' },
          '50%':      { boxShadow: '0 0 0 7px rgba(2,195,154,0)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,172,80,0.45)' },
          '50%':      { boxShadow: '0 0 0 7px rgba(212,172,80,0)' },
        },
      },
      boxShadow: {
        'teal-glow': '0 0 20px rgba(2,195,154,0.25)',
        'gold-glow': '0 0 20px rgba(212,172,80,0.25)',
        'card':      '0 4px 24px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
