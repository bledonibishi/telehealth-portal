import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0f9ff', 500: '#0ea5e9', 900: '#0c4a6e' },
        danger: { 50: '#fff1f2', 500: '#f43f5e', 900: '#881337' },
        warn: { 50: '#fffbeb', 500: '#f59e0b', 900: '#78350f' },
      },
    },
  },
  plugins: [],
};

export default config;
