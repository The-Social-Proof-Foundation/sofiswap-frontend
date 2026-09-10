'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, FileText, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, type UnderlineTabItem } from '@/components/ui/tabs';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePolledResource } from '@/hooks/usePolledResource';
import { fetchSptDirectory } from '@/lib/graphql/spt-directory';
import { useNetwork } from '@/lib/network-provider';
import { postDirectoryThumbUrl, profileDirectoryThumbUrl } from '@/lib/spt/media';
import { tradeSptPath, tradeSptPostPath } from '@/lib/trade-route-path';
import { cn } from '@/lib/utils';

function short(value: string) { return `${value.slice(0, 8)}…${value.slice(-6)}`; }

function DirectoryThumb({
  kind,
  src,
  alt,
}: {
  kind: 'profile' | 'post';
  src: string | null;
  alt: string;
}) {
  const shape = kind === 'profile' ? 'rounded-full' : 'rounded-[3.75px]';
  return (
    <span
      className={cn(
        'relative grid size-10 shrink-0 place-items-center overflow-hidden bg-primary/10 text-primary',
        shape
      )}
    >
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" unoptimized sizes="40px" />
      ) : kind === 'profile' ? (
        <UserRound className="size-4" />
      ) : (
        <FileText className="size-4" />
      )}
    </span>
  );
}

type DirectoryFilter = 'all' | 'profile' | 'post';

const DIRECTORY_FILTER_TABS: UnderlineTabItem[] = [
  { id: 'all', label: 'All' },
  { id: 'profile', label: 'Profiles' },
  { id: 'post', label: 'Posts' },
];

export function SptMarketDirectory() {
  const { currentNetwork } = useNetwork();
  const { displayAddress, isAuthenticated } = useMySocialAuth();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<DirectoryFilter>('all');
  const load = useCallback(() => fetchSptDirectory({ network: currentNetwork, offset: page * 50 }), [currentNetwork, page]);
  const { data, error, isLoading, revalidate } = usePolledResource(`${currentNetwork}:${page}`, load, 30_000);
  const rows = useMemo(() => {
    const profiles = (data?.profiles ?? []).map((p) => ({
      id: p.address, kind: 'profile' as const, title: p.displayName || p.username || short(p.address),
      detail: p.username ? `@${p.username}` : short(p.address), href: tradeSptPath(p.address),
      status: p.socialProofToken?.poolId || p.socialProofToken?.isActive ? 'Trading' : 'Reservations',
      thumbUrl: profileDirectoryThumbUrl(p.profilePhoto),
    }));
    const posts = (data?.posts ?? []).map((p) => ({
      id: p.postId, kind: 'post' as const, title: p.content.replace(/\s+/g, ' ').trim() || 'Untitled post',
      detail: p.ownerProfile?.username ? `@${p.ownerProfile.username}` : p.ownerProfile?.displayName || short(p.owner),
      href: tradeSptPostPath(p.postId), status: 'Enabled',
      thumbUrl: postDirectoryThumbUrl(p.mediaUrls, p.ownerProfile?.profilePhoto),
    }));
    return [...profiles, ...posts].filter((row) => filter === 'all' || row.kind === filter);
  }, [data, filter]);
  return (
    <section className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain font-satoshi">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Social markets</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Social Proof Tokens</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Explore enabled profile and post tokens. Reserve before launch or trade live tokens. Use the search in the header to find a profile, post, or wallet.</p></div>
          {isAuthenticated && displayAddress ? <Button asChild variant="outline" className="rounded-full"><Link href={tradeSptPath(displayAddress)}>Manage my profile <ArrowRight className="ml-2 size-4" /></Link></Button> : null}
        </div>
        <div className="mt-8">
          <Tabs
            tabs={DIRECTORY_FILTER_TABS}
            activeTab={filter}
            onTabChange={(id) => {
              setFilter(id as DirectoryFilter);
              setPage(0);
            }}
            aria-label="Token types"
            listClassName="w-fit gap-3 pb-1"
            triggerClassName="px-2 py-1 font-medium"
          />
        </div>
        <div className="mt-6 divide-y divide-trade-shell border-y border-trade-shell">
          {error ? <div className="py-12 text-center" role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={revalidate} className="mt-4">Try again</Button></div>
            : !data && isLoading ? <p className="py-12 text-center text-sm text-muted-foreground" role="status">Loading enabled Social Proof Tokens…</p>
              : rows.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{data?.hasNext ? 'No enabled Social Proof Tokens on this page. Try the next page.' : 'No enabled Social Proof Tokens to show on this page yet.'}</p>
                : rows.map((row) => (
                  <Link key={`${row.kind}:${row.id}`} href={row.href} className="group flex min-w-0 items-center gap-3 py-4 transition-colors hover:bg-muted/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:gap-4">
                    <DirectoryThumb kind={row.kind} src={row.thumbUrl} alt="" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{row.detail} · {row.kind === 'profile' ? 'Profile' : 'Post'}</span></span>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px]', row.status === 'Trading' ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground')}>{row.status}</span>
                    <ArrowRight className="mr-1 hidden size-4 shrink-0 text-muted-foreground group-hover:text-foreground sm:block" />
                  </Link>
                ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Page {page + 1} · {rows.length} shown</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || isLoading} onClick={() => setPage((n) => n - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={!data?.hasNext || isLoading} onClick={() => setPage((n) => n + 1)}>Next</Button></div>
        </div>
      </div>
    </section>
  );
}
