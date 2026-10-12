export const CONFIG = {
  API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? '',
  STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  // Patient portal (the `web` app) — where new patients set their password.
  PORTAL_URL: process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3000',
  // Mobile app store links; the badges stay hidden until these are set.
  APP_STORE_URL: process.env.NEXT_PUBLIC_APP_STORE_URL ?? '',
  PLAY_STORE_URL: process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '',
  CONTACT: {
    email: 'primaverahealthcare@gmail.com',
    phones: [
      { label: 'Phone (Kosovo)', number: '+383 49 696 967' },
      { label: 'Phone (Germany)', number: '+49 177 4014024' },
    ],
    whatsapp: '+49 177 4014024',
  },
  PLANS: {
    // Internal keys stay HRT_STARTER / HRT_COMPLETE (they're in links and saved checkouts);
    // patients see the plan by what it contains.
    HRT_STARTER: {
      product: 'HRT' as const,
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_OESTROGEN ?? process.env.NEXT_PUBLIC_STRIPE_PRICE_HRT_STARTER ?? 'price_REPLACE_HRT_STARTER',
      name: 'Oestrogen only',
      desc: 'For women without a womb (after a hysterectomy)',
      price: '€39',
      per: '/mo',
    },
    HRT_COMPLETE: {
      product: 'HRT' as const,
      priceId:
        process.env.NEXT_PUBLIC_STRIPE_PRICE_OESTROGEN_PROGESTERONE ??
        process.env.NEXT_PUBLIC_STRIPE_PRICE_HRT_COMPLETE ??
        'price_REPLACE_HRT_COMPLETE',
      name: 'Oestrogen + progesterone',
      desc: 'Complete HRT for women with a womb',
      price: '€59',
      per: '/mo',
    },
    GLP1_STARTER: {
      product: 'GLP1' as const,
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GLP1_STARTER ?? 'price_REPLACE_GLP1_STARTER',
      name: 'GLP-1 Starter',
      desc: 'Starting doses while your body adjusts',
      // Fallback only: each GLP-1 dose shows its own price from Stripe.
      price: '€149',
      per: '/mo',
    },
    GLP1_ADVANCED: {
      product: 'GLP1' as const,
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_GLP1_ADVANCED ?? 'price_REPLACE_GLP1_ADVANCED',
      name: 'GLP-1 Advanced',
      desc: 'Higher maintenance doses',
      price: '€239',
      per: '/mo',
    },
    TRT_STANDARD: {
      product: 'TRT' as const,
      priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TRT_STANDARD ?? 'price_REPLACE_TRT_STANDARD',
      name: 'TRT Standard',
      desc: 'Testosterone replacement therapy',
      // Set the real monthly price here (it must match the Stripe price above).
      price: process.env.NEXT_PUBLIC_PRICE_TRT_STANDARD ?? '£—',
      per: '/mo',
    },
  },
  MEDICATIONS: { wegovy: 'Wegovy', mounjaro: 'Mounjaro', ozempic: 'Ozempic' } as Record<string, string>,
  IMAGES: {
    hero: 'https://images.unsplash.com/photo-1624486217002-846e654ac969?auto=format&fit=crop&w=1400&q=80',
    bmi: 'https://images.unsplash.com/photo-1534180477871-5d6cc81f3920?auto=format&fit=crop&w=1200&q=80',
    products: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1200&q=80',
    contact: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=1200&q=80',
    'p-hrt-starter': 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80',
    'p-hrt-complete': 'https://images.unsplash.com/photo-1576426863848-c21f53c60b19?auto=format&fit=crop&w=800&q=80',
    'p-wegovy': 'https://images.unsplash.com/photo-1745939921744-ba8ef27940bf?auto=format&fit=crop&w=800&q=80',
    'p-mounjaro': 'https://images.unsplash.com/photo-1745939912168-cc7333d65327?auto=format&fit=crop&w=800&q=80',
    'p-ozempic': 'https://images.unsplash.com/photo-1745940369366-330f0159720d?auto=format&fit=crop&w=800&q=80',
  } as Record<string, string>,
};

export type PlanKey = keyof typeof CONFIG.PLANS;
export type ProductKind = 'HRT' | 'GLP1' | 'TRT';
