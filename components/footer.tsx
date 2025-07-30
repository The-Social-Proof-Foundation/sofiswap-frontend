"use client"

import { AnimatedThemeToggle } from "@/components/animated-theme-toggle"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="w-full pt-8 pb-4 px-8">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 lg:mb-12">
          {/* Left side - Logo and subtitle */}
          <div className="flex flex-col space-y-4 mb-12 lg:mb-0 items-center lg:items-start lg:flex-shrink-0">
            <Link href="/" className="flex items-center space-x-4 group justify-center lg:justify-start">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <div className="w-5 h-5 bg-background rounded"></div>
              </div>
              <span className="hidden lg:inline text-xl font-semibold transition-all">
                Your Company Name
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-[340px] text-center lg:text-left">
              We&apos;re crafting an extraordinary experience that will revolutionize the way you think about digital innovation.
            </p>
          </div>

          {/* Right side - Link sections and Social */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-16 pt-5 sm:pt-0">
            {/* Quick Links */}
            <div className="mb-6 sm:mb-12 lg:mb-0">
              <p className="text-xs text-muted-foreground text-center lg:text-left mb-3 lg:mb-5 pb-2 border-b border-muted w-1/2 sm:w-full mx-auto sm:mx-0">Quick Links</p>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:space-y-2 text-sm">
                {['Home', 'About', 'Features', 'Pricing', 'Contact'].map((link) => (
                  <Link 
                    key={link}
                    href={link === 'Home' ? '/' : `/${link.toLowerCase()}`}
                    className="transition-colors duration-300 hover:underline hover:text-foreground text-center lg:text-left w-full"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div className="mb-6 sm:mb-12 lg:mb-0">
              <p className="text-xs text-muted-foreground text-center lg:text-left mb-3 lg:mb-5 pb-2 border-b border-muted w-1/2 sm:w-full mx-auto sm:mx-0">Resources</p>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:space-y-2 text-sm">
                {['Documentation', 'API', 'Support', 'Blog', 'Community'].map((link) => (
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
             <div className="mb-6 sm:mb-12 lg:mb-0">
               <p className="text-xs text-muted-foreground text-center lg:text-left mb-3 lg:mb-5 pb-2 border-b border-muted w-1/2 sm:w-full mx-auto sm:mx-0">Social</p>
               <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:space-y-2 text-sm justify-items-center sm:items-center lg:items-start">
                 <Link 
                   href="https://github.com/yourcompany"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
                     <title>GitHub</title>
                     <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                   </svg>
                   GitHub
                 </Link>

                 <Link 
                   href="https://t.me/yourcompany"
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
                   href="https://x.com/yourcompany"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px] fill-current">
                     <title>X</title>
                     <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
                   </svg>
                   <span className="flex items-end gap-2">
                     X <span className="text-xs text-muted-foreground mb-1">(Twitter)</span>
                   </span>
                 </Link>

                 <Link 
                   href="https://medium.com/@yourcompany"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 -55 256 256" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
                     <title>Medium</title>
                     <path d="M72.2009141,1.42108547e-14 C112.076502,1.42108547e-14 144.399375,32.5485469 144.399375,72.6964154 C144.399375,112.844284 112.074049,145.390378 72.2009141,145.390378 C32.327779,145.390378 0,112.844284 0,72.6964154 C0,32.5485469 32.325326,1.42108547e-14 72.2009141,1.42108547e-14 Z M187.500628,4.25836743 C207.438422,4.25836743 223.601085,34.8960455 223.601085,72.6964154 L223.603538,72.6964154 C223.603538,110.486973 207.440875,141.134463 187.503081,141.134463 C167.565287,141.134463 151.402624,110.486973 151.402624,72.6964154 C151.402624,34.9058574 167.562834,4.25836743 187.500628,4.25836743 Z M243.303393,11.3867175 C250.314,11.3867175 256,38.835526 256,72.6964154 C256,106.547493 250.316453,134.006113 243.303393,134.006113 C236.290333,134.006113 230.609239,106.554852 230.609239,72.6964154 C230.609239,38.837979 236.292786,11.3867175 243.303393,11.3867175 Z" />
                   </svg>
                   Medium
                 </Link>

                 <Link 
                   href="https://tiktok.com/@yourcompany"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
                     <title>TikTok</title>
                     <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                   </svg>
                   TikTok
                 </Link>

                 <Link 
                   href="https://youtube.com/@yourcompany"
                   className="transition-colors duration-300 hover:underline hover:text-foreground flex gap-2 justify-center lg:justify-start w-full"
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                   <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current">
                     <title>YouTube</title>
                     <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                   </svg>
                   YouTube
                 </Link>
               </div>
             </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-col sm:flex-row sm:justify-between items-center">
             {/* Left side - Theme Toggle */}
             <div className="pb-4 sm:pb-0">
               <AnimatedThemeToggle />
             </div>

             {/* Center - Terms and Privacy */}
             <div className="flex flex-col items-center sm:flex-1">
               <div className="flex gap-6 text-xs mb-2">
                 <Link href="/terms" className="hover:underline text-primary transition-colors duration-300">
                   Terms of Service
                 </Link>
                 <Link href="/privacy" className="hover:underline text-primary transition-colors duration-300">
                   Privacy Policy
                 </Link>
               </div>

               <p className="text-xs text-muted-foreground">
                 © Copyright {new Date().getFullYear()}. All Rights Reserved.
               </p>
             </div>

             {/* Right side - Empty space for balance */}
             <div className="w-10 h-10 invisible sm:visible">
             </div>
          </div>
        </div>
      </div>
    </footer>
  )
} 