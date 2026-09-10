import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';

import { BrandArtifact, BrandMark, brandArtifacts } from '@/components/landing/landing-brand';
import { Button } from '@/components/ui/button';

const depth = [
  { price: '1.0034', size: '1,840', side: 'bid' },
  { price: '1.0028', size: '6,210', side: 'bid' },
  { price: '1.0041', size: '2,420', side: 'ask' },
  { price: '1.0057', size: '760', side: 'ask' },
] as const;

export function LandingHero() {
  return (
    <section
      data-landing-hero
      className="relative isolate overflow-hidden border-b border-border/50"
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" aria-hidden />
      <div
        data-hero-orbit
        className="absolute -right-[12%] top-[8%] -z-10 size-[36rem] rounded-full border border-primary/15 bg-primary/[0.05] will-change-transform sm:size-[46rem]"
        aria-hidden
      />
      <div
        className="absolute -left-[18%] bottom-[-12%] -z-10 size-[28rem] rounded-full border border-primary/10 bg-primary/[0.03]"
        aria-hidden
      />
      {brandArtifacts.map((artifact) => (
        <BrandArtifact key={artifact.path} {...artifact} />
      ))}

      <div className="mx-auto grid min-h-[100dvh] max-w-[90rem] items-center gap-16 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:pb-28 lg:pt-20">
        <div className="relative z-10 max-w-xl">
          <span data-hero-mark className="inline-block">
            <BrandMark className="size-12 sm:size-14" />
          </span>
          <p
            data-hero-kicker
            className="mt-8 text-xs font-semibold uppercase tracking-[0.26em] text-primary"
          >
            Native markets for MySocial
          </p>
          <h1 className="mt-5 text-[clamp(3.4rem,9vw,6.4rem)] font-semibold leading-[0.86] tracking-[-0.07em]">
            <span data-hero-word="sofi" className="inline-block">Sofi</span>
            <span data-hero-word="swap" className="inline-block text-primary">Swap</span>
          </h1>
          <p
            data-hero-tagline
            className="mt-7 max-w-[20ch] text-[clamp(1.65rem,3.4vw,2.75rem)] font-medium leading-[1.05] tracking-[-0.045em]"
          >
            Trade the network. Back what matters.
          </p>
          <p
            data-hero-copy
            className="mt-6 max-w-[42ch] text-base leading-7 text-muted-foreground sm:text-lg"
          >
            Spot order books and Social Proof Tokens in one wallet-signed exchange —
            native pairs beside the profiles and posts that fund them.
          </p>

          <div
            data-hero-actions
            className="mt-9 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row"
          >
            <Button asChild size="lg" className="h-12 rounded-full bg-[var(--primary)] px-7 text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 active:scale-[0.98]">
              <Link href="/trade">
                Start trading <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--background)_70%,transparent)] px-7 text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] active:scale-[0.98]"
            >
              <Link href="/trade/spt">
                <Search className="mr-2 size-4" />
                Explore SPTs
              </Link>
            </Button>
          </div>

          <ul
            data-hero-proof
            className="mt-10 space-y-2.5 text-sm text-muted-foreground"
          >
            {['Wallet-signed execution', 'Profile + post tokens', 'Automatic market discovery'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="h-px w-7 bg-primary/50" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          data-orderbook-preview
          className="relative z-10 will-change-transform lg:mt-16 lg:justify-self-end"
        >
          <div className="w-full max-w-md border border-primary/25 bg-[color-mix(in_srgb,var(--card)_88%,transparent)] p-5 shadow-[0_28px_70px_-28px_color-mix(in_srgb,var(--foreground)_28%,transparent)] backdrop-blur-md sm:p-6">
            <div className="flex items-end justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Sample depth
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight">MYSO / MYUSD</p>
              </div>
              <p className="font-mono text-2xl tabular-nums tracking-tight">1.0038</p>
            </div>
            <div className="mt-4 space-y-2 font-mono text-xs tabular-nums">
              {depth.map((row) => (
                <div key={row.price} className="grid grid-cols-[2.5rem_1fr_auto] gap-3">
                  <span className="uppercase tracking-wider text-muted-foreground">{row.side}</span>
                  <span className={row.side === 'bid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
                    {row.price}
                  </span>
                  <span>{row.size}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 mx-4 -mt-6 border border-primary/30 bg-[var(--background)] p-5 sm:mx-0 sm:-mr-6 sm:ml-16">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Reservation
            </p>
            <p className="mt-2 text-lg font-semibold tracking-tight">grove</p>
            <p className="mt-1 text-sm text-muted-foreground">Profile token · 184 of 256 MYSO</p>
            <div className="mt-4 h-1.5 overflow-hidden bg-primary/15" aria-hidden>
              <div className="h-full w-[72%] bg-primary" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Supporters reserve before the owner launches the curve.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
