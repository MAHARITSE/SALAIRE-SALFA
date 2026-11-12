/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff8f5', 100: '#d9eee6', 200: '#b4ddcf', 300: '#83c3af',
          400: '#4da58d', 500: '#268a72', 600: '#147861', 700: '#0e6351',
          800: '#104f43', 900: '#123f37', 950: '#10352f',
        },
        salfa: {
          dark: '#1A365D',
          light: '#E2E8F0',
          teal: '#2B6CB0',
          accent: '#2F855A',
          danger: '#C53030'
        }
      },
      screens: {
        'xs': '360px',
        '3xl': '1920px',
      },
      maxWidth: {
        'screen-3xl': '1920px',
      }
    },
  },
  plugins: [],
}
