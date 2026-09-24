/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas:      '#0d1117',
        surface:     '#161b22',
        card:        '#21262d',
        elevated:    '#2d333b',
        border:      '#30363d',
        borderhover: '#484f58',
        text:        '#e6edf3',
        muted:       '#8b949e',
        subtle:      '#6e7681',
        sos: {
          50:  '#fff5f5',
          100: '#fed7d7',
          200: '#fc8181',
          300: '#fc5c65',
          400: '#e53e3e',
          500: '#c53030',
          600: '#9b2c2c',
        },
        ok: {
          100: '#c6f6d5',
          300: '#68d391',
          400: '#48bb78',
          500: '#38a169',
          600: '#276749',
        },
        warn: {
          300: '#f6ad55',
          400: '#ed8936',
          500: '#dd6b20',
        },
        info: {
          300: '#76e4f7',
          400: '#4fd1c5',
          500: '#2c7a7b',
        },
        neon: {
          green: '#39d353',
          red:   '#ff7b72',
          blue:  '#58a6ff',
          amber: '#e3b341',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Arial', 'sans-serif'],
        mono: ['SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      fontSize: {
        'micro': ['11px', { lineHeight: '1.3', letterSpacing: '0.10em' }],
        'caption': ['13px', { lineHeight: '1.45', letterSpacing: '-0.005em' }],
        'body': ['15px', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        'subhead': ['17px', { lineHeight: '1.4', letterSpacing: '-0.015em' }],
        'header': ['22px', { lineHeight: '1.25', letterSpacing: '-0.025em' }],
        'section': ['clamp(24px, 3.2vw, 34px)', { lineHeight: '1.15', letterSpacing: '-0.035em' }],
        'hero': ['clamp(32px, 4.5vw, 48px)', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        sm:    '4px',
        DEFAULT:'6px',
        md:    '6px',
        lg:    '8px',
        xl:    '10px',
        '2xl': '12px',
        '3xl': '16px',
      },
      boxShadow: {
        'glow-red':   '0 0 16px rgba(229,62,62,0.5)',
        'glow-green': '0 0 12px rgba(72,187,120,0.35)',
        'glow-blue':  '0 0 12px rgba(88,166,255,0.3)',
        'card':       '0 1px 3px rgba(0,0,0,0.5)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(0.8)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(229,62,62,0.5)' },
          '50%':      { boxShadow: '0 0 22px rgba(229,62,62,1)' },
        },
        'ticker-scroll': {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'pulse-dot':     'pulse-dot 1.5s ease-in-out infinite',
        'glow':          'glow-pulse 2s ease-in-out infinite',
        'ticker':        'ticker-scroll 30s linear infinite',
        'slide-in':      'slide-in 0.2s ease-out',
        'spin-slow':     'spin-slow 3s linear infinite',
      },
    },
  },
  plugins: [],
};
