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

      const fitWrapperToContent = () => {
        const wrapper = containerRef.current;
        const content = contentRef.current;
        if (!wrapper || !content) return;
        wrapper.style.height = `${content.offsetHeight}px`;
      };
      fitWrapperToContent();
      ScrollTrigger.addEventListener('refresh', fitWrapperToContent);
      anchorCleanups.push(() => ScrollTrigger.removeEventListener('refresh', fitWrapperToContent));

      const scrollToHash = (hash: string) => {
        const target = document.querySelector(hash);
        if (!target) return;
        smoother?.scrollTo(target, true, 'top 72px');
        window.history.replaceState(null, '', hash);
      };

      const handleAnchorClick = (event: MouseEvent) => {
        const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
        if (!(anchor instanceof HTMLAnchorElement)) return;
        const hash = anchor.getAttribute('href');
        if (!hash || hash === '#' || !document.querySelector(hash)) return;
        event.preventDefault();
        scrollToHash(hash);
      };

      document.addEventListener('click', handleAnchorClick);
      anchorCleanups.push(() => document.removeEventListener('click', handleAnchorClick));

      if (window.location.hash && document.querySelector(window.location.hash)) {
        requestAnimationFrame(() => scrollToHash(window.location.hash));
      }
    }

    return () => {
      anchorCleanups.forEach((cleanup) => cleanup());
      smoother?.kill();
    };
  }, []);

    return (
    <div ref={containerRef} id="smooth-wrapper">
      <div ref={contentRef} id="smooth-content">
        {children}
      </div>
    </div>
  );
}
