import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { LEGAL, LEGAL_REVIEWED } from '@/lib/legal';

export const metadata: Metadata = {
  title: `${LEGAL.sq.privacy.title} – Omo Pharmacy`,
  // Kept out of search results until a lawyer has approved the text (see LEGAL_REVIEWED in lib/legal).
  robots: LEGAL_REVIEWED ? undefined : { index: false, follow: true },
};

export default function Page() {
  return <LegalPage lang="sq" doc="privacy" />;
}
