import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function LandingMarkets() {
  return (
    <section
      id="markets"
      data-motion-section
      className="scroll-mt-24 border-b border-border/50 px-5 py-24 sm:px-8 sm:py-32"
    >
      <div className="mx-auto max-w-[90rem]">
        <div data-motion-reveal className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Two market systems
          </p>
          <h2 className="mt-5 text-[clamp(2.2rem,5vw,4.4rem)] font-medium leading-[0.95] tracking-[-0.05em]">
            One exchange for assets and attention.
          </h2>
        </div>

        <div className="mt-16 grid gap-16 lg:mt-24 lg:grid-cols-12 lg:gap-8">
          <article
            data-motion-reveal
            className="lg:col-span-7 lg:pr-10"
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Exchange</p>
            <h3 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Native spot order books
            </h3>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
              Deposit to a balance manager, place market or limit orders, cancel what is
              still open, and withdraw from the same workspace.
            </p>
            <Link
              href="/trade"
              className="mt-8 inline-flex items-center text-sm font-semibold text-primary hover:underline"
            >
              Explore exchange markets <ArrowRight className="ml-2 size-4" />
            </Link>

            <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-8 gap-y-6 border-t border-border/50 pt-8 text-sm">
              <div>
                <dt className="text-muted-foreground">Orders</dt>
                <dd className="mt-1 font-medium">Market and limit</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Custody</dt>
                <dd className="mt-1 font-medium">Wallet-signed</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Discovery</dt>
                <dd className="mt-1 font-medium">Automatic pools</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Quote pairs</dt>
                <dd className="mt-1 font-medium">MYSO, MYUSD</dd>
              </div>
            </dl>
          </article>

          <article
            id="social-proof"
            data-motion-reveal
            className="scroll-mt-24 border-t border-primary/25 pt-12 lg:col-span-5 lg:mt-28 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0"
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Social proof</p>
            <h3 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Profile + post tokens
            </h3>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Reserve MySo toward a published threshold, withdraw while the pool is
              open, then buy or sell against the live curve.
            </p>
            <Link
              href="/trade/spt"
              className="mt-8 inline-flex items-center text-sm font-semibold text-primary hover:underline"
            >
              Discover Social Proof Tokens <ArrowRight className="ml-2 size-4" />
            </Link>

            <div className="mt-10 space-y-4 text-sm">
              <div className="flex items-baseline justify-between gap-4 border-b border-border/40 pb-3">
                <span className="font-medium">grove</span>
                <span className="text-muted-foreground">Profile</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border/40 pb-3">
                <span className="font-medium">north-field</span>
                <span className="text-muted-foreground">Post</span>
              </div>
              <div className="flex items-baseline justify-between gap-4 pb-1">
                <span className="font-medium">kiln</span>
                <span className="text-muted-foreground">Profile</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
