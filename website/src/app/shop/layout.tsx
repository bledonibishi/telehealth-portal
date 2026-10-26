import { Suspense } from 'react';
import type { Metadata } from 'next';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';
import AddedToast from '@/components/shop/AddedToast';

const TITLE = 'Omo Shop – Everyday health essentials, delivered';
const DESCRIPTION = 'Protein, vitamins, minerals and everyday essentials. No prescription needed. Pay securely by card and we deliver across Kosovo.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'Omo Shop', title: TITLE, description: DESCRIPTION, url: '/shop', images: [{ url: '/omo-logo.png', width: 320, height: 320, alt: 'Omo Shop' }] },
};

/** The shop is its own place: its own header and footer, none of the clinic site's navigation. */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sh-root">
      <Suspense fallback={<div className="sh-header" />}>
        <ShopHeader />
      </Suspense>
      <div className="sh-main">{children}</div>
      <ShopFooter />
      <AddedToast />
    </div>
  );
}
