import type { Metadata } from 'next';
import HomeView from '@/components/HomeView';
import HtmlLang from '@/components/HtmlLang';
import { DICT } from '@/lib/i18n';

export const metadata: Metadata = {
  title: DICT.sq.meta.title,
  description: DICT.sq.meta.description,
  alternates: { canonical: '/sq', languages: { en: '/', sq: '/sq' } },
  openGraph: { locale: 'sq_AL', title: DICT.sq.meta.title, description: DICT.sq.meta.description, url: '/sq' },
};

export default function AlbanianHomePage() {
  return (
    <>
      <HtmlLang lang="sq" />
      <HomeView lang="sq" />
    </>
  );
}
