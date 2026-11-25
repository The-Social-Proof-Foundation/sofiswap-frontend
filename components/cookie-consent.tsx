'use client'

import { useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from 'framer-motion'

export function CookieConsent() {
  const [showConsent, setShowConsent] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [region, setRegion] = useState<'EU' | 'US' | 'OTHER'>('OTHER')

  useEffect(() => {
    const checkConsent = async () => {
      const hasConsented = Cookies.get('cookieConsent') === 'true';
      if (hasConsented) {
        setShowConsent(false);
        return;
      }
      const { isRequired, region } = await checkIfInRequiredRegion();
      setShowConsent(isRequired && !hasConsented);
      setRegion(region);
    };
    
    checkConsent();
  }, [])

  const handleAccept = () => {
    Cookies.set('cookieConsent', 'true', { expires: 365, sameSite: 'lax' })
    notifyConsentChange('true')
    setIsVisible(false)
  }

  const handleReject = () => {
    Cookies.set('cookieConsent', 'false', { expires: 365, sameSite: 'lax' })
    notifyConsentChange('false')
    setIsVisible(false)
  }

  const getMessage = () => {
    switch (region) {
      case 'EU':
        return "This website uses cookies to enhance your browsing experience and analyze our traffic. You can accept or decline analytics cookies; declining still lets you use SofiSwap."
      default:
        return "We use cookies to enhance your browsing experience and analyze our traffic."
    }
  }

  if (!showConsent) return null

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.16 }}
          onAnimationComplete={() => {
            if (!isVisible) {
              setShowConsent(false)
            }
          }}
          role="dialog"
          aria-label="Cookie consent"
          className="fixed bottom-4 md:bottom-6 left-4 right-4 md:right-6 md:left-auto z-50 max-w-[500px] md:max-w-[400px] mx-auto md:mx-0 border border-border rounded-lg shadow-[0_6px_16px_rgba(0,0,0,0.15)]"
        >
          {/* Solid surface: the previous `--background-transparent` token was never defined,
              so consent copy rendered directly on top of page content. */}
          <div className="bg-background/[0.97] backdrop-blur-xl supports-[backdrop-filter]:bg-background/90 rounded-lg p-4">
            <p className="text-sm text-foreground">
              {getMessage()}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={handleAccept} className="whitespace-nowrap">
                {region === 'EU' ? 'Accept' : 'Okay'}
              </Button>
              <Button
                onClick={handleReject}
                variant="outline"
                className="whitespace-nowrap"
              >
                Decline
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Broadcasts the consent decision so analytics can react without a page reload. */
export const COOKIE_CONSENT_CHANGE_EVENT = 'sofiswap-cookie-consent-change'

export function notifyConsentChange(value: 'true' | 'false'): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: value }))
}

async function checkIfInRequiredRegion(): Promise<{ isRequired: boolean; region: 'EU' | 'US' | 'OTHER' }> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    
    // EU/EEA countries (GDPR)
    const euRegions = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU',
      'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
      'GB', // UK (UK GDPR)
    ];

    if (euRegions.includes(data.country_code)) {
      return { isRequired: true, region: 'EU' };
    }

    if (data.country_code === 'US') {
      const statesRequiringNotice = ['CA', 'VA', 'CO', 'CT', 'UT', 'TX'];
      return { 
        isRequired: statesRequiringNotice.includes(data.region_code),
        region: 'US'
      };
    }

    return { isRequired: false, region: 'OTHER' };
  } catch (error) {
    console.error('Error checking region:', error);
    return { isRequired: true, region: 'OTHER' };
  }
}