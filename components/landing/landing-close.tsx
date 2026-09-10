import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function LandingClose() {
  return (
    <section data-motion-section className="px-5 py-24 sm:px-8 sm:py-28">
      <div
        data-motion-reveal
        className="relative mx-auto max-w-[90rem] overflow-hidden bg-primary px-7 py-16 text-primary-foreground sm:px-12 sm:py-20 lg:px-16"
      >
        <div className="absolute -right-24 -top-24 size-72 rounded-full border border-primary-foreground/15" aria-hidden />
        <div className="absolute -bottom-32 left-[20%] size-56 rounded-full border border-primary-foreground/10" aria-hidden />

        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
          <div>
            <h2 className="max-w-3xl text-[clamp(2rem,4.5vw,4rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
              Markets with social context, still on-chain.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 opacity-80">
              Review pool activity and balances, then sign each transaction with
              your connected wallet. No custodial buy box.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="h-12 rounded-full bg-[var(--background)] px-7 text-[var(--foreground)] hover:bg-[var(--background)]/90 active:scale-[0.98]"
            >
              <Link href="/trade">
                Enter SofiSwap <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-primary-foreground/35 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground active:scale-[0.98]"
            >
              <Link href="/trade/spt">
                <Search className="mr-2 size-4" />
                Explore SPTs
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
