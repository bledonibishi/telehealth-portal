'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ProductCard from '@/components/shop/ProductCard';
import { GiftIcon, LeafIcon, PlusIcon, ShieldIcon, TruckIcon } from '@/components/shop/icons';
import { COUNTRY_NAMES, addToBasketAndTell, categoriesOf, money, shopApi, useShopProducts, type ShopOptions, type ShopProduct } from '@/lib/shop';

function ShopHome() {
  const { products, error } = useShopProducts();
  const [options, setOptions] = useState<ShopOptions | null>(null);
  const category = useSearchParams().get('category');

  useEffect(() => {
    shopApi.options().then(setOptions, () => undefined);
  }, []);

  const inStock = products?.filter((p) => p.inStock) ?? [];
  // The first product on sale (by its order in the portal) is the one in the spotlight.
  const spotlight = inStock[0] ?? null;
  const heroProducts = inStock.slice(0, 3);
  const categories = products ? categoriesOf(products) : [];
  const shown = products?.filter((p) => !category || p.category === category) ?? null;
  const freeFrom = options?.freeShippingFromCents ?? null;
  const delivering = options ? options.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(', ') : 'Kosovo';

  return (
    <>
      <section className="sh-hero">
        <div className="sh-hero-inner">
          <div className="sh-hero-copy sh-rise">
            <span className="sh-eyebrow"><LeafIcon size={16} /> No prescription needed</span>
            <h1>Everyday health essentials, <em>delivered</em>.</h1>
            <p>Protein, vitamins, minerals and more. Order in a few taps, pay securely by card, and we bring it to your door across {delivering}.</p>
            <div className="sh-hero-ctas">
              <a href="#products" className="sh-btn sh-btn-primary">Shop all products</a>
              {freeFrom !== null && <span className="sh-hero-note"><TruckIcon size={18} /> Free delivery from {money(freeFrom)}</span>}
            </div>
          </div>
          <div className="sh-hero-visual" aria-hidden="true">
            <div className="sh-orbit o1" />
            <div className="sh-orbit o2" />
            <div className="sh-orbit o3" />
            {heroProducts.map((p, i) => (
              <Link key={p.id} href={`/shop/${p.slug}`} tabIndex={-1} className={`sh-float f${i + 1}`}>
                <span className="sh-float-img" style={p.imageUrl ? { backgroundImage: `url(${JSON.stringify(p.imageUrl)})` } : undefined} />
                <span className="sh-float-name">{p.name}</span>
                <span className="sh-float-price">{money(p.priceCents, p.currency)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sh-trust" aria-label="Why shop with us">
        <div className="sh-trust-item sh-rise" style={{ animationDelay: '80ms' }}><LeafIcon /><div><strong>No prescription</strong><span>Everyday products, ready to order</span></div></div>
        <div className="sh-trust-item sh-rise" style={{ animationDelay: '140ms' }}><ShieldIcon /><div><strong>Secure card payment</strong><span>Visa and Mastercard, with your bank’s approval</span></div></div>
        <div className="sh-trust-item sh-rise" style={{ animationDelay: '200ms' }}><TruckIcon /><div><strong>Delivered to your door</strong><span>Across {delivering}</span></div></div>
        <div className="sh-trust-item sh-rise" style={{ animationDelay: '260ms' }}><GiftIcon /><div><strong>{freeFrom !== null ? `Free delivery from ${money(freeFrom)}` : 'Order updates by email'}</strong><span>{freeFrom !== null ? 'Added up at checkout' : 'From payment to your door'}</span></div></div>
      </section>

      {spotlight && <Spotlight product={spotlight} />}

      <section id="products" className="sh-section">
        <div className="sh-section-head">
          <div>
            <span className="sh-eyebrow">The range</span>
            <h2>{category ?? 'All products'}</h2>
          </div>
          {categories.length > 1 && (
            <div className="sh-chips" role="list">
              <Link href="/shop#products" role="listitem" className={`sh-chip${!category ? ' is-on' : ''}`}>All</Link>
              {categories.map((c) => (
                <Link key={c} href={`/shop?category=${encodeURIComponent(c)}#products`} role="listitem" className={`sh-chip${category === c ? ' is-on' : ''}`}>{c}</Link>
              ))}
            </div>
          )}
        </div>

        {error && <div className="sh-alert" role="alert">{error}</div>}
        {!shown && !error && (
          <div className="sh-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="sh-card sh-card-skel" />)}</div>
        )}
        {shown && shown.length === 0 && <p className="sh-empty">New products are on their way. Please check back soon.</p>}
        {shown && shown.length > 0 && (
          <div className="sh-grid" key={category ?? 'all'}>
            {shown.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </section>
    </>
  );
}

function Spotlight({ product: p }: { product: ShopProduct }) {
  const [added, setAdded] = useState(false);
  return (
    <section className="sh-spotlight sh-rise" style={{ animationDelay: '200ms' }}>
      <Link href={`/shop/${p.slug}`} className="sh-spot-media" aria-label={p.name}>
        <span style={p.imageUrl ? { backgroundImage: `url(${JSON.stringify(p.imageUrl)})` } : undefined} />
      </Link>
      <div className="sh-spot-copy">
        <span className="sh-eyebrow">In the spotlight</span>
        <h2>{p.name}</h2>
        {p.description && <p>{p.description.split('\n')[0]}</p>}
        <div className="sh-spot-buy">
          <span className="sh-spot-price">{money(p.priceCents, p.currency)}</span>
          <button type="button" className="sh-btn sh-btn-primary" onClick={() => { addToBasketAndTell(p); setAdded(true); }}>
            {added ? 'Added ✓' : <><PlusIcon size={16} /> Add to basket</>}
          </button>
          <Link href={`/shop/${p.slug}`} className="sh-link">See details →</Link>
        </div>
      </div>
    </section>
  );
}

export default function ShopPage() {
  return (
    <Suspense>
      <ShopHome />
    </Suspense>
  );
}
