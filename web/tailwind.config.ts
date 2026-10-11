import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../packages/loading/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdf9', 100: '#ccfbef', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 900: '#134e4a' },
        // The portal's ink: near-black for headings and primary buttons, the sign-in screen's teal for links, accents and
        // tinted backgrounds (50-700).
        ink: { 50: '#f0f7f5', 100: '#dcebe7', 500: '#2a9d8f', 600: '#0f766e', 700: '#115e59', 800: '#1c2321', 900: '#111514', 950: '#0b0f0e' },
        // The page behind the cards: a warm off-white rather than a cool grey.
        surface: '#f7f7f4',
        danger: { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 900: '#881337' },
      },
    },
  },
  plugins: [],
};

export default config;
