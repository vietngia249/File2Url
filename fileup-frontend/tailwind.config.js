/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
        "primary": "#00D4FF",
        "secondary": "#6a1cf6",
        "surface": "#f8fafc",
        "on-surface": "#0f172a",
        "surface-container": "#ffffff",
        "outline-variant": "#e2e8f0",
        "on-surface-variant": "#64748b",
        "on-background": "#191c1d",
        "error": "#ba1a1a",
        "primary-container": "#00D4FF",
      },
      "borderRadius": {
        "DEFAULT": "0.5rem",
        "lg": "0.75rem",
        "xl": "1rem",
        "full": "9999px"
      },
      "fontFamily": {
        "headline": ["Space Grotesk", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
