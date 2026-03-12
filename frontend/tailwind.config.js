/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        x: {
          bg: '#000000',
          surface: '#16181c',
          border: '#2f3336',
          text: '#e7e9ea',
          muted: '#71767b',
          accent: '#1d9bf0',
          'accent-hover': '#1a8cd8',
          danger: '#f4212e',
          success: '#00ba7c',
        },
      },
      fontFamily: {
        sans: ['"TwitterChirp"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
