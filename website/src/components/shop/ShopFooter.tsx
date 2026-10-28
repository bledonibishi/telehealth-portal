import Link from 'next/link';
import PortalLink from '@/components/PortalLink';
import { CONFIG } from '@/lib/config';

export default function ShopFooter() {
  return (
    <footer className="sh-footer">
      <div className="sh-footer-inner">
        <div className="sh-footer-brand">
          <div className="sh-brand">
            <img src="/omo-logo.png?v=3" alt="" width={36} height={36} />
            <span className="sh-brand-name">Omo</span>
            <span className="sh-brand-tag">Shop</span>
          </div>
          <p>Everyday health essentials, delivered. Everything here is sold without a prescription.</p>
        </div>
        <div className="sh-footer-col">
          <div className="sh-footer-title">Shop</div>
          <Link href="/shop#products">All products</Link>
          <Link href="/shop/checkout">Basket</Link>
        </div>
        <div className="sh-footer-col">
          <div className="sh-footer-title">Help</div>
          <a href={`mailto:${CONFIG.CONTACT.email}`}>{CONFIG.CONTACT.email}</a>
          <PortalLink href="/" theme="clinic">Omo Pharmacy</PortalLink>
        </div>
      </div>
      <div className="sh-footer-bottom">© {new Date().getFullYear()} Omo Pharmacy · Card payments are processed securely by our payment provider. We never see or store your card details.</div>
    </footer>
  );
}
