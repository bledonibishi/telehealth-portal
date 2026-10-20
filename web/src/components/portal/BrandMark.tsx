/* eslint-disable @next/next/no-img-element */

/** The Omo Pharmacy logo and name, as on the website. `tone="light"` for dark backgrounds. */
export function BrandMark({ size = 32, tone = 'dark', className = '', textClassName = 'text-[17px]' }: { size?: number; tone?: 'dark' | 'light'; className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/omo-logo.png" alt="" width={size} height={size} className={tone === 'light' ? 'brightness-[1.6] saturate-[0.9]' : ''} style={{ width: size, height: size }} />
      <span className={`font-display font-semibold tracking-tight ${textClassName} ${tone === 'light' ? 'text-white' : 'text-ink-800'}`}>
        Omo <span className={tone === 'light' ? 'text-leaf-100' : 'text-brand-600'}>Pharmacy</span>
      </span>
    </span>
  );
}
