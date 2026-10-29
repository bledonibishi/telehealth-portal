import type { Metadata } from 'next';
import HomeView from '@/components/HomeView';
import HtmlLang from '@/components/HtmlLang';
import { DICT } from '@/lib/i18n';

export const metadata: Metadata = {
  title: DICT.sq.meta.title,
  description: DICT.sq.meta.description,
  alternates: { canonical: '/sq', languages: { en: '/', sq: '/sq' } },
  // A page's openGraph replaces the layout's whole object, so the site name and image are repeated here.
  openGraph: {
    type: 'website',
    siteName: 'Omo Pharmacy',
    locale: 'sq_AL',
    title: DICT.sq.meta.title,
    description: DICT.sq.meta.description,
    url: '/sq',
    images: [{ url: '/omo-logo.png', width: 320, height: 320, alt: 'Omo Pharmacy' }],
  },
  twitter: { card: 'summary', title: DICT.sq.meta.title, description: DICT.sq.meta.description, images: ['/omo-logo.png'] },
};

export default function AlbanianHomePage() {
  return (
    <>
      <HtmlLang lang="sq" />
      <HomeView lang="sq" />
    </>
  );
}
