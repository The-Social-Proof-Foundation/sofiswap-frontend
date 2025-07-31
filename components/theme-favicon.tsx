'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'

export default function ThemeFavicon() {
  const { theme } = useTheme()

  useEffect(() => {
    const favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link')
    favicon.type = 'image/svg+xml'
    favicon.rel = 'icon'
    favicon.href = '/logo_light.svg'
    if (theme === 'dark') {
      favicon.href = '/logo_dark.svg'
    } else if (theme === 'light') {
      favicon.href = '/logo_light.svg'
    } else {
      favicon.href = '/logo_light.svg'
    }

    document.head.appendChild(favicon)
  }, [theme])

  return null
} 