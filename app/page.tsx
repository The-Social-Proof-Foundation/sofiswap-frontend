"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { ScrollSmootherWrapper } from "@/components/scroll-smoother"
import { Footer } from "@/components/footer"
import { EmailSignup } from "@/components/email-signup"
import { HeroBadge } from "@/components/ui/hero-badge"
import { Sparkle } from "lucide-react"

export default function Home() {
  const sofiRef = useRef<HTMLSpanElement>(null)
  const swapRef = useRef<HTMLSpanElement>(null)

  // Set launch date (30 days from now for demo)
  const launchDate = new Date()
  launchDate.setDate(launchDate.getDate() + 30)

  useEffect(() => {
    // Crossing animation for Sofi and Swap
    if (sofiRef.current && swapRef.current) {
      // Set initial positions: Sofi starts from right, Swap starts from left (they cross over)
      gsap.set(sofiRef.current, { x: 150, opacity: 0 })
      gsap.set(swapRef.current, { x: -150, opacity: 0 })

      // Create timeline for synchronized animation
      const tl = gsap.timeline()

      // Animate both words crossing each other to their final positions
      tl.to(sofiRef.current, {
        x: 0,
        opacity: 1,
        duration: 0.65,
        ease: "power3.out"
      })
      .to(swapRef.current, {
        x: 0,
        opacity: 1,
        duration: 0.65,
        ease: "power3.out"
      }, "<") // Start at the same time as the previous animation
    }
  }, [])

  return (
    <ScrollSmootherWrapper>
      <main className="min-h-screen relative overflow-hidden">
        {/* Background */}
        <div className="fixed inset-0 bg-[var(--background)]" />

        {/* Main Content */}
        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Logo/Brand Area - Fixed at top */}
          <div className="mt-[5vh] mb-16 text-center">
            <div className="w-20 h-20 mx-auto bg-primary rounded-lg flex items-center justify-center">
              <div className="w-12 h-12 bg-background rounded"></div>
            </div>
          </div>
          
          {/* Main Content - Centered */}
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto min-h-[75vh]">
            {/* Coming Soon Badge */}
            <div className="mb-8">
              <HeroBadge
                href=""
                text="Coming Soon"
                endIcon={<Sparkle className="ml-2 w-4 h-4 arrow-icon text-[var(--badge)]" />}
                variant="default"
                size="md"
                className="shadow-lg shadow-black/20 hero-badge text-[var(--badge)]"
            />
            </div>

            {/* Hero Text */}
            <h1 className="font-satoshi text-7xl md:text-8xl lg:text-9xl font-bold mb-2 md:mb-6 text-foreground leading-tight">
              <span ref={sofiRef} className="inline-block">Sofi</span>
              <span ref={swapRef} className="inline-block">Swap</span>
            </h1>

            <p className="font-satoshi text-sm md:text-base font-medium text-[var(--secondary-foreground)] mb-12 mt-2 max-w-md md:max-w-lg mx-auto leading-relaxed">
              We&apos;re building the fastest and most fun SocialFi + InfoFi decentralized exchange for Social Proof Tokens.
            </p>

            {/* Countdown Timer */}
            {/* <div className="mb-12">
              <CountdownTimer targetDate={launchDate} />
            </div> */}

            {/* Email Signup */}
            <div className="mb-[25vh]">
              <EmailSignup />
            </div>
          </div>

          {/* Footer */}
          <Footer />
        </div>
      </main>
    </ScrollSmootherWrapper>
  )
}