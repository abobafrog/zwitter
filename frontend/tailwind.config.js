/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        x: {
          bg: '#030712',
          surface: '#071426',
          panel: '#0b1630',
          elevated: '#111d3d',
          border: '#1d3a5f',
          text: '#eff8ff',
          muted: '#86a4c8',
          accent: '#22d3ee',
          'accent-hover': '#67e8f9',
          violet: '#8b5cf6',
          danger: '#fb4b8b',
          success: '#2dd4bf',
        },
      },
      boxShadow: {
        neon: '0 0 18px rgba(34, 211, 238, 0.28), 0 0 42px rgba(59, 130, 246, 0.18)',
        'neon-strong': '0 0 24px rgba(34, 211, 238, 0.42), 0 0 70px rgba(59, 130, 246, 0.28)',
        panel: '0 18px 70px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
      fontFamily: {
        sans: ['"ZwiteerChirp"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
