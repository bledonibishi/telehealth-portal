import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Telehealth Portal — Clinician',
  description: 'CQC-regulated HRT / GLP-1 clinician portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the inline script below, before first paint, so the page never flashes the wrong mode.
    // lang is the default language (see DEFAULT_LOCALE); the i18n provider changes it when the reader has chosen another.
    <html lang="sq" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('clinician.theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
