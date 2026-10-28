'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ProductCard from '@/components/shop/ProductCard';
import { LeafIcon, ShieldIcon, TruckIcon } from '@/components/shop/icons';
import { addToBasketAndTell, money, shopApi, useShopProducts, type ShopProduct } from '@/lib/shop';

export default function ShopProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { products } = useShopProducts();

  useEffect(() => {
    setProduct(null);
    setQuantity(1);
    setAdded(false);
    shopApi.product(slug).then(setProduct, (e: Error) => setError(e.message));
  }, [slug]);

  // Others from the same category first, then anything else on sale.
  const related = product && products
    ? [...products.filter((p) => p.id !== product.id && p.inStock && p.category === product.category), ...products.filter((p) => p.id !== product.id && p.inStock && p.category !== product.category)].slice(0, 4)
    : [];

  const add = () => {
    if (!product) return;
    addToBasketAndTell(product, quantity);
    setAdded(true);
  };

  return (
    <div className="sh-page">
      <nav className="sh-crumbs" aria-label="Breadcrumb">
        <Link href="/shop">Shop</Link>
        {product?.category && <><span aria-hidden="true">/</span><Link href={`/shop?category=${encodeURIComponent(product.category)}#products`}>{product.category}</Link></>}
        {product && <><span aria-hidden="true">/</span><span>{product.name}</span></>}
      </nav>

      {error && <div className="sh-alert" role="alert">{error}</div>}
      {!product && !error && <div className="sh-pdp sh-pdp-skel" />}

      {product && (
        <div className="sh-pdp">
          <div className="sh-pdp-media sh-rise">
            <span style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl)})` } : undefined} role="img" aria-label={product.name} />
          </div>
          <div className="sh-pdp-info sh-rise" style={{ animationDelay: '120ms' }}>
            <div className="sh-pdp-tags">
              {product.category && <span className="sh-tag">{product.category}</span>}
              {product.brand && <span className="sh-pdp-brand">{product.brand}</span>}
            </div>
            <h1>{product.name}</h1>
            <div className="sh-pdp-price">{money(product.priceCents, product.currency)}</div>
            {product.description && <p className="sh-pdp-desc">{product.description}</p>}

            {product.inStock ? (
              <div className="sh-pdp-buy">
                <div className="sh-qty" aria-label="Quantity">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="One fewer">−</button>
                  <span aria-live="polite">{quantity}</span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(product.maxQuantity, q + 1))} disabled={quantity >= product.maxQuantity} aria-label="One more">+</button>
                </div>
                <button type="button" className="sh-btn sh-btn-primary sh-grow" onClick={add}>{added ? 'Added ✓ Add more' : 'Add to basket'}</button>
                <button type="button" className="sh-btn sh-btn-ghost sh-grow" onClick={() => { addToBasketAndTell(product, quantity); router.push('/shop/checkout'); }}>Buy now</button>
              </div>
            ) : (
              <div className="sh-alert sh-alert-soft">Out of stock for now. Please check back soon.</div>
            )}

            <ul className="sh-assure">
              <li><LeafIcon size={18} /> No prescription needed</li>
              <li><ShieldIcon size={18} /> Secure card payment, approved by your bank</li>
              <li><TruckIcon size={18} /> Delivered to your door, with updates by email</li>
            </ul>
          </div>
        </div>
      )}

      {related.length > 0 && (
        <section className="sh-section sh-related">
          <div className="sh-section-head"><div><span className="sh-eyebrow">More to explore</span><h2>You may also like</h2></div></div>
          <div className="sh-grid">{related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
        </section>
      )}
    </div>
  );
}
