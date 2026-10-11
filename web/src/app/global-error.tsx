'use client';

// Replaces the whole app (layout included) when the root layout itself fails, so it carries its own <html> and styles.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#111514', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#475569', fontSize: 14, marginBottom: 20 }}>Please try again. If it keeps happening, contact us and we’ll help.</p>
          <button onClick={reset} style={{ background: '#0f766e', color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
