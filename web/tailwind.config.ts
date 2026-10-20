import type { Config } from 'tailwindcss';

// The Omo Pharmacy identity, the same as the website's: a deep teal ring, lavender and a leaf green, from the logo.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../packages/loading/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The brand teal: buttons, links, the active menu item.
        brand: { 50: '#e6f3f1', 100: '#cde7e3', 500: '#1e8a82', 600: '#0c6f6a', 700: '#095550', 900: '#0a3836' },
        // The portal's ink: deep teal-black for headings and dark surfaces, the brand teal for links and accents (500-700),
        // mint tints for backgrounds (50-100).
        ink: { 50: '#eef5f3', 100: '#d9eae6', 500: '#2a9d8f', 600: '#0c6f6a', 700: '#095550', 800: '#0a3836', 900: '#082d2b', 950: '#061f1e' },
        // The logo's two other colours, for programme accents and gentle highlights.
        lav: { 50: '#f2edf9', 100: '#e6dcf3', 500: '#9a7fc4', 700: '#6b4fa0' },
        leaf: { 50: '#ecf5e2', 100: '#d8ebc4', 500: '#7cb451', 700: '#4e8a2b' },
        // The page behind the cards: a whisper of mint rather than grey.
        surface: '#f5f8f7',
        danger: { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 900: '#881337' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'Outfit', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        // The logo's ring, teal into lavender into leaf green.
        ring: 'linear-gradient(120deg,#0c6f6a 0%,#0c6f6a 38%,#9a7fc4 60%,#7cb451 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
