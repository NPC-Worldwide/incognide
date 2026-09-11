/** @type {import('tailwindcss').Config} */
// Tailwind resolves these globs from the repository root, which is where vite
// is invoked. They mirror tailwind.config.js, plus the evidence harness itself.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./tests/evidence/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
