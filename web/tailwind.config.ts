import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdf9', 100: '#ccfbef', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 900: '#134e4a' },
        // The portal's navy: the sidebar, headings and primary buttons.
        ink: { 50: '#eef3fc', 100: '#dbe6fa', 500: '#3563c9', 600: '#1f4fb8', 700: '#173d93', 800: '#132f6f', 900: '#0f2352', 950: '#0b1a3d' },
        danger: { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 900: '#881337' },
      },
    },
  },
  plugins: [],
};

export default config;
