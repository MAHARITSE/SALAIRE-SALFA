/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        salfa: {
          dark: '#1A365D',
          light: '#E2E8F0',
          teal: '#2B6CB0',
          accent: '#2F855A',
          danger: '#C53030'
        }
      }
    },
  },
  plugins: [],
}
