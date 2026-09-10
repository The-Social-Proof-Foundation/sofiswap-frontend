const lifecycle = [
  {
    number: '01',
    title: 'Enable',
    copy: 'A profile or post owner opens its reservation pool.',
    note: 'Owner only',
  },
  {
    number: '02',
    title: 'Reserve',
    copy: 'Supporters reserve MySo toward the published threshold.',
    note: 'Withdrawable',
  },
  {
    number: '03',
    title: 'Launch',
    copy: 'The owner graduates a funded reservation pool on-chain.',
    note: 'Owner only',
  },
  {
    number: '04',
    title: 'Trade',
    copy: 'Holders buy and sell against the token’s curve.',
    note: 'Fees apply',
  },
] as const;

export function LandingLifecycle() {
  return (
    <section
      id="how-it-works"
      data-motion-section
      className="scroll-mt-24 border-y border-primary/20 bg-primary/[0.07] px-5 py-24 sm:px-8 sm:py-32"
    >
      <div className="mx-auto grid max-w-[90rem] gap-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
        <div data-motion-reveal className="max-w-md lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            SPT lifecycle
          </p>
          <h2 className="mt-5 text-[clamp(2.2rem,5vw,4.2rem)] font-medium leading-[0.95] tracking-[-0.05em]">
            From signal to liquid market.
          </h2>
          <p className="mt-6 text-base leading-7 text-muted-foreground">
            Only the owner can enable and launch a token. Supporters can withdraw
            open reservations before launch; reservation and trading fees apply.
          </p>
        </div>

        <ol className="relative space-y-0">
          {lifecycle.map((step, index) => (
            <li
              key={step.number}
              data-motion-reveal
              className="grid grid-cols-[auto_1fr] gap-5 border-t border-primary/20 py-8 sm:gap-8 sm:py-10"
            >
              <span className="font-mono text-sm text-primary">{step.number}</span>
              <div className={index % 2 === 1 ? 'sm:pl-12' : ''}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{step.title}</h3>
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {step.note}
                  </span>
                </div>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
                  {step.copy}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
