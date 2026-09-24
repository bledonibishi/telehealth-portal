import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdf9', 100: '#ccfbef', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 900: '#134e4a' },
        danger: { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 900: '#881337' },
      },
    },
  },
  plugins: [],
};

export default config;
