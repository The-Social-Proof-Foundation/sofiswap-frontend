"use client"

import { useState, useEffect } from "react"
import { AnimatedThemeToggle } from "@/components/animated-theme-toggle"
import { useTheme } from "next-themes"
import Image from "next/image"
import Link from "next/link"

export function Footer() {
  const [mounted, setMounted] = useState(false)
  const { theme } = useTheme()
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  const logoSrc = theme !== 'dark' ? '/logo_dark.svg' : '/logo_light.svg'

  return (
    <footer className="bg-card border-t border-border">
      <div className="w-full pt-8 pb-4 px-8">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 lg:mb-12">
          {/* Left side - Logo and subtitle */}
          <div className="flex flex-col space-y-4 mb-12 lg:mb-0 items-center lg:items-start lg:flex-shrink-0">
            <Link href="/" className="flex items-center space-x-4 group justify-center lg:justify-start">
              <div className="w-8 h-8 flex items-center justify-center">
                {mounted ? (
                  <Image 
                    src={logoSrc}
                    alt="SofiSwap Logo"
                    width={32}
                    height={32}
                    className="w-8 h-8"
                  />
                ) : (
                  <div className="w-8 h-8" />
                )}
              </div>
              <span className="hidden font-satoshi font-semibold lg:inline text-2xl font-semibold transition-all text-[var(--foreground)]">
                SofiSwap
              </span>
            </Link>
            <p className="text-xs font-satoshi text-[var(--secondary-foreground)] max-w-[340px] text-center lg:text-left">
              We&apos;re creating the leading SocialFi + InfoFi decentralized exchange for Social Proof Tokens.
            </p>
          </div>

          {/* Right side - Link sections and Social */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 lg:gap-16 pt-5 sm:pt-0 text-[var(--foreground)]">
            {/* Resources */}
            <div className="mb-6 sm:mb-12 lg:mb-0">
              <p className="text-xs text-muted-foreground text-center lg:text-left mb-3 lg:mb-5 pb-2 border-b border-muted w-1/2 sm:w-full mx-auto sm:mx-0">Resources</p>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:space-y-2 text-sm">
                {['Vision', 'FAQ'].map((link) => (
                  <Link 
                    key={link}
                    href={`/${link.toLowerCase()}`}
                    className="transition-colors duration-300 hover:underline hover:text-foreground text-center lg:text-left w-full"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>

            {/* Social */}
             <div className="mb-6 sm:mb-12 lg:mb-0 text-[var(--foreground)]">
               <p className="text-xs text-muted-foreground text-center lg:text-left mb-3 lg:mb-5 pb-2 border-b border-muted w-1/2 sm:w-full mx-auto sm:mx-0">Social</p>
               <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:space-y-2 text-sm justify-items-center sm:items-center lg:items-start">
                 <Link 
                   href="https://t.me/sofiswap_xyz"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
                     <title>Telegram</title>
                     <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
                   </svg>
                   Telegram
                 </Link>

                 <Link 
                   href="https://x.com/sofiswap_xyz"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px] fill-current">
                     <title>X</title>
                     <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
                   </svg>
                   <span className="flex items-end gap-2">
                     X <span className="text-xs text-muted-foreground">(Twitter)</span>
                   </span>
                 </Link>
               </div>
             </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="relative flex flex-col sm:flex-row sm:justify-between items-center">
             {/* Left side - Theme Toggle */}
             <div className="pb-6 sm:pb-0 order-1 sm:order-1">
               <AnimatedThemeToggle />
             </div>

             {/* Center - Terms and Privacy - Mobile: centered, Desktop: absolutely centered */}
             <div className="flex flex-col items-center sm:absolute sm:left-1/2 sm:transform sm:-translate-x-1/2 order-2 sm:order-2">
               <div className="flex gap-4 text-xs mb-2 md:mb-0 translate-y-0 md:translate-y-2">
                 <Link href="https://docs.google.com/document/d/1qxKECZAOfgaZxl49Y3PhP9oAxB1yOsKJLasPEU-b6GY/" className="hover:underline text-[var(--secondary)] transition-colors duration-300 font-medium hover:font-semibold">
                   Terms of Service
                 </Link>
                 <Link href="https://docs.google.com/document/d/1_lFu0GsqmcsyiuKrlGF-RBz6nd4Gm3vGluxhALiXYQA/" className="hover:underline text-[var(--secondary)] transition-colors duration-300 font-medium hover:font-semibold">
                   Privacy Policy
                 </Link>
               </div>

               {/* Mobile: Show copyright info centered below terms */}
               <div className="text-center sm:hidden">
                 <Link href="https://socialproof.foundation" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--secondary)] hover:underline hover:font-medium block">
                   The Social Proof Foundation, LLC.
                 </Link>
                 <p className="text-xs text-[var(--secondary)]">
                   © Copyright {new Date().getFullYear()}. All Rights Reserved.
                 </p>
               </div>
             </div>

             {/* Right side - Copyright info (Desktop only) */}
             <div className="hidden sm:flex sm:flex-col sm:items-end order-3 sm:order-3">
               <Link href="https://socialproof.foundation" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--secondary)] hover:underline hover:font-medium block">
                 The Social Proof Foundation, LLC.
               </Link>
               <p className="text-xs text-[var(--secondary)]">
                 © Copyright {new Date().getFullYear()}. All Rights Reserved.
               </p>
             </div>
          </div>
        </div>
      </div>
    </footer>
  )
} 