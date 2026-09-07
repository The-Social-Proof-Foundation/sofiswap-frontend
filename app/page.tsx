import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  Check,
  Coins,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

const orderRows = [
  { price: '1.0034', size: '1,840', side: 'buy' },
  { price: '1.0028', size: '6,210', side: 'buy' },
  { price: '1.0019', size: '980', side: 'buy' },
  { price: '1.0041', size: '2,420', side: 'sell' },
  { price: '1.0057', size: '760', side: 'sell' },
  { price: '1.0082', size: '3,105', side: 'sell' },
] as const;

const lifecycle = [
  ['01', 'Enable', 'A profile or post owner opens its reservation pool.'],
  ['02', 'Reserve', 'Supporters reserve MySo toward the published threshold.'],
  ['03', 'Launch', 'The owner graduates a funded reservation pool on-chain.'],
  ['04', 'Trade', 'Holders buy and sell against the token’s curve.'],
] as const;

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background font-satoshi text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/45 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="SofiSwap home">
            <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
              <Coins className="size-4" strokeWidth={1.8} />
            </span>
            <span className="text-lg font-semibold tracking-[-0.04em]">SofiSwap</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#markets" className="transition-colors hover:text-foreground">Markets</a>
            <a href="#social-proof" className="transition-colors hover:text-foreground">Social proof</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          </nav>
          <Button asChild size="sm" className="rounded-full px-4">
            <Link href="/trade">Open exchange <ArrowRight className="ml-1.5 size-3.5" /></Link>
          </Button>
        </div>
      </header>

      <section className="relative border-b border-border/45">
        <Image
          src="/item1-light.png"
          alt=""
          width={160}
          height={160}
          className="pointer-events-none absolute -left-12 top-20 hidden opacity-20 lg:block"
          aria-hidden
        />
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-36">
          <div className="max-w-3xl">
            <p className="mb-7 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Native markets for MySocial
            </p>
            <h1 className="max-w-4xl text-5xl font-medium leading-[0.94] tracking-[-0.065em] sm:text-7xl lg:text-[5.8rem]">
              Trade the network. Back what matters.
            </h1>
            <p className="mt-8 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              SofiSwap brings spot order books and Social Proof Tokens into one wallet-signed
              exchange for the MySocial ecosystem.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6">
                <Link href="/trade">Start trading <ArrowRight className="ml-2 size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6">
                <Link href="/trade/spt"><Search className="mr-2 size-4" />Explore SPTs</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
              {['Wallet-signed execution', 'Profile + post tokens', 'Automatic market discovery'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-primary" />{item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="rounded-[2rem] border border-border/65 bg-card/65 p-3 shadow-[0_32px_90px_rgba(0,0,0,0.16)]">
              <div className="rounded-[1.45rem] border border-border/55 bg-background/80 p-5">
                <div className="flex items-start justify-between border-b border-border/45 pb-5">
                  <div>
                    <p className="text-xs text-muted-foreground">Illustrative order book · not live prices</p>
                    <p className="mt-1 text-xl font-semibold tracking-tight">MYSO / MYUSD</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg tabular-nums">1.0038</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-5">
                  <div>
                    <div className="mb-3 flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>Bid</span><span>Size</span>
                    </div>
                    {orderRows.filter((row) => row.side === 'buy').map((row) => (
                      <div key={row.price} className="flex justify-between border-t border-border/30 py-2 font-mono text-xs">
                        <span className="text-emerald-500">{row.price}</span><span>{row.size}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-3 flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>Ask</span><span>Size</span>
                    </div>
                    {orderRows.filter((row) => row.side === 'sell').map((row) => (
                      <div key={row.price} className="flex justify-between border-t border-border/30 py-2 font-mono text-xs">
                        <span className="text-rose-400">{row.price}</span><span>{row.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-500/12 px-4 py-3 text-center text-xs font-semibold text-emerald-500">Buy MYSO</div>
                  <div className="rounded-xl bg-rose-500/12 px-4 py-3 text-center text-xs font-semibold text-rose-400">Sell MYSO</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-7 -left-5 hidden rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-xl sm:block">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Social market</p>
              <p className="mt-1 text-sm font-semibold">Profile + post SPTs</p>
            </div>
          </div>
        </div>
      </section>

      <section id="markets" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Two market systems</p>
            <h2 className="mt-5 text-4xl font-medium leading-tight tracking-[-0.045em] sm:text-5xl">
              One exchange, built for assets and attention.
            </h2>
          </div>
          <div className="divide-y divide-border/50 border-y border-border/50">
            <article className="grid gap-5 py-8 sm:grid-cols-[3rem_1fr]">
              <BookOpen className="size-6 text-primary" strokeWidth={1.5} />
              <div>
                <h3 className="text-xl font-semibold tracking-tight">Native spot order books</h3>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  Deposit assets to a balance manager, place market or limit orders, cancel open
                  orders, and withdraw balances from the same trading workspace.
                </p>
              </div>
            </article>
            <article id="social-proof" className="grid gap-5 py-8 sm:grid-cols-[3rem_1fr]">
              <Users className="size-6 text-primary" strokeWidth={1.5} />
              <div>
                <h3 className="text-xl font-semibold tracking-tight">Social Proof Tokens</h3>
                <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                  Discover profile and post tokens, reserve MySo before launch, withdraw an open
                  reservation, then buy or sell live tokens against their on-chain curve.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border/45 bg-card/35">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">SPT lifecycle</p>
              <h2 className="mt-5 max-w-2xl text-4xl font-medium tracking-[-0.045em] sm:text-5xl">
                From signal to liquid market.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Only the owner can enable and launch a token. Supporters can withdraw open
              reservations before launch; reservation and trading fees apply.
            </p>
          </div>
          <div className="mt-14 grid border-l border-t border-border/55 sm:grid-cols-2 lg:grid-cols-4">
            {lifecycle.map(([number, title, copy]) => (
              <article key={number} className="min-h-52 border-b border-r border-border/55 p-6">
                <p className="font-mono text-xs text-primary">{number}</p>
                <h3 className="mt-10 text-2xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_.7fr] lg:items-center">
        <div>
          <ShieldCheck className="size-8 text-primary" strokeWidth={1.4} />
          <h2 className="mt-7 max-w-3xl text-4xl font-medium leading-tight tracking-[-0.05em] sm:text-6xl">
            Markets with social context, without leaving the chain behind.
          </h2>
        </div>
        <div className="lg:pl-10">
          <p className="leading-7 text-muted-foreground">
            Explore native markets alongside the profiles and posts behind Social Proof Tokens.
            Review pool activity and balances, then sign each transaction with your connected wallet.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 rounded-full px-6">
            <Link href="/trade">Enter SofiSwap <ArrowRight className="ml-2 size-4" /></Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/45">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} SofiSwap</p>
          <p>Decentralized exchange infrastructure for the MySocial ecosystem.</p>
        </div>
      </footer>
    </main>
  );
}
