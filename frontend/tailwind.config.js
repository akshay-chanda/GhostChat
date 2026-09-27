/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'media',

  theme: {
    extend: {
      screens: {
        xs: '375px',
      },

      colors: {
        bg: '#0B0F14',
        card: '#111827',
        primary: '#00D9FF',
        secondary: '#7C3AED',
        text: '#F8FAFC',
        muted: '#94A3B8',
        danger: '#EF4444',
        success: '#22C55E',
      },

      keyframes: {
        'fade-in': {
          from: {
            opacity: 0,
            transform: 'translateY(4px)',
          },
          to: {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
      },

      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
      },
    },
  },

  plugins: [],
};