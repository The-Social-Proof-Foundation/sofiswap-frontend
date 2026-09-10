import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Footer } from '@/components/footer';
import { BrandMark } from '@/components/landing/landing-brand';
import { LandingClose } from '@/components/landing/landing-close';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingLifecycle } from '@/components/landing/landing-lifecycle';
import { LandingMarkets } from '@/components/landing/landing-markets';
import { LandingMotion } from '@/components/landing/landing-motion';
import { ScrollSmootherWrapper } from '@/components/scroll-smoother';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <>
      <div className="landing-grain" aria-hidden />
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-[color-mix(in_srgb,var(--background)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto grid h-[4.5rem] max-w-[90rem] grid-cols-[1fr_auto] items-center px-5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex w-fit items-center gap-3" aria-label="SofiSwap home">
            <BrandMark className="size-9" />
            <span className="text-xl font-semibold tracking-[-0.04em]">SofiSwap</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#markets" className="transition-colors hover:text-foreground">Markets</a>
            <a href="#social-proof" className="transition-colors hover:text-foreground">Social proof</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          </nav>

          <Button asChild size="sm" className="justify-self-end rounded-full bg-[var(--primary)] px-5 text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 active:scale-[0.98]">
            <Link href="/trade">
              Open exchange <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <ScrollSmootherWrapper>
        <LandingMotion>
          <main className="min-h-[100dvh] overflow-x-hidden bg-[var(--background)] pt-[4.5rem] font-satoshi text-[var(--foreground)]">
            <LandingHero />
            <LandingMarkets />
            <LandingLifecycle />
            <LandingClose />
            <Footer />
          </main>
        </LandingMotion>
      </ScrollSmootherWrapper>
    </>
  );
}
