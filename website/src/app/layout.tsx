import type { Metadata } from 'next';
import './globals.css';
import ReferralCapture from '@/components/ReferralCapture';
import Analytics from '@/components/Analytics';

export const metadata: Metadata = {
  title: 'Omo Pharmacy – Doctor-led menopause, weight and men’s health care',
  description:
    'Licensed clinicians. Prescription treatment only if your doctor decides it is right for you. Free delivery to Kosovo. Check your eligibility in about 5 minutes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400..700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ReferralCapture />
        <Analytics />
        {children}
      </body>
    </html>
  );
}
