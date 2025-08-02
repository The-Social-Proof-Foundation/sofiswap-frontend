"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { ScrollSmootherWrapper } from "@/components/scroll-smoother"
import { Footer } from "@/components/footer"
import { EmailSignup } from "@/components/email-signup"
import { HeroBadge } from "@/components/ui/hero-badge"
import { Sparkle } from "lucide-react"

export default function Home() {
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Set launch date (30 days from now for demo)
  const launchDate = new Date()
  launchDate.setDate(launchDate.getDate() + 30)

  useEffect(() => {
    // Initial hero animation
    if (titleRef.current) {
      gsap.set(titleRef.current, { y: 100, opacity: 0 })
      gsap.to(titleRef.current, {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: "power3.out"
      })
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
                endIcon={<Sparkle className="ml-2 w-4 h-4 arrow-icon text-[var(--foreground)]" />}
                variant="default"
                size="md"
                className="shadow-lg shadow-black/20 hero-badge text-[var(--foreground)]"
            />
            </div>

            {/* Hero Text */}
            <h1 ref={titleRef} className="font-satoshi text-6xl md:text-7xl lg:text-9xl font-bold mb-2 md:mb-6 text-foreground leading-tight">
              SofiSwap
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