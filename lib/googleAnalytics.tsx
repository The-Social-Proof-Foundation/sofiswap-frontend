'use client';

import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import Script from 'next/script';

import { COOKIE_CONSENT_CHANGE_EVENT } from '@/components/cookie-consent';

/**
 * Analytics is opt-in: it only loads after the visitor accepts, and it never loads on
 * `/auth/callback`, whose URL carries the OAuth `code`/`state`/`nonce` (and, on the
 * broadcast-fallback path, tokens) that must not reach a third-party endpoint.
 */
const CONSENT_COOKIE = 'cookieConsent';

function isSuppressedPath(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback');
}

function hasAnalyticsConsent(): boolean {
  return Cookies.get(CONSENT_COOKIE) === 'true';
}

export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!measurementId || isSuppressedPath()) return;

    const sync = () => setEnabled(hasAnalyticsConsent());
    sync();

    const onConsentChange = () => sync();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
  }, [measurementId]);

  if (!measurementId || !enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${measurementId}', {
            page_path: window.location.pathname + window.location.search,
          });
        `}
      </Script>
    </>
  );
}
