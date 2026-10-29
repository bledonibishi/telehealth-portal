'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import PortalLink from '@/components/PortalLink';
import { BagIcon } from './icons';
import { categoriesOf, useBasket, useShopProducts } from '@/lib/shop';

/** The shop's own header: its logo, the categories, the basket, and the way back to the clinic site. */
export default function ShopHeader() {
  const { products } = useShopProducts();
  const categories = products ? categoriesOf(products) : [];
  const pathname = usePathname();
  const active = useSearchParams().get('category');
  const onList = pathname === '/shop';

  return (
    <header className="sh-header">
      <div className="sh-header-inner">
        <Link href="/shop" className="sh-brand" aria-label="Omo Shop home">
          <img src="/omo-logo.png?v=3" alt="" width={40} height={40} />
          <span className="sh-brand-name">Omo</span>
          <span className="sh-brand-tag">Shop</span>
        </Link>

        <nav className="sh-cats" aria-label="Categories">
          <Link href="/shop#products" className={onList && !active ? 'is-on' : undefined}>All products</Link>
          {categories.map((c) => (
            <Link key={c} href={`/shop?category=${encodeURIComponent(c)}#products`} className={onList && active === c ? 'is-on' : undefined}>{c}</Link>
          ))}
        </nav>

        <div className="sh-actions">
          <PortalLink href="/" theme="clinic" className="sh-back">
            <span aria-hidden="true">←</span> <span className="sh-back-text">Omo Pharmacy</span>
          </PortalLink>
          <BasketButton />
        </div>
      </div>
    </header>
  );
}

function BasketButton() {
  const [basket] = useBasket();
  const count = basket.reduce((n, l) => n + l.quantity, 0);
  const [bump, setBump] = useState(false);
  const previous = useRef(count);

  // The count gives a small jump when something is added.
  useEffect(() => {
    if (count > previous.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 450);
      previous.current = count;
      return () => clearTimeout(t);
    }
    previous.current = count;
  }, [count]);

  return (
    <Link href="/shop/checkout" className="sh-basket" aria-label={`Basket, ${count} item${count === 1 ? '' : 's'}`}>
      <BagIcon />
      <span className="sh-basket-text">Basket</span>
      {count > 0 && <span className={`sh-basket-count${bump ? ' is-bump' : ''}`}>{count}</span>}
    </Link>
  );
}
