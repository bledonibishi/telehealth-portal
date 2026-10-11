import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../packages/loading/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0f7f5', 500: '#0f766e', 900: '#134e4a' },
        danger: { 50: '#fff1f2', 500: '#f43f5e', 900: '#881337' },
        warn: { 50: '#fffbeb', 500: '#f59e0b', 900: '#78350f' },
      },
    },
  },
  plugins: [],
};

export default config;
