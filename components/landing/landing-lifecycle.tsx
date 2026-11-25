const lifecycle = [
  {
    number: '01',
    title: 'Enable',
    copy: 'A profile or post owner opens a reservation pool.',
    note: 'Owner only',
  },
  {
    number: '02',
    title: 'Reserve',
    copy: 'Supporters reserve MySo toward the published threshold. Open reservations can be withdrawn.',
    note: 'Withdrawable',
  },
  {
    number: '03',
    title: 'Launch',
    copy: 'Once the threshold is met, the owner launches the token on-chain.',
    note: 'Owner only',
  },
  {
    number: '04',
    title: 'Trade',
    copy: 'Holders buy and sell against the token curve. Trading fees apply.',
    note: 'Live market',
  },
] as const;

export function LandingLifecycle() {
  return (
    <section
      id="how-it-works"
      data-motion-section
      className="scroll-mt-16 border-t border-border px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto grid max-w-[90rem] gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div data-motion-reveal className="max-w-md lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            From reservation to a live market.
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Only the owner can enable and launch a token. Supporters can withdraw
            open reservations before launch.
          </p>
        </div>

        <ol>
          {lifecycle.map((step) => (
            <li
              key={step.number}
              data-motion-reveal
              className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-border py-5"
            >
              <span className="font-mono text-xs text-muted-foreground">{step.number}</span>
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                  <span className="text-xs text-muted-foreground">{step.note}</span>
                </div>
                <p className="mt-1.5 max-w-lg text-sm leading-6 text-muted-foreground">{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
