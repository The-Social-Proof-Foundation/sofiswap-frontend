import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function LandingMarkets() {
  return (
    <section
      id="markets"
      data-motion-section
      className="scroll-mt-16 border-b border-border px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto max-w-[90rem]">
        <div data-motion-reveal className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Markets
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Spot books and Social Proof Tokens.
          </h2>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <article data-motion-reveal>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">Native spot order books</h3>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Deposit to a balance manager, place market or limit orders, cancel open orders,
              and withdraw from the same workspace.
            </p>
            <dl className="mt-6 grid max-w-md grid-cols-2 gap-x-8 gap-y-4 border-t border-border pt-6 text-sm">
              <div>
                <dt className="text-muted-foreground">Orders</dt>
                <dd className="mt-1 font-medium text-foreground">Market and limit</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Custody</dt>
                <dd className="mt-1 font-medium text-foreground">Wallet-signed</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Discovery</dt>
                <dd className="mt-1 font-medium text-foreground">Automatic pools</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Quote pairs</dt>
                <dd className="mt-1 font-medium text-foreground">MYSO, MYUSD</dd>
              </div>
            </dl>
            <Link
              href="/trade"
              className="mt-6 inline-flex items-center text-sm font-medium text-foreground hover:underline"
            >
              Open the exchange <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </article>

          <article
            id="social-proof"
            data-motion-reveal
            className="scroll-mt-16 border-t border-border pt-10 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0"
          >
            <h3 className="text-xl font-semibold tracking-tight text-foreground">Social Proof Tokens</h3>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Profile and post tokens start as reservations. Supporters commit MySo toward a
              published threshold, and can withdraw before launch. After launch, the token
              trades on its curve.
            </p>
            <dl className="mt-6 space-y-0 border-t border-border text-sm">
              <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
                <dt className="font-medium text-foreground">Profile</dt>
                <dd className="text-muted-foreground">One token for a profile</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
                <dt className="font-medium text-foreground">Post</dt>
                <dd className="text-muted-foreground">One token for a post</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="font-medium text-foreground">Reservation</dt>
                <dd className="text-muted-foreground">Withdrawable until launch</dd>
              </div>
            </dl>
            <Link
              href="/trade/spt"
              className="mt-6 inline-flex items-center text-sm font-medium text-foreground hover:underline"
            >
              Browse Social Proof Tokens <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
