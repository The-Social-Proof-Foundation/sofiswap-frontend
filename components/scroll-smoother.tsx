'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollSmoother, ScrollTrigger)

interface ScrollSmootherWrapperProps {
  children: React.ReactNode
}

export function ScrollSmootherWrapper({ children }: ScrollSmootherWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let smoother: ScrollSmoother

    if (containerRef.current && contentRef.current) {
      smoother = ScrollSmoother.create({
        wrapper: containerRef.current,
        content: contentRef.current,
        smooth: 1.05,
        effects: true,
        smoothTouch: 0.1,
      })
    }

    return () => {
      if (smoother) {
        smoother.kill()
      }
    }
  }, [])

  return (
    <div ref={containerRef} id="smooth-wrapper" className="min-h-screen">
      <div ref={contentRef} id="smooth-content">
        {children}
      </div>
    </div>
  )
}