import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Themed 404. `notFound()` is called by the SPT deep-link routes, which previously fell
 * through to Next's unstyled default with no way back into the app.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold text-foreground">This page does not exist</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        The market, profile or post you followed may have been removed, or the link may be
        mistyped.
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Button asChild size="sm" className="h-8 rounded-lg px-3 text-xs">
          <Link href="/trade">Open exchange</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-lg px-3 text-xs">
          <Link href="/trade/spt">Browse Social Proof Tokens</Link>
        </Button>
      </div>
    </div>
  );
}
