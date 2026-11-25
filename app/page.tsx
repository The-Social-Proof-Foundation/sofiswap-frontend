import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Footer } from '@/components/footer';
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
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto grid h-16 max-w-[90rem] grid-cols-[1fr_auto] items-center px-5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex w-fit items-center gap-2.5 font-satoshi" aria-label="SofiSwap home">
            <span className="relative block h-9 w-9 shrink-0">
              <Image src="/logo_dark.svg" alt="" width={36} height={36} className="h-9 w-9 dark:hidden" />
              <Image src="/logo_light.svg" alt="" width={36} height={36} className="hidden h-9 w-9 dark:block" />
            </span>
            <span className="text-[1.375rem] font-semibold tracking-tight text-foreground">SofiSwap</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#markets" className="transition-colors hover:text-foreground">Markets</a>
            <a href="#social-proof" className="transition-colors hover:text-foreground">Social proof</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          </nav>

          <Button asChild size="sm" className="justify-self-end h-9 rounded-md px-4">
            <Link href="/trade">
              Open exchange <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <ScrollSmootherWrapper>
        <LandingMotion>
          <div className="flex min-h-dvh flex-col bg-[hsl(var(--background))] pt-16 font-satoshi text-[hsl(var(--foreground))]">
            <main className="flex-1 overflow-x-hidden">
              <LandingHero />
              <LandingMarkets />
              <LandingLifecycle />
              <LandingClose />
            </main>
            <Footer />
          </div>
        </LandingMotion>
      </ScrollSmootherWrapper>
    </>
  );
}
