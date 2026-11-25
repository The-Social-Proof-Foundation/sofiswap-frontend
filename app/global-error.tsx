'use client';

/**
 * Last-resort boundary: catches failures in the root layout itself, so it must render its
 * own <html> and <body>. Styles are inlined minimally because the layout's providers
 * (theme, network) may be exactly what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2c302e',
          color: '#9AE19D',
          fontFamily: 'Satoshi, system-ui, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>
            SofiSwap could not start
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85, margin: '0 0 16px' }}>
            The application shell failed to load. Reloading usually resolves this.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 11, opacity: 0.6, margin: '0 0 16px' }}>Ref: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(154,225,157,0.4)',
              background: '#9AE19D',
              color: '#2c302e',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
