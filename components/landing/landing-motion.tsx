'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface LandingMotionProps {
  children: ReactNode;
}

const artifactEntrances = [
  { x: -180, y: -140, rotation: -12 },
  { x: 180, y: -120, rotation: 10 },
  { x: -180, y: 20, rotation: -8 },
  { x: 180, y: 30, rotation: 12 },
  { x: -150, y: 120, rotation: -10 },
  { x: 160, y: 110, rotation: 8 },
  { x: 0, y: -170, rotation: -6 },
] as const;

export function LandingMotion({ children }: LandingMotionProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      gsap.set(root.querySelectorAll('[data-motion-reveal], [data-brand-artifact]'), {
        clearProps: 'all',
      });
      return;
    }

    const pointerCleanups: Array<() => void> = [];
    const context = gsap.context(() => {
      const heroTimeline = gsap.timeline({
        defaults: { duration: 0.8, ease: 'power3.out' },
      });

      heroTimeline
        .from('[data-hero-mark]', {
          autoAlpha: 0,
          scale: 0.72,
          rotation: -10,
          duration: 0.7,
          ease: 'back.out(1.7)',
        })
        .from('[data-hero-kicker]', { autoAlpha: 0, y: 18 }, '-=0.35')
        .from('[data-hero-word="sofi"]', { autoAlpha: 0, x: 110 }, '-=0.45')
        .from('[data-hero-word="swap"]', { autoAlpha: 0, x: -110 }, '<')
        .from('[data-hero-tagline]', { autoAlpha: 0, y: 28 }, '-=0.35')
        .from('[data-hero-copy]', { autoAlpha: 0, y: 24 }, '-=0.55')
        .from('[data-hero-actions] > *', {
          autoAlpha: 0,
          y: 20,
          stagger: 0.1,
          duration: 0.55,
        }, '-=0.5')
        .from('[data-hero-proof] > *', {
          autoAlpha: 0,
          y: 16,
          stagger: 0.08,
          duration: 0.45,
        }, '-=0.35')
        .from('[data-orderbook-preview]', {
          autoAlpha: 0,
          y: 54,
          scale: 0.97,
          duration: 0.9,
        }, '-=0.25');

      const artifacts = gsap.utils.toArray<HTMLElement>('[data-brand-artifact]');

      artifacts.forEach((artifact, index) => {
        const entrance = artifactEntrances[index] ?? artifactEntrances[0];

        gsap.fromTo(
          artifact,
          {
            autoAlpha: 0,
            x: entrance.x,
            y: entrance.y,
            rotation: entrance.rotation,
            scale: 0.55,
          },
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            rotation: 0,
            scale: 1,
            delay: 0.22 + index * 0.075,
            duration: 0.72,
            ease: 'back.out(1.45)',
          },
        );

        gsap.to(artifact, {
          y: index % 2 === 0 ? '+=10' : '-=10',
          rotation: index % 2 === 0 ? 2.5 : -2.5,
          duration: 3.2 + index * 0.23,
          delay: 1.1 + index * 0.08,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });

        const scaleTo = gsap.quickTo(artifact, 'scale', {
          duration: 0.35,
          ease: 'power3.out',
        });
        const handlePointerEnter = () => scaleTo(1.12);
        const handlePointerLeave = () => scaleTo(1);

        artifact.addEventListener('pointerenter', handlePointerEnter);
        artifact.addEventListener('pointerleave', handlePointerLeave);
        pointerCleanups.push(() => {
          artifact.removeEventListener('pointerenter', handlePointerEnter);
          artifact.removeEventListener('pointerleave', handlePointerLeave);
        });
      });

      gsap.to('[data-hero-orbit]', {
        rotation: 16,
        yPercent: 14,
        ease: 'none',
        scrollTrigger: {
          trigger: '[data-landing-hero]',
          start: 'top top',
          end: 'bottom top',
          scrub: 1.1,
        },
      });

      gsap.utils.toArray<HTMLElement>('[data-motion-section]').forEach((section) => {
        const revealItems = section.querySelectorAll('[data-motion-reveal]');

        if (!revealItems.length) return;

        gsap.from(revealItems, {
          autoAlpha: 0,
          y: 44,
          duration: 0.8,
          stagger: 0.11,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 78%',
            once: true,
          },
        });
      });
    }, root);

    const refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      window.cancelAnimationFrame(refreshFrame);
      pointerCleanups.forEach((cleanup) => cleanup());
      context.revert();
    };
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
