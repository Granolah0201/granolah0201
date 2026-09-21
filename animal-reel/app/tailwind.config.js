/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07090d', 900: '#0b0f14', 800: '#131923', 700: '#1c2533', 600: '#2a3648' },
        accent: { DEFAULT: '#f59e0b', soft: '#fbbf24' },
        mint: { DEFAULT: '#2dd4bf' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
