'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollSmoother, ScrollTrigger);

interface ScrollSmootherWrapperProps {
  children: ReactNode;
}

export function ScrollSmootherWrapper({ children }: ScrollSmootherWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const anchorCleanups: Array<() => void> = [];
    let smoother: ScrollSmoother | undefined;

    if (containerRef.current && contentRef.current) {
      smoother = ScrollSmoother.create({
        wrapper: containerRef.current,
        content: contentRef.current,
        smooth: 0.65,
        effects: true,
        smoothTouch: 0.05,
      });

      const anchors = contentRef.current.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');

      anchors.forEach((anchor) => {
        const handleClick = (event: MouseEvent) => {
          const targetSelector = anchor.getAttribute('href');
          const target = targetSelector ? document.querySelector(targetSelector) : null;

          if (!targetSelector || targetSelector === '#' || !target) return;

          event.preventDefault();
          smoother?.scrollTo(target, true, 'top 88px');
          window.history.replaceState(null, '', targetSelector);
        };

        anchor.addEventListener('click', handleClick);
        anchorCleanups.push(() => anchor.removeEventListener('click', handleClick));
      });
    }

    return () => {
      anchorCleanups.forEach((cleanup) => cleanup());
      smoother?.kill();
    };
  }, []);

  return (
    <div ref={containerRef} id="smooth-wrapper" className="min-h-screen">
      <div ref={contentRef} id="smooth-content">
        {children}
      </div>
    </div>
  );
}
