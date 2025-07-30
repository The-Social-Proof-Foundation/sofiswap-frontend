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
    Cookies.set('cookieConsent', 'true', { expires: 365 })
    setIsVisible(false)
  }

  const getMessage = () => {
    switch (region) {
      case 'EU':
        return "This website uses cookies to enhance your browsing experience and analyze our traffic. By clicking 'Accept', you consent to the our Privacy Policy in accordance with GDPR requirements.";
      default:
        return "We use cookies to enhance your browsing experience and analyze our traffic.";
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
          className="fixed bottom-4 md:bottom-6 left-4 right-4 md:right-6 md:left-auto z-50 max-w-[500px] md:max-w-[400px] mx-auto md:mx-0 border border-[var(--border)] rounded-lg shadow-[0_6px_16px_rgba(0,0,0,0.15)]"
        >
          <div className="bg-[var(--background-transparent)] backdrop-blur supports-[backdrop-filter]:bg-[var(--background-transparent)] rounded-lg p-4 flex items-center justify-between gap-4">
            <Button 
              onClick={handleAccept}
              className="whitespace-nowrap"
            >
              {region === 'EU' ? 'Accept' : 'Okay'}
            </Button>
            <p className="text-sm text-[var(--primary)]">
              {getMessage()}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
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