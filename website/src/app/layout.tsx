import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Telehealth — Clinically backed treatments',
  description: 'Evidence-based HRT and GLP-1 weight management, prescribed by UK-registered clinicians.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
