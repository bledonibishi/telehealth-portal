'use client';

import { useState } from 'react';
import Link from 'next/link';
import { addToBasketAndTell, money, type ShopProduct } from '@/lib/shop';
import { CheckIcon, PlusIcon } from './icons';

export default function ProductCard({ product: p, index = 0 }: { product: ShopProduct; index?: number }) {
  const [added, setAdded] = useState(false);
  const add = () => {
    addToBasketAndTell(p);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className={`sh-card${p.inStock ? '' : ' is-out'}`} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <Link href={`/shop/${p.slug}`} className="sh-card-media" aria-label={p.name}>
        <span className="sh-card-img" style={p.imageUrl ? { backgroundImage: `url(${JSON.stringify(p.imageUrl)})` } : undefined} />
        {p.category && <span className="sh-card-cat">{p.category}</span>}
        {!p.inStock && <span className="sh-card-out">Out of stock</span>}
      </Link>
      <div className="sh-card-body">
        {p.brand && <div className="sh-card-brand">{p.brand}</div>}
        <Link href={`/shop/${p.slug}`} className="sh-card-name">{p.name}</Link>
        <div className="sh-card-foot">
          <span className="sh-card-price">{money(p.priceCents, p.currency)}</span>
          {p.inStock && (
            <button type="button" className={`sh-add${added ? ' is-added' : ''}`} onClick={add} aria-label={`Add ${p.name} to basket`}>
              {added ? <CheckIcon /> : <PlusIcon />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
