import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Primavera Healthcare – HRT & GLP-1 Treatment Online',
  description:
    'Licensed clinicians. Registered HRT and GLP-1 weight-loss medications. Free delivery to Kosovo. Start your 2-minute eligibility assessment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
