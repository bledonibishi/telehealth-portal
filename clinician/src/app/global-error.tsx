'use client';

// Replaces the whole app (layout and translations included) when the root layout itself fails, so it carries its own
// <html> and styles and is written in the portal's default language with English underneath.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="sq">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#1b2f5c', color: '#f1f5f9', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Diçka shkoi keq</h1>
          <p style={{ color: '#cbd5e1', fontSize: 14, marginBottom: 20 }}>Something went wrong. Please try again.</p>
          <button onClick={reset} style={{ background: '#0ea5e9', color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Provo përsëri · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
