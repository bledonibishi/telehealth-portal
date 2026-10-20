import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    // Checkout, review and the test page are steps in a patient's own session, not pages to find in a search.
    rules: { userAgent: '*', allow: '/', disallow: ['/checkout', '/review', '/test-checkout'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
