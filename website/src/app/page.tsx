import type { Metadata } from 'next';
import HomeView from '@/components/HomeView';

export const metadata: Metadata = {
  alternates: { canonical: '/', languages: { en: '/', sq: '/sq' } },
};

export default function HomePage() {
  return <HomeView lang="en" />;
}
