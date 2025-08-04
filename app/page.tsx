"use client"

import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { useTheme } from "next-themes"
import { ScrollSmootherWrapper } from "@/components/scroll-smoother"
import { Footer } from "@/components/footer"
import { EmailSignup } from "@/components/email-signup"
import { HeroBadge } from "@/components/ui/hero-badge"
import { Sparkle } from "lucide-react"
import Image from "next/image"

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const { theme } = useTheme()
  const sofiRef = useRef<HTMLSpanElement>(null)
  const swapRef = useRef<HTMLSpanElement>(null)
  
  // Refs for floating images
  const item1Ref = useRef<HTMLDivElement>(null)
  const item2Ref = useRef<HTMLDivElement>(null)
  const item3Ref = useRef<HTMLDivElement>(null)
  const item4Ref = useRef<HTMLDivElement>(null)
  const item5Ref = useRef<HTMLDivElement>(null)
  const item6Ref = useRef<HTMLDivElement>(null)
  const item7Ref = useRef<HTMLDivElement>(null)
  
  const imageRefs = [item1Ref, item2Ref, item3Ref, item4Ref, item5Ref, item6Ref, item7Ref]
  
  // Pre-determined positions for floating images
  const getImagePositions = (): Array<{ x: number; y: number }> => {
    // Responsive positioning based on screen size
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const scaleFactor = isMobile ? 0.6 : 1
    
    return [
      { x: -440 * scaleFactor, y: -220 * scaleFactor }, // Top left
      { x: 420 * scaleFactor, y: -260 * scaleFactor },   // Top right
      { x: -320 * scaleFactor, y: -400 * scaleFactor },   // Top left
      { x: 460 * scaleFactor, y: -40 * scaleFactor },   // Mid right
      { x: -400 * scaleFactor, y: 0 * scaleFactor },  // Bottom left
      { x: 260 * scaleFactor, y: -425 * scaleFactor },    // Top right
      { x: 0 * scaleFactor, y: -460 * scaleFactor }    // Top center
    ]
  }

  // Set launch date (30 days from now for demo)
  const launchDate = new Date()
  launchDate.setDate(launchDate.getDate() + 30)
  
  // Theme-aware image sources
  const getImageSrc = (itemNumber: number): string => {
    const isDark = theme === 'dark'
    return isDark ? `/item${itemNumber}-light.png` : `/item${itemNumber}.png`
  }
  
  // Handle mounting for theme access
  useEffect(() => {
    setMounted(true)
  }, [])

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
    
    // Floating images animation
    const positions = getImagePositions()
    const validRefs = imageRefs.filter(ref => ref.current)
    
    if (validRefs.length > 0) {
      // Set initial positions (off-screen with consistent directions)
      const startPositions = [
        { x: -600, y: -600 }, // Top left approach
        { x: 600, y: -400 },  // Top right approach
        { x: -700, y: 0 },    // Left approach
        { x: 700, y: 0 },     // Right approach
        { x: -500, y: 500 },  // Bottom left approach
        { x: 500, y: 500 },   // Bottom right approach
        { x: 0, y: -650 }      // Top center approach
      ]
      
      validRefs.forEach((ref, index) => {
        if (ref.current && startPositions[index]) {
          gsap.set(ref.current, {
            x: startPositions[index].x,
            y: startPositions[index].y,
            opacity: 0,
            scale: 0.5,
            rotation: 0
          })
        }
      })
      
      // Create staggered spring animation timeline
      const imageTl = gsap.timeline()
      
      validRefs.forEach((ref, index) => {
        if (ref.current && positions[index]) {
          imageTl.to(ref.current, {
            x: positions[index].x,
            y: positions[index].y,
            opacity: 1.0,
            scale: 1,
            rotation: 0,
            duration: 0.4,
            ease: "back.out(1.4)",
            onComplete: () => {
              // Add hover effects after animation completes
              if (ref.current) {
                const element = ref.current
                
                const handleMouseEnter = () => {
                  gsap.to(element, {
                    scale: 1.25,
                    rotation: (Math.random() - 0.5) * 35,
                    duration: 0.3,
                    ease: "back.out(1.7)"
                  })
                }
                
                const handleMouseLeave = () => {
                  gsap.to(element, {
                    scale: 1,
                    rotation: 0,
                    duration: 0.3,
                    ease: "back.out(1.7)"
                  })
                }
                
                element.addEventListener('mouseenter', handleMouseEnter)
                element.addEventListener('mouseleave', handleMouseLeave)
              }
            }
          }, index * 0.08) // Stagger by 0.08 seconds
        }
      })
      
      // Start floating images animation after text animation
      imageTl.delay(0.3)
    }
  }, [mounted, theme]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="relative flex-1 flex flex-col items-center justify-center text-center max-w-4xl mx-auto min-h-[75vh]">
            {/* Coming Soon Badge */}
            <div className="mb-14">
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
            <h1 className="relative z-10 font-satoshi text-7xl md:text-8xl lg:text-9xl font-bold mb-2 md:mb-6 text-foreground leading-tight">
              <span ref={sofiRef} className="inline-block">Sofi</span>
              <span ref={swapRef} className="inline-block">Swap</span>
            </h1>

            <p className="relative z-10 font-satoshi text-sm md:text-base font-medium text-[var(--secondary-foreground)] mb-12 mt-2 max-w-md md:max-w-lg mx-auto leading-relaxed">
              We&apos;re building the fastest and most fun SocialFi + InfoFi decentralized exchange for Social Proof Tokens and MyIP.
            </p>

            {/* Countdown Timer */}
            {/* <div className="mb-12">
              <CountdownTimer targetDate={launchDate} />
            </div> */}

            {/* Email Signup */}
            <div className="mb-[25vh]">
              <EmailSignup />
            </div>
            
            {/* Floating Images */}
            <div className="absolute inset-0 pointer-events-none z-0">
              <div 
                ref={item1Ref} 
                className="absolute w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(1) : "/item1.png"}
                  alt="Floating item 1"
                  width={64}
                  height={64}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
              
              <div 
                ref={item2Ref} 
                className="absolute w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(2) : "/item2.png"}
                  alt="Floating item 2"
                  width={80}
                  height={80}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
              
              <div 
                ref={item3Ref} 
                className="absolute w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(3) : "/item3.png"}
                  alt="Floating item 3"
                  width={64}
                  height={64}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
              
              <div 
                ref={item4Ref} 
                className="absolute w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(4) : "/item4.png"}
                  alt="Floating item 4"
                  width={80}
                  height={80}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
              
              <div 
                ref={item5Ref} 
                className="absolute w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(5) : "/item5.png"}
                  alt="Floating item 5"
                  width={72}
                  height={72}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
              
              <div 
                ref={item6Ref} 
                className="absolute w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(6) : "/item6.png"}
                  alt="Floating item 6"
                  width={72}
                  height={72}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
              
              <div 
                ref={item7Ref} 
                className="absolute hidden sm:block w-10 h-10 sm:w-14 sm:h-14 md:w-18 md:h-18 pointer-events-auto cursor-pointer opacity-0 hover:opacity-90 transition-opacity"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              >
                <Image
                  src={mounted ? getImageSrc(7) : "/item7.png"}
                  alt="Floating item 7"
                  width={72}
                  height={72}
                  className="w-full h-full object-contain drop-shadow-sm"
                  priority={false}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <Footer />
        </div>
      </main>
    </ScrollSmootherWrapper>
  )
}