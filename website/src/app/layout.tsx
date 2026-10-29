import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import ReferralCapture from '@/components/ReferralCapture';
import Analytics from '@/components/Analytics';
import ConsentBanner from '@/components/ConsentBanner';
import { SITE_URL } from '@/lib/site';

const TITLE = 'Omo Pharmacy – Doctor-led menopause, weight and men’s health care';
const DESCRIPTION =
  'Licensed clinicians. Prescription treatment only if your doctor decides it is right for you. Free delivery to Kosovo. Check your eligibility in about 5 minutes.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // What a shared link shows in WhatsApp, Facebook, Messages and the like.
  openGraph: { type: 'website', siteName: 'Omo Pharmacy', title: TITLE, description: DESCRIPTION, url: '/', images: [{ url: '/omo-logo.png', width: 320, height: 320, alt: 'Omo Pharmacy' }] },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION, images: ['/omo-logo.png'] },
};

// Downloaded when the site is built and served from our own domain, so a visit sends nothing to Google (no consent
// or disclosure needed for it). The variables feed --f-head and --f-body in globals.css.
const outfit = Outfit({ subsets: ['latin', 'latin-ext'], weight: 'variable', display: 'swap', variable: '--font-outfit' });
const inter = Inter({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-inter' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>
        <ReferralCapture />
        <Analytics />
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
