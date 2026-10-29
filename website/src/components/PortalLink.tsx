'use client';

import Link from 'next/link';
import { goThroughPortal, type PortalTheme } from '@/lib/portal';

/**
 * A link that crosses between the clinic site and the shop with the portal transition. Opening it in a new tab
 * (Cmd/Ctrl/middle click) works as a normal link.
 */
export default function PortalLink({ href, theme, className, children, ...rest }: { href: string; theme: PortalTheme; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        // From the click, or from the middle of the link when it was opened with the keyboard.
        const x = e.clientX || box.left + box.width / 2;
        const y = e.clientY || box.top + box.height / 2;
        goThroughPortal({ href, x, y, theme });
      }}
    >
      {children}
    </Link>
  );
}
